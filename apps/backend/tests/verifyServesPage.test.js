const http = require('http');
const { verifyServesPage } = require('../services/deployService');

// Cloud Run の起動判定は「ポートで待ち受けているか」しか見ない。
// API だけを実装して / にページを持たないアプリでも起動は成功し、
// 実際に「開いたら Cannot GET /」が利用者に届いた。
// ここでは「使えるか」を判定できていることを確認する。
function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })
    );
  });
}

const fast = { attempts: 1, delayMs: 0 };

describe('画面が提供されているかの検証', () => {
  test('HTML を返すアプリは合格', async () => {
    const s = await serve((_q, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body>hi</body></html>');
    });
    await expect(verifyServesPage(s.url, fast)).resolves.toEqual({ ok: true });
    s.close();
  });

  // 実際に起きたケース: Express が / を持たず既定の 404 を返した
  test('Cannot GET / は不合格', async () => {
    const s = await serve((_q, res) => {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body><pre>Cannot GET /</pre></body></html>');
    });
    const r = await verifyServesPage(s.url, fast);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('404');
    s.close();
  });

  test('JSON だけ返す API は不合格', async () => {
    const s = await serve((_q, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
    });
    const r = await verifyServesPage(s.url, fast);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('HTML ではなく');
    s.close();
  });

  test('HTML を名乗るが中身が HTML でないものは不合格', async () => {
    const s = await serve((_q, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('just text');
    });
    const r = await verifyServesPage(s.url, fast);
    expect(r.ok).toBe(false);
    s.close();
  });

  test('到達できない場合は不合格', async () => {
    const r = await verifyServesPage('http://127.0.0.1:1/', fast);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('到達できませんでした');
  });

  test('500 を返すアプリは不合格', async () => {
    const s = await serve((_q, res) => {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<html>error</html>');
    });
    const r = await verifyServesPage(s.url, fast);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('500');
    s.close();
  });

  test('起動が遅くても、待てば合格になる', async () => {
    let hits = 0;
    const s = await serve((_q, res) => {
      hits += 1;
      if (hits < 3) {
        res.writeHead(503);
        res.end('starting');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html>ok</html>');
    });
    await expect(verifyServesPage(s.url, { attempts: 5, delayMs: 10 })).resolves.toEqual({ ok: true });
    s.close();
  });
});
