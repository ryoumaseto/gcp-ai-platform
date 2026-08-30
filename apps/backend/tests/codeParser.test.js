/**
 * codeParser のユニットテスト
 *
 * codeParser は Gemini（信頼できない外部 AI）の出力を Cloud Run に
 * デプロイするファイル群へ変換する境界であるため、正常系だけでなく
 * 悪意・壊れた入力に対する拒否を重点的に検証する。
 */

const { parseGeneratedCode } = require('../services/codeParser');

// テストで繰り返し使う最小マニフェスト
const minimalManifest = {
  files: [
    { path: 'package.json', content: '{"name":"app"}' },
    { path: 'src/index.js', content: 'console.log("hi");' },
  ],
  port: 3000,
  start_command: 'node src/index.js',
};

const wrapJsonFence = (obj) => '```json\n' + JSON.stringify(obj, null, 2) + '\n```';

describe('parseGeneratedCode', () => {
  describe('正常系', () => {
    test('```json フェンス付きの入力を解析できる', () => {
      const result = parseGeneratedCode(wrapJsonFence(minimalManifest));

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toEqual({ path: 'package.json', content: '{"name":"app"}' });
      expect(result.port).toBe(3000);
      expect(result.startCommand).toBe('node src/index.js');
    });

    test('フェンスなし（生の JSON のみ）を解析できる', () => {
      const raw = JSON.stringify(minimalManifest);
      const result = parseGeneratedCode(raw);

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
    });

    test('前後に散文がある場合でも JSON 部分だけを解析できる', () => {
      const raw =
        'この度は、TypeScript を使用した実装です。以下がマニフェストになります。\n\n' +
        wrapJsonFence(minimalManifest) +
        '\n\n以上、ご確認よろしくお願いいたします。';

      const result = parseGeneratedCode(raw);

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
    });

    test('フェンスなし・前後に散文がある場合は最初の { 〜 最後の } を使う', () => {
      const raw = `前置きの説明文です。\n${JSON.stringify(minimalManifest)}\n後書きの説明文です。`;

      const result = parseGeneratedCode(raw);

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
    });

    test('port が未指定の場合は 8080 が既定値になる', () => {
      const manifest = { files: [{ path: 'a.js', content: 'x' }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(true);
      expect(result.port).toBe(8080);
    });

    test('start_command が未指定の場合は null になる', () => {
      const manifest = { files: [{ path: 'a.js', content: 'x' }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(true);
      expect(result.startCommand).toBeNull();
    });
  });

  describe('壊れた JSON', () => {
    test('JSON として解析できない文字列は失敗する', () => {
      const result = parseGeneratedCode('```json\n{ "files": [ this is not json\n```');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('{ や } が全く含まれない文字列は失敗する', () => {
      const result = parseGeneratedCode('ただの散文で、コードもJSONもありません。');

      expect(result.success).toBe(false);
    });

    test('トップレベルが配列の場合は失敗する', () => {
      const result = parseGeneratedCode(wrapJsonFence([{ path: 'a.js', content: 'x' }]));

      expect(result.success).toBe(false);
    });

    test('トップレベルが null の場合は失敗する', () => {
      const result = parseGeneratedCode('```json\nnull\n```');

      expect(result.success).toBe(false);
    });
  });

  describe('files フィールドの検証', () => {
    test('files が存在しない場合は失敗する', () => {
      const result = parseGeneratedCode(wrapJsonFence({ port: 8080 }));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/files/);
    });

    test('files が配列でない場合は失敗する', () => {
      const result = parseGeneratedCode(wrapJsonFence({ files: 'not-an-array' }));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/files/);
    });

    test('files が空配列の場合は失敗する', () => {
      const result = parseGeneratedCode(wrapJsonFence({ files: [] }));

      expect(result.success).toBe(false);
    });
  });

  describe('パストラバーサル・危険なパスの拒否', () => {
    test.each([
      ['../../etc/passwd', 'ディレクトリトラバーサル'],
      ['/etc/passwd', '絶対パス'],
      ['a/../../b', 'ディレクトリトラバーサル（中間）'],
      ['C:\\Windows\\System32\\evil.dll', 'Windows ドライブレター'],
      ['C:/Windows/evil.dll', 'Windows ドライブレター（スラッシュ）'],
      ['', '空文字'],
      ['src/', 'ディレクトリのみ'],
      ['.', 'カレントディレクトリのみ'],
    ])('%s を拒否する（%s）', (badPath) => {
      const manifest = { files: [{ path: badPath, content: 'x' }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('null バイトを含むパスを拒否する', () => {
      // JSON.stringify は \u0000 をエスケープしてくれるので生成物にそのまま使える
      const manifest = { files: [{ path: 'a\u0000.js', content: 'x' }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/null バイト/);
    });

    test('255 文字を超えるパスを拒否する', () => {
      const longPath = 'a'.repeat(256) + '.js';
      const manifest = { files: [{ path: longPath, content: 'x' }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/長すぎ/);
    });

    test('255 文字ちょうどのパスは許可する', () => {
      const okPath = 'a'.repeat(252) + '.js'; // 255 文字
      expect(okPath.length).toBe(255);
      const manifest = { files: [{ path: okPath, content: 'x' }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(true);
    });
  });

  describe('サイズ制限', () => {
    test('ファイル数が上限（40）を超えると失敗する', () => {
      const files = Array.from({ length: 41 }, (_, i) => ({ path: `f${i}.js`, content: 'x' }));
      const result = parseGeneratedCode(wrapJsonFence({ files }));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ファイル数/);
    });

    test('ファイル数がちょうど 40 なら許可する', () => {
      const files = Array.from({ length: 40 }, (_, i) => ({ path: `f${i}.js`, content: 'x' }));
      const result = parseGeneratedCode(wrapJsonFence({ files }));

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(40);
    });

    test('単一ファイルが 100KB を超えると失敗する', () => {
      const bigContent = 'a'.repeat(100 * 1024 + 1);
      const manifest = { files: [{ path: 'big.txt', content: bigContent }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ファイルサイズ/);
    });

    test('合計サイズが 2MB を超えると失敗する（単一ファイルは上限内）', () => {
      // 各ファイルは 100KB 未満に収めつつ、合計で 2MB(=2,097,152 バイト) を
      // 超えるように 36 ファイル x 60,000 バイト = 2,160,000 バイトにする。
      const chunk = 'a'.repeat(60000);
      const files = Array.from({ length: 36 }, (_, i) => ({ path: `f${i}.txt`, content: chunk }));
      const raw = JSON.stringify({ files });

      const result = parseGeneratedCode(raw);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/合計ファイルサイズ/);
    });
  });

  describe('重複パス', () => {
    test('同一パスが複数回出てくると失敗する', () => {
      const manifest = {
        files: [
          { path: 'src/index.js', content: 'a' },
          { path: 'src/index.js', content: 'b' },
        ],
      };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/重複/);
    });

    test('"./a.js" と "a.js" は表記ゆれとして重複扱いする', () => {
      const manifest = {
        files: [
          { path: './a.js', content: 'a' },
          { path: 'a.js', content: 'b' },
        ],
      };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/重複/);
    });
  });

  describe('content の型検証', () => {
    test('content が数値の場合は失敗する', () => {
      const manifest = { files: [{ path: 'a.js', content: 12345 }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/content/);
    });

    test('content がオブジェクトの場合は失敗する', () => {
      const manifest = { files: [{ path: 'a.js', content: { foo: 'bar' } }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/content/);
    });

    test('content が null の場合は失敗する', () => {
      const manifest = { files: [{ path: 'a.js', content: null }] };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
    });
  });

  describe('port の検証', () => {
    test('port が 0 の場合は失敗する', () => {
      const manifest = { files: [{ path: 'a.js', content: 'x' }], port: 0 };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/port/);
    });

    test('port が 65536 の場合は失敗する', () => {
      const manifest = { files: [{ path: 'a.js', content: 'x' }], port: 65536 };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
    });

    test('port が 65535 の場合は許可する', () => {
      const manifest = { files: [{ path: 'a.js', content: 'x' }], port: 65535 };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(true);
      expect(result.port).toBe(65535);
    });

    test('port が整数でない（小数）場合は失敗する', () => {
      const manifest = { files: [{ path: 'a.js', content: 'x' }], port: 8080.5 };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
    });

    test('port が文字列の場合は失敗する', () => {
      const manifest = { files: [{ path: 'a.js', content: 'x' }], port: '8080' };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
    });
  });

  describe('start_command の検証', () => {
    test('start_command が文字列でない場合は失敗する', () => {
      const manifest = { files: [{ path: 'a.js', content: 'x' }], start_command: 123 };
      const result = parseGeneratedCode(wrapJsonFence(manifest));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/start_command/);
    });
  });
});
