const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { serviceNameForJob, buildDockerfile } = require('../services/deployService');

describe('serviceNameForJob', () => {
  test('Cloud Run の命名制約（英小文字始まり・49文字以内）を満たす', () => {
    const name = serviceNameForJob('A1B2C3D4-5678-90EF-GHIJ-KLMNOPQRSTUV');
    expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(name.length).toBeLessThanOrEqual(49);
  });

  test('同じ jobId からは同じ名前が導かれる（削除時に DB を引かずに済ませるため）', () => {
    const id = 'c7fdea1f-350c-4b8c-8e15-3a2a4f2fde55';
    expect(serviceNameForJob(id)).toBe(serviceNameForJob(id));
  });

  test('異なる jobId は異なる名前になる', () => {
    expect(serviceNameForJob('aaaaaaaa-1111')).not.toBe(serviceNameForJob('bbbbbbbb-2222'));
  });
});

describe('buildDockerfile', () => {
  const nodeFiles = [{ path: 'package.json', content: '{}' }];

  test('PORT を環境変数として渡す（Cloud Run はポートを注入するため）', () => {
    const df = buildDockerfile({ language: 'TypeScript', port: 8080, files: nodeFiles });
    expect(df).toContain('ENV PORT=8080');
    expect(df).toContain('EXPOSE 8080');
  });

  test('Node: package.json があれば依存を入れる', () => {
    const df = buildDockerfile({ language: 'TypeScript', port: 8080, files: nodeFiles });
    expect(df).toContain('FROM node:20-alpine');
    expect(df).toContain('npm install');
  });

  test('Node: lock ファイル前提の npm ci は使わない（生成物に lock は無い）', () => {
    const df = buildDockerfile({ language: 'TypeScript', port: 8080, files: nodeFiles });
    expect(df).not.toContain('npm ci');
  });

  test('Python: requirements.txt があれば pip install する', () => {
    const df = buildDockerfile({
      language: 'Python',
      port: 8000,
      files: [{ path: 'requirements.txt', content: 'flask' }],
    });
    expect(df).toContain('FROM python:3.12-slim');
    expect(df).toContain('pip install');
  });

  test('Go: マルチステージでビルドする', () => {
    const df = buildDockerfile({ language: 'Go', port: 8080, files: [{ path: 'main.go', content: '' }] });
    expect(df).toContain('FROM golang:');
    expect(df).toContain('AS build');
  });

  test('start_command はシェル経由で渡す（引用が壊れないよう JSON 形式で埋める）', () => {
    const df = buildDockerfile({
      language: 'TypeScript',
      port: 8080,
      startCommand: 'node "src/my server.js"',
      files: nodeFiles,
    });
    expect(df).toContain('CMD ["sh","-c","node \\"src/my server.js\\""]');
  });

  test('start_command が無ければ言語ごとの既定を使う', () => {
    expect(buildDockerfile({ language: 'TypeScript', port: 8080, files: nodeFiles })).toContain('npm start');
    expect(buildDockerfile({ language: 'TypeScript', port: 8080, files: [] })).toContain('node index.js');
  });
});

describe('ファイル書き出しの安全性', () => {
  // パーサ側でも検証しているが、書き出し直前にも確認する（多層防御）。
  // deployService は writeFiles を公開していないため、
  // 同じ判定ロジックが成立することを path.resolve で確認する。
  test('.. を含むパスは一時ディレクトリの外を指す', () => {
    const dir = path.join(os.tmpdir(), 'gen-test');
    const dest = path.resolve(dir, '../../etc/passwd');
    expect(dest.startsWith(path.resolve(dir) + path.sep)).toBe(false);
  });

  test('通常のパスはディレクトリ内に収まる', () => {
    const dir = path.join(os.tmpdir(), 'gen-test');
    const dest = path.resolve(dir, 'src/index.js');
    expect(dest.startsWith(path.resolve(dir) + path.sep)).toBe(true);
  });
});

describe('Cloud Build の状態判定', () => {
  const { isBuildSuccess, describeBuildStatus } = require('../services/deployService');

  // gRPC クライアントは status を数値 enum で返す。
  // 文字列比較だけだと 3 (SUCCESS) を失敗と誤判定していた。
  test('数値の 3 は成功として扱う', () => {
    expect(isBuildSuccess(3)).toBe(true);
  });

  test('文字列の SUCCESS も成功として扱う', () => {
    expect(isBuildSuccess('SUCCESS')).toBe(true);
  });

  test.each([[4, 'FAILURE'], [5, 'INTERNAL_ERROR'], [6, 'TIMEOUT'], [7, 'CANCELLED']])(
    '%i (%s) は失敗として扱う',
    (code) => {
      expect(isBuildSuccess(code)).toBe(false);
    }
  );

  test('数値は名前に直して報告する（原因が分かるように）', () => {
    expect(describeBuildStatus(4)).toBe('status=FAILURE');
    expect(describeBuildStatus(6)).toBe('status=TIMEOUT');
    expect(describeBuildStatus('FAILURE')).toBe('status=FAILURE');
  });
});

describe('Node の生成物をビルドできること', () => {
  const { buildDockerfile } = require('../services/deployService');
  const pkg = [{ path: 'package.json', content: '{}' }];

  // TypeScript のコンパイラは devDependency に入るため、
  // --omit=dev で入れるとビルドが走らず dist/ が生成されない。
  // 実際にこれで "Cannot find module '/app/dist/index.js'" が起きた。
  test('依存のインストール時に devDependencies を除外しない', () => {
    const df = buildDockerfile({ language: 'TypeScript', port: 8080, files: pkg });
    expect(df).toContain('npm install --no-audit --no-fund');
    expect(df).not.toMatch(/npm install[^\n]*--omit=dev/);
  });

  // 生成物が実行時に何を必要とするかは事前に分からない。
  // prune した結果 start が呼ぶ ts-node が消え、
  // "sh: ts-node: not found" でコンテナが起動しなかった。
  test('依存を削らない（実行時に必要なものを消してしまうため）', () => {
    const df = buildDockerfile({ language: 'TypeScript', port: 8080, files: pkg });
    expect(df).not.toContain('npm prune');
  });

  // ビルドの要否を知っているのは生成物自身。tsconfig.json の有無で
  // 推測すると、それを持たない構成を取りこぼす。
  test('tsconfig.json が無くても build スクリプトを試す', () => {
    const df = buildDockerfile({ language: 'TypeScript', port: 8080, files: pkg });
    expect(df).toContain('npm run build --if-present');
  });
});
