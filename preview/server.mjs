import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = new Map([
    ['/', ['preview/index.html', 'text/html']],
    ['/index.js', ['index.js', 'text/javascript']],
    ['/tree.js', ['tree.js', 'text/javascript']],
    ['/style.css', ['style.css', 'text/css']],
    ['/native-icons.css', ['D:/SillyTavern-1.19.0/public/css/fontawesome.min.css', 'text/css']],
    ['/webfonts/fa-solid-900.woff2', ['D:/SillyTavern-1.19.0/public/webfonts/fa-solid-900.woff2', 'font/woff2']],
]);
http.createServer(async (request, response) => {
    const file = files.get(new URL(request.url, 'http://localhost').pathname);
    if (!file) { response.writeHead(404).end(); return; }
    try {
        response.writeHead(200, { 'Content-Type': file[1] });
        response.end(await readFile(path.isAbsolute(file[0]) ? file[0] : path.join(root, file[0])));
    } catch { response.writeHead(500).end(); }
}).listen(8766, '127.0.0.1', () => console.log('Better Branching preview: http://127.0.0.1:8766'));
