const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 全ソースの構文を検証する。
//
// geminiService.js のテンプレートリテラルにバックティックを混入させて
// 構文を壊したとき、そのスイートが「読み込み失敗」になるだけで
// 他のテストは通り続け、総数が 91 → 74 に減ったことにしか現れなかった。
//
// require ではなく node --check を使う。require だと sequelize などの
// 依存まで読み込んでしまい、Jest の ESM 非対応で別の理由で落ちる。
// ここで見たいのは自分たちのコードの構文だけ。
const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'coverage', 'tests', '.git']);

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = collect(ROOT);

describe('ソースの構文', () => {
  test('検査対象が存在する', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  test.each(files.map((f) => [path.relative(ROOT, f), f]))('%s', (_rel, full) => {
    expect(() => execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' })).not.toThrow();
  });
});
