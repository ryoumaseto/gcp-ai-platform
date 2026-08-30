const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const tar = require('tar');
const { Storage } = require('@google-cloud/storage');
const { CloudBuildClient } = require('@google-cloud/cloudbuild');
const { GoogleAuth } = require('google-auth-library');

/**
 * 生成されたアプリを Cloud Run にデプロイする。
 *
 * 流れ:
 *   ファイル書き出し → tar.gz → GCS へアップロード
 *   → Cloud Build でイメージ化 → Cloud Run にデプロイ → URL を返す
 *
 * Cloud Run のコンテナ内では Docker が使えないため、ビルドは Cloud Build に任せる。
 *
 * ここで扱うのは AI が生成した任意のコードなので、実行環境は徹底的に隔離する:
 *   - 権限を一切持たないサービスアカウントで動かす（GENERATED_APP_SA）
 *   - VPC コネクタを付けない（Cloud SQL や内部ネットワークに到達させない）
 *   - リソース上限と最大インスタンス数を絞る
 */

const getProjectId = () => process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const getRegion = () => process.env.GCP_REGION || 'asia-northeast1';
const getSourceBucket = () => process.env.GENERATED_SOURCE_BUCKET;
const getGeneratedSA = () => process.env.GENERATED_APP_SA;
const getImageRepo = () => process.env.GENERATED_IMAGES_REPO || 'app-gen-generated';
const getBuildSA = () => process.env.CLOUD_BUILD_SA;

// 生成アプリの Cloud Run サービス名。ジョブ ID から決まるので、
// 再デプロイや削除のときに DB を引かずに導出できる。
// Cloud Run の名前は 49 文字以内・英小文字始まりという制約がある。
function serviceNameForJob(jobId) {
  return `gen-${String(jobId).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 40)}`;
}

/**
 * 生成物を格納する Dockerfile を組み立てる。
 * 言語ごとにベースイメージと起動方法が違うため、ここで吸収する。
 */
function buildDockerfile({ language, port, startCommand, files }) {
  const has = (p) => files.some((f) => f.path === p);
  const lang = String(language || '').toLowerCase();

  if (lang.includes('python')) {
    const install = has('requirements.txt')
      ? 'RUN pip install --no-cache-dir -r requirements.txt'
      : '# requirements.txt なし';
    const cmd = startCommand || 'python main.py';
    return `FROM python:3.12-slim
WORKDIR /app
COPY . .
${install}
ENV PORT=${port}
EXPOSE ${port}
CMD ${JSON.stringify(['sh', '-c', cmd])}
`;
  }

  if (lang.includes('go')) {
    const cmd = startCommand || './server';
    return `FROM golang:1.23-alpine AS build
WORKDIR /src
COPY . .
RUN go mod tidy 2>/dev/null || true
RUN go build -o /server ./... || go build -o /server .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /server ./server
ENV PORT=${port}
EXPOSE ${port}
CMD ${JSON.stringify(['sh', '-c', cmd])}
`;
  }

  // 既定は Node.js（TypeScript 生成物もここに乗せる）
  //
  // devDependencies を含めて入れる。TypeScript のコンパイラやバンドラは
  // devDependency に置かれるのが普通で、--omit=dev で入れると
  // ビルドが走らず dist/ が生成されないまま npm start に到達し、
  // "Cannot find module '/app/dist/index.js'" でコンテナが起動しない。
  // ビルド後に prune して本番依存だけ残す。
  //
  // lock ファイルの有無に関わらず動くよう install を使う
  // （生成物に lock は無いことが多く、npm ci は失敗する）。
  const steps = has('package.json')
    ? [
        'RUN npm install --no-audit --no-fund',
        // tsconfig.json の有無ではなく package.json の build スクリプトを基準にする。
        // ビルドが必要かを知っているのは生成物自身であり、設定ファイルの
        // 有無で推測すると取りこぼす。
        'RUN npm run build --if-present',
        // prune はしない。生成物が実行時に何を必要とするかは事前に分からず、
        // 実際に start が ts-node（devDependency）を呼ぶ構成で
        // "sh: ts-node: not found" になった。
        // イメージは多少大きくなるが、生成アプリは短命なので影響は小さい。
      ]
    : ['# package.json なし'];

  const cmd = startCommand || (has('package.json') ? 'npm start' : 'node index.js');

  return `FROM node:20-alpine
WORKDIR /app
COPY . .
${steps.join('\n')}
ENV PORT=${port}
EXPOSE ${port}
CMD ${JSON.stringify(['sh', '-c', cmd])}
`;
}

/**
 * ファイル群をローカルの一時ディレクトリへ書き出す。
 * パスの安全性はパーサ側で検証済みだが、書き出し先が
 * 一時ディレクトリの外へ出ないことをここでも確認する（多層防御）。
 */
async function writeFiles(dir, files) {
  for (const file of files) {
    const dest = path.resolve(dir, file.path);

    if (!dest.startsWith(path.resolve(dir) + path.sep)) {
      throw new Error(`書き出し先がディレクトリ外を指しています: ${file.path}`);
    }

    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, file.content, 'utf8');
  }
}

/**
 * ソース一式を tar.gz にして GCS へ置く。Cloud Build はここを読む。
 */
async function uploadSource({ dir, objectName }) {
  const bucket = getSourceBucket();
  if (!bucket) throw new Error('GENERATED_SOURCE_BUCKET is not configured');

  const archive = path.join(os.tmpdir(), `${objectName.replace(/\//g, '_')}`);
  await tar.create({ gzip: true, cwd: dir, file: archive }, ['.']);

  const storage = new Storage({ projectId: getProjectId() });
  await storage.bucket(bucket).upload(archive, { destination: objectName });
  await fs.rm(archive, { force: true });

  return { bucket, object: objectName };
}

// google.devtools.cloudbuild.v1.Build.Status の数値対応。
// 失敗時に "status=4" とだけ出ても原因が分からないので、名前に直して報告する。
const BUILD_STATUS = {
  0: 'STATUS_UNKNOWN',
  1: 'QUEUED',
  2: 'WORKING',
  3: 'SUCCESS',
  4: 'FAILURE',
  5: 'INTERNAL_ERROR',
  6: 'TIMEOUT',
  7: 'CANCELLED',
  9: 'EXPIRED',
  10: 'PENDING',
};

function isBuildSuccess(status) {
  return status === 'SUCCESS' || status === 3;
}

function describeBuildStatus(status) {
  const name = typeof status === 'number' ? BUILD_STATUS[status] || String(status) : status;
  return `status=${name}`;
}

/**
 * Cloud Build でイメージをビルドして Artifact Registry へ push する。
 * 完了まで待つ（バックグラウンドジョブから呼ばれるのでブロックして問題ない）。
 */
async function buildImage({ source, imageUri, timeoutSeconds = 900 }) {
  const client = new CloudBuildClient({ projectId: getProjectId() });

  const buildSA = getBuildSA();
  if (!buildSA) throw new Error('CLOUD_BUILD_SA is not configured');

  const [operation] = await client.createBuild({
    projectId: getProjectId(),
    build: {
      source: {
        storageSource: { bucket: source.bucket, object: source.object },
      },
      steps: [
        {
          name: 'gcr.io/cloud-builders/docker',
          args: ['build', '-t', imageUri, '.'],
        },
      ],
      images: [imageUri],
      timeout: { seconds: timeoutSeconds },
      // 実行 SA を明示する。省略すると Compute Engine のデフォルト SA が
      // 使われるが、それは他用途と共有され権限も把握しづらい。
      // 専用 SA なら「ログ書き込み・イメージ push・ソース読み取り」だけに絞れる。
      serviceAccount: `projects/${getProjectId()}/serviceAccounts/${buildSA}`,
      // 専用 SA を使う場合、ログの出力先を明示しないとビルドが弾かれる
      options: { logging: 'CLOUD_LOGGING_ONLY' },
    },
  });

  const [build] = await operation.promise();

  // gRPC クライアントは status を数値 enum で返す（3 = SUCCESS）。
  // 文字列比較だけだと成功を失敗と誤判定するため、両方を受け付ける。
  if (!isBuildSuccess(build.status)) {
    throw new Error(
      `Cloud Build が失敗しました (${describeBuildStatus(build.status)})` +
        `${build.statusDetail ? `: ${build.statusDetail}` : ''}` +
        `${build.logUrl ? ` ログ: ${build.logUrl}` : ''}`
    );
  }

  return build;
}

/**
 * Cloud Run へデプロイして URL を返す。
 *
 * REST を直接叩いている。@google-cloud/run を足すこともできるが、
 * 依存を増やさずに済む程度の呼び出し量であり、
 * 認証は既に使っている GoogleAuth をそのまま流用できる。
 */
async function deployToCloudRun({ serviceName, imageUri, port }) {
  const project = getProjectId();
  const region = getRegion();
  const sa = getGeneratedSA();

  if (!sa) throw new Error('GENERATED_APP_SA is not configured');

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();

  const parent = `projects/${project}/locations/${region}`;
  const base = `https://${region}-run.googleapis.com/v2`;

  const body = {
    template: {
      // 権限ゼロの SA。生成コードから GCP リソースへ到達させない。
      serviceAccount: sa,
      // VPC コネクタは付けない。Cloud SQL や内部ネットワークから隔離する。
      maxInstanceRequestConcurrency: 80,
      timeout: '60s',
      scaling: { maxInstanceCount: 2 },
      containers: [
        {
          image: imageUri,
          ports: [{ containerPort: port }],
          resources: { limits: { cpu: '1', memory: '512Mi' } },
          // 既定の起動プローブは短く、フレームワークの初期化が間に合わずに
          // 起動失敗と判定されることがある。生成物の中身は選べないので余裕を持たせる。
          startupProbe: {
            tcpSocket: { port },
            initialDelaySeconds: 5,
            timeoutSeconds: 5,
            periodSeconds: 5,
            failureThreshold: 24,
          },
        },
      ],
    },
    // 生成アプリは誰でも見られる想定
    ingress: 'INGRESS_TRAFFIC_ALL',
  };

  // 既存があれば更新、無ければ作成
  let exists = true;
  try {
    await client.request({ url: `${base}/${parent}/services/${serviceName}` });
  } catch (error) {
    if (error.response?.status === 404) exists = false;
    else throw error;
  }

  const res = exists
    ? await client.request({
        url: `${base}/${parent}/services/${serviceName}`,
        method: 'PATCH',
        data: body,
      })
    : await client.request({
        url: `${base}/${parent}/services?serviceId=${serviceName}`,
        method: 'POST',
        data: body,
      });

  await waitForOperation(client, res.data);

  // 未認証アクセスを許可する（生成アプリを URL で共有できるようにするため）
  await client.request({
    url: `${base}/${parent}/services/${serviceName}:setIamPolicy`,
    method: 'POST',
    data: {
      policy: { bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] },
    },
  });

  const detail = await client.request({ url: `${base}/${parent}/services/${serviceName}` });
  return detail.data.uri;
}

/**
 * Cloud Run の長時間オペレーションを完了まで待つ。
 */
async function waitForOperation(client, operation, timeoutMs = 300000) {
  if (!operation || operation.done || !operation.name) return operation;

  const deadline = Date.now() + timeoutMs;
  const url = `https://${getRegion()}-run.googleapis.com/v2/${operation.name}`;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const { data } = await client.request({ url });

    if (data.done) {
      if (data.error) {
        throw new Error(`Cloud Run のデプロイに失敗しました: ${data.error.message}`);
      }
      return data;
    }
  }

  throw new Error('Cloud Run のデプロイがタイムアウトしました');
}

/**
 * 生成されたアプリをデプロイして URL を返す。
 *
 * @param {object} params
 * @param {string} params.jobId
 * @param {Array<{path:string,content:string}>} params.files
 * @param {number} params.port
 * @param {string|null} params.startCommand
 * @param {string} params.language
 * @param {(message:string, progress?:number)=>Promise<void>} [params.onProgress]
 * @returns {Promise<{success:boolean, url?:string, error?:string}>}
 */
async function deployGeneratedApp({ jobId, files, port, startCommand, language, onProgress }) {
  const notify = async (message, progress) => {
    console.log(`[${jobId}] ${message}`);
    if (onProgress) await onProgress(message, progress);
  };

  let workDir;

  try {
    if (!getProjectId()) throw new Error('GCP_PROJECT_ID is not configured');

    const serviceName = serviceNameForJob(jobId);
    const imageUri =
      `${getRegion()}-docker.pkg.dev/${getProjectId()}/${getImageRepo()}/${serviceName}:${Date.now()}`;

    await notify('ソースを準備しています', 88);
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), `gen-${serviceName}-`));
    await writeFiles(workDir, files);
    await fs.writeFile(
      path.join(workDir, 'Dockerfile'),
      buildDockerfile({ language, port, startCommand, files }),
      'utf8'
    );

    await notify('ソースをアップロードしています', 90);
    const source = await uploadSource({
      dir: workDir,
      objectName: `${serviceName}/${Date.now()}.tar.gz`,
    });

    await notify('イメージをビルドしています', 92);
    await buildImage({ source, imageUri });

    await notify('Cloud Run にデプロイしています', 96);
    const url = await deployToCloudRun({ serviceName, imageUri, port });

    await notify(`デプロイ完了: ${url}`, 100);
    return { success: true, url };
  } catch (error) {
    console.error(`[${jobId}] デプロイ失敗:`, error.message);
    return { success: false, error: error.message };
  } finally {
    if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * ジョブ削除時に、生成アプリの Cloud Run サービスも消す。
 * 消し忘れると課金され続けるうえ、削除したはずのアプリが公開され続ける。
 */
async function deleteGeneratedApp(jobId) {
  try {
    const project = getProjectId();
    if (!project) return { success: false, error: 'GCP_PROJECT_ID is not configured' };

    const serviceName = serviceNameForJob(jobId);
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();

    await client.request({
      url: `https://${getRegion()}-run.googleapis.com/v2/projects/${project}/locations/${getRegion()}/services/${serviceName}`,
      method: 'DELETE',
    });

    return { success: true };
  } catch (error) {
    // 元々存在しない場合は成功扱い（ジョブ削除自体は妨げない）
    if (error.response?.status === 404) return { success: true };

    console.error(`[${jobId}] 生成アプリの削除に失敗:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  isBuildSuccess,
  describeBuildStatus,
  deployGeneratedApp,
  deleteGeneratedApp,
  serviceNameForJob,
  buildDockerfile,
};
