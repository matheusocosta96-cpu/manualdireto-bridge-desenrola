// Copia os arquivos da interface para os assets do Android e gera uma prévia
// independente (um único HTML, sem rede e sem dependências).
import { mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';

const ASSETS = 'android/app/src/main/assets/public';

await rm(ASSETS, { recursive: true, force: true });
await mkdir(ASSETS, { recursive: true });
await cp('web', ASSETS, { recursive: true });
console.log('Assets Android atualizados:', ASSETS);

// Remove as linhas de import de cada módulo (nenhuma outra linha começa com
// "import" na coluna zero, por isso a varredura por linha é suficiente).
function stripImports(source) {
  const out = [];
  let inside = false;
  for (const line of source.split('\n')) {
    if (inside) {
      if (line.includes(';')) inside = false;
      continue;
    }
    if (/^import\b/.test(line)) {
      if (!line.includes(';')) inside = true;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

const css = await readFile('web/style.css', 'utf8');
const parts = [];
for (const file of ['domain.js', 'storage.js', 'app.js']) {
  const source = await readFile(`web/${file}`, 'utf8');
  parts.push(`/* ${file} */\n` + stripImports(source).replace(/^export\s+(?=(const|let|function|async|class)\b)/gm, ''));
}
const bundle = parts.join('\n');
if (/^(import|export)\b/m.test(bundle)) throw Error('Sobrou import/export no pacote da prévia.');

let html = await readFile('web/index.html', 'utf8');
html = html
  .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', `<script>\n${bundle.replace(/<\/script/gi, '<\\/script')}\n</script>`);

await mkdir('dist', { recursive: true });
await writeFile('dist/trajetoria-preview.html', html);
console.log('Prévia independente: dist/trajetoria-preview.html');
