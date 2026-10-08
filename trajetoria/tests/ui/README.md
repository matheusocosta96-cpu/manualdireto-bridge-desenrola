# Testes de interface

Percorrem o aplicativo em um Chromium com viewport de celular. Não são
dependências do projeto: instale o navegador e o `playwright-core` em qualquer
pasta fora daqui e aponte o caminho do executável.

```bash
# terminal 1
npm start                      # serve web/ em http://127.0.0.1:4173

# terminal 2
npm i -g playwright-core       # ou em uma pasta separada
npx playwright install chromium
OUT=/tmp/shots node tests/ui/mobile.mjs          # fluxos normais + capturas
node tests/ui/android-bridge.mjs                 # caminhos que só existem no WebView

# se o playwright-core estiver fora do projeto:
PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core/index.js node tests/ui/mobile.mjs
```

`mobile.mjs` registra missão, medicação e sono, cria e arquiva missões, compara
períodos, exporta um backup cifrado, apaga tudo, restaura e confere a
persistência. `android-bridge.mjs` injeta uma ponte `window.Android` falsa para
exercitar cofre, lembretes, estado do aparelho, botão voltar e a tela de
recuperação quando os dados não podem ser decifrados.

Se o Chromium estiver em outro caminho, ajuste `executablePath` no topo de cada
arquivo.
