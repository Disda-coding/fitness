// Local frontend preview; intentionally has no connection to the production API.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const demo = process.argv.includes('--demo');
const port = Number(process.env.PORT || (demo ? 4174 : 4173));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer(async (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (demo && pathname === '/__demo.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        res.end(await readFile(new URL('./demo.js', import.meta.url)));
        return;
    }
    if (pathname.startsWith('/auth/') || pathname === '/sync') {
        res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: '本地预览使用离线模式，GitHub 登录和云同步需要线上服务。' }));
        return;
    }
    const filename = path.resolve(publicDir, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filename.startsWith(publicDir)) { res.writeHead(403).end(); return; }
    try {
        let data = await readFile(filename);
        if (demo && path.extname(filename) === '.html') {
            data = data.toString()
                .replace('<title>健身追踪器</title>', '<title>健身追踪器 · 演示数据</title>')
                .replace("if ('serviceWorker' in navigator) {", 'if (false) { // Local demo always loads current files.')
                .replace('</body>', '<script src="/__demo.js"></script></body>');
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
    } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Fitness ${demo ? 'demo (sample data)' : 'preview'}: http://localhost:${port}`));
