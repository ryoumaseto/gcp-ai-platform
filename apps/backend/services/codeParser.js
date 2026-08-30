/**
 * Gemini が生成した JSON マニフェスト（buildCodeGenerationPrompt の出力）を
 * 検証済みのファイル配列に変換するパーサ。
 *
 * 入力は AI が生成した任意の文字列であり、フォーマット崩れ・悪意ある
 * パス・過大なサイズなど何が来てもおかしくない。ここで弾かなかった内容は
 * そのまま Cloud Run コンテナのファイルシステムに書き出されるため、
 * ディレクトリトラバーサルやリソース枯渇を防ぐ検証を必ず通す。
 */

// サイズ上限。buildCodeGenerationPrompt でも同じ数値を要求しているが、
// AI が指示を守るとは限らないため、パーサ側でも独立して強制する。
const MAX_FILES = 40;
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const MAX_TOTAL_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_PATH_LENGTH = 255;
const DEFAULT_PORT = 8080;

/**
 * レスポンス本文から JSON 文字列を取り出す。
 * ```json フェンスを優先し、無ければ最初の '{' から最後の '}' までを使う
 * （前置き・後書きの散文が付いてくるケースへの保険）。
 */
function extractJsonString(rawText) {
  if (typeof rawText !== 'string') {
    return null;
  }

  const fenceMatch = /```json\s*([\s\S]*?)```/i.exec(rawText);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // 一般の ``` フェンス（言語指定なし）も許容する
  const genericFenceMatch = /```\s*([\s\S]*?)```/.exec(rawText);
  if (genericFenceMatch) {
    return genericFenceMatch[1].trim();
  }

  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null;
  }

  return rawText.slice(firstBrace, lastBrace + 1).trim();
}

/**
 * ファイルパスの安全性を検証する。
 * 戻り値: 問題なければ null、問題があれば理由の文字列。
 */
function validatePath(path) {
  if (typeof path !== 'string') {
    return 'path が文字列ではありません';
  }

  if (path.length === 0) {
    return 'path が空文字です';
  }

  if (path.length > MAX_PATH_LENGTH) {
    return `path が長すぎます（${path.length} 文字、上限 ${MAX_PATH_LENGTH} 文字）`;
  }

  // null バイトはファイルシステム API に渡すと例外や切り詰めを起こすため
  // 早期に拒否する。
  if (path.includes('\0')) {
    return 'path に null バイトが含まれています';
  }

  // 絶対パス（Unix）禁止
  if (path.startsWith('/')) {
    return 'path が絶対パスです（"/" で始まっています）';
  }

  // Windows ドライブレター（例: C:\...  や C:/...）禁止
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    return 'path が Windows の絶対パス（ドライブレター）です';
  }

  // 末尾がパス区切りだとディレクトリ指定であり、ファイルパスとして不正
  if (/[\\/]$/.test(path)) {
    return 'path がディレクトリを指しています（末尾が区切り文字です）';
  }

  // バックスラッシュも区切り文字として扱い、".." 判定・空要素判定を統一する
  const segments = path.split(/[\\/]/);

  if (segments.some((segment) => segment === '..')) {
    return 'path にディレクトリトラバーサル（".."）が含まれています';
  }

  // 空要素だけ（末尾が "/" 等）や "." のみはディレクトリ指定であり
  // ファイルパスとして不正
  const meaningfulSegments = segments.filter((segment) => segment.length > 0 && segment !== '.');
  if (meaningfulSegments.length === 0) {
    return 'path がディレクトリのみを指しています（ファイル名がありません）';
  }

  return null;
}

/**
 * ポート番号を検証・正規化する。未指定なら 8080。
 */
function normalizePort(rawPort) {
  if (rawPort === undefined || rawPort === null) {
    return { ok: true, value: DEFAULT_PORT };
  }

  if (typeof rawPort !== 'number' || !Number.isInteger(rawPort)) {
    return { ok: false, error: `port は整数である必要があります（受け取った値: ${JSON.stringify(rawPort)}）` };
  }

  if (rawPort < 1 || rawPort > 65535) {
    return { ok: false, error: `port は 1〜65535 の範囲である必要があります（受け取った値: ${rawPort}）` };
  }

  return { ok: true, value: rawPort };
}

/**
 * Gemini の生成結果（またはその中間表現）を検証済みファイル配列に変換する。
 *
 * @param {string} rawText - Gemini からのレスポンステキスト（```json フェンス込みでも可）
 * @returns {{success: true, files: Array<{path: string, content: string}>, port: number, startCommand: string|null}
 *          | {success: false, error: string}}
 */
function parseGeneratedCode(rawText) {
  const jsonString = extractJsonString(rawText);
  if (jsonString === null) {
    return { success: false, error: 'JSON オブジェクトが見つかりませんでした（```json フェンスも { } も検出できません）' };
  }

  let manifest;
  try {
    manifest = JSON.parse(jsonString);
  } catch (err) {
    return { success: false, error: `JSON の解析に失敗しました: ${err.message}` };
  }

  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { success: false, error: 'JSON のトップレベルはオブジェクトである必要があります' };
  }

  if (!Array.isArray(manifest.files)) {
    return { success: false, error: '"files" が配列ではありません（または存在しません）' };
  }

  if (manifest.files.length === 0) {
    return { success: false, error: '"files" が空です（少なくとも 1 ファイル必要です）' };
  }

  if (manifest.files.length > MAX_FILES) {
    return {
      success: false,
      error: `ファイル数が上限を超えています（${manifest.files.length} 件、上限 ${MAX_FILES} 件）`,
    };
  }

  const files = [];
  const seenPaths = new Set();
  let totalSize = 0;

  for (let i = 0; i < manifest.files.length; i++) {
    const entry = manifest.files[i];
    const label = `files[${i}]`;

    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { success: false, error: `${label}: ファイルエントリがオブジェクトではありません` };
    }

    const pathError = validatePath(entry.path);
    if (pathError) {
      return { success: false, error: `${label} (path=${JSON.stringify(entry.path)}): ${pathError}` };
    }

    if (typeof entry.content !== 'string') {
      return { success: false, error: `${label} (path="${entry.path}"): content が文字列ではありません` };
    }

    // Buffer.byteLength でマルチバイト文字も正しくバイト数換算する
    const size = Buffer.byteLength(entry.content, 'utf8');
    if (size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `${label} (path="${entry.path}"): ファイルサイズが上限を超えています（${size} バイト、上限 ${MAX_FILE_SIZE} バイト）`,
      };
    }

    // パスの表記ゆれ（"./a.js" と "a.js" 等）を吸収して重複判定する
    const normalizedPath = entry.path.replace(/^\.\//, '');
    if (seenPaths.has(normalizedPath)) {
      return { success: false, error: `${label}: path が重複しています（"${entry.path}"）` };
    }
    seenPaths.add(normalizedPath);

    totalSize += size;
    if (totalSize > MAX_TOTAL_SIZE) {
      return {
        success: false,
        error: `合計ファイルサイズが上限を超えています（${totalSize} バイト時点、上限 ${MAX_TOTAL_SIZE} バイト、${label} で超過）`,
      };
    }

    files.push({ path: entry.path, content: entry.content });
  }

  const portResult = normalizePort(manifest.port);
  if (!portResult.ok) {
    return { success: false, error: portResult.error };
  }

  let startCommand = null;
  if (manifest.start_command !== undefined && manifest.start_command !== null) {
    if (typeof manifest.start_command !== 'string') {
      return { success: false, error: '"start_command" が文字列ではありません' };
    }
    startCommand = manifest.start_command;
  }

  return {
    success: true,
    files,
    port: portResult.value,
    startCommand,
  };
}

module.exports = { parseGeneratedCode };
