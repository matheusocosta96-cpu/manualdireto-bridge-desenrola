// Servidor local só para testar a interface em um navegador.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('web');
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml' };
const port = Number(process.env.PORT || 4173);

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const resolved = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw Error('fora do diretório');
    const file = resolved === root ? path.join(root, 'index.html') : resolved;
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[file.split('.').pop()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Não encontrado');
  }
}).listen(port, '127.0.0.1', () => console.log(`Trajetória: http://127.0.0.1:${port}`));
