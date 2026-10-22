import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
let target = 'http://127.0.0.1:8765';
try { target = JSON.parse(readFileSync(new URL('./runtime/server.json', import.meta.url))).url; } catch {}
const localProxy = { target, changeOrigin: true, configure(proxy) { proxy.on('proxyReq', request => request.setHeader('Origin', target)); } };
export default defineConfig({
  publicDir: 'public',
  server: { host: '127.0.0.1', proxy: { '/models': localProxy, '/api': localProxy } },
});
