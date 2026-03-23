import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 4177);
const root = process.cwd();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function resolvePath(urlPath) {
  const pathname = new URL(urlPath, `http://${host}:${port}`).pathname;
  const normalized =
    pathname === '/' || pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const safePath = normalize(normalized).replace(/^[/\\]+/, '').replace(/^(\.\.[/\\])+/, '');
  return join(root, safePath);
}

const server = createServer((request, response) => {
  const filePath = resolvePath(request.url ?? '/');
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const type = contentTypes[extname(filePath)] ?? 'application/octet-stream';
  response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Demo server running at http://${host}:${port}/demo/`);
});
