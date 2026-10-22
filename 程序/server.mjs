import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, openSync, unlinkSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createCatalogStore, CatalogError, MAX_MODEL_BYTES, readRequestBody } from './catalog-store.mjs';

const app = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(app);
const run = path.join(app, 'runtime');
const statePath = path.join(run, 'server.json');
const identity = createHash('sha256').update(root).digest('hex');
const mode = process.argv[2] || '--launch';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

async function running() {
  try {
    const record = JSON.parse(readFileSync(statePath, 'utf8'));
    const response = await fetch(`${record.url}/__health`, { signal: AbortSignal.timeout(1000) });
    const health = await response.json();
    return health.identity === identity && health.token === record.token ? record : null;
  } catch { return null; }
}

function openBrowser(url) {
  if (process.env.VIEWER_NO_OPEN === '1') return;
  const child = spawn('/usr/bin/open', [url], { stdio: 'ignore' });
  child.on('error', () => console.log(`请在浏览器打开 ${url}`));
}

async function serve() {
  const token = randomUUID();
  const store = createCatalogStore(root, path.join(app, 'src/spus.json'));
  const server = http.createServer(async (request, response) => {
    // Only a local browser should be able to use the application.
    const host = request.headers.host || '';
    if (!/^127\.0\.0\.1:\d+$/.test(host)) { response.writeHead(403).end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname === '/__health' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ identity, token })); return;
    }
    if (pathname === '/__stop' && request.method === 'POST' && request.headers['x-viewer-token'] === token) {
      response.writeHead(200).end('Stopped');
      server.close(() => process.exit(0));
      server.closeIdleConnections();
      setTimeout(() => process.exit(0), 1500).unref(); return;
    }
    if (pathname.startsWith('/api/')) {
      const reply = (status, data) => {
        response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(data));
      };
      try {
        if (request.headers.origin && request.headers.origin !== `http://${host}`) throw new CatalogError('仅允许本机预览器访问。', 403);
        if (pathname === '/api/catalog' && request.method === 'GET') {
          reply(200, { catalog: store.read(), token }); return;
        }
        if (request.headers['x-viewer-token'] !== token) throw new CatalogError('服务已重启，请刷新页面再操作。', 403);
        const revision = request.headers['x-catalog-revision'];
        let result;
        if (pathname === '/api/categories' && request.method === 'POST') {
          let body;
          try { body = JSON.parse((await readRequestBody(request, 8192)).toString()); }
          catch (error) { if (error instanceof CatalogError) throw error; throw new CatalogError('无法读取品类名称。'); }
          result = store.addCategory(body.label, revision);
        } else if (/^\/api\/categories\/[^/]+$/.test(pathname) && request.method === 'DELETE') {
          result = store.deleteCategory(pathname.split('/').at(-1), revision);
        } else if (pathname === '/api/models' && request.method === 'POST') {
          const params = new URL(request.url, `http://${host}`).searchParams;
          const bytes = await readRequestBody(request, MAX_MODEL_BYTES);
          result = store.addModel({ categoryId: params.get('category'), label: params.get('label'), filename: params.get('filename'), bytes, revision });
        } else if (/^\/api\/models\/[^/]+$/.test(pathname) && request.method === 'DELETE') {
          result = store.deleteModel(pathname.split('/').at(-1), revision);
        } else throw new CatalogError('接口不存在。', 404);
        reply(200, result);
      } catch (error) {
        console.error('Catalog:', error.message);
        if (!response.headersSent) reply(error.status || 500, { error: error instanceof CatalogError ? error.message : '保存到本地文件夹失败，请检查磁盘空间和文件权限后重试。' });
      }
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    const isModel = pathname.startsWith('/models/');
    const base = isModel ? path.join(root, '模型') : path.join(app, 'dist');
    const relative = isModel ? pathname.slice(8) : pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep)) { response.writeHead(403).end(); return; }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      response.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Content-Length': info.size, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch { response.writeHead(404).end('File not found'); }
  });
  let port;
  for (let candidate = 8765; candidate <= 8795; candidate++) {
    try {
      await new Promise((resolve, reject) => {
        const fail = (error) => { server.off('listening', ready); reject(error); };
        const ready = () => { server.off('error', fail); resolve(); };
        server.once('error', fail); server.once('listening', ready);
        server.listen(candidate, '127.0.0.1');
      });
      port = candidate; break;
    } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  if (!port) throw new Error('本地端口 8765–8795 均被占用。请关闭旧预览器后重试。');
  const record = { url: `http://127.0.0.1:${port}`, token, identity, pid: process.pid };
  writeFileSync(statePath, JSON.stringify(record), { mode: 0o600 });
  process.on('exit', () => {
    try { if (JSON.parse(readFileSync(statePath)).token === token) unlinkSync(statePath); } catch {}
  });
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  console.log(`3D 看外观已启动：${record.url}`);
}

try {
  mkdirSync(run, { recursive: true });
  if (mode === '--serve') await serve();
  else if (mode === '--stop') {
    const record = await running();
    if (!record) console.log('预览器当前未运行。');
    else {
      await fetch(`${record.url}/__stop`, { method: 'POST', headers: { 'x-viewer-token': record.token }, signal: AbortSignal.timeout(3000) });
      console.log('3D 看外观已停止。');
    }
  } else {
    let record = await running();
    if (!record) {
      if (!existsSync(path.join(app, 'dist', 'index.html'))) throw new Error('缺少程序文件，请保留完整的「3D看外观」文件夹。');
      const log = openSync(path.join(run, '运行日志.txt'), 'a');
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve'], { detached: true, stdio: ['ignore', log, log] });
      child.unref();
      for (let attempt = 0; attempt < 40 && !record; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 200)); record = await running();
      }
      if (!record) throw new Error('启动失败，请查看 程序/runtime/运行日志.txt。');
    }
    console.log(`3D 看外观：${record.url}\n可关闭此终端窗口；下次双击启动会重新打开浏览器。`);
    openBrowser(record.url);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
