# Trajetória — versão pessoal 0.2.0

Aplicativo pessoal de progresso para um único usuário. Cinco áreas (bem-estar,
inteligência, empresa, força e resistência), missões diárias/semanais/mensais,
side quests, XP e níveis ligados a ações reais, e comparação do seu presente com
o seu próprio passado. Sem ranking, sem outras pessoas, sem ficção.

Leia **[docs/ESTADO.md](docs/ESTADO.md)** antes de qualquer coisa: lá está, item
por item, o que funciona, o que foi testado, o que está só preparado e o que
ainda não existe.

## Estrutura

```
web/            interface (HTML/CSS/JS puro, sem dependências npm)
  domain.js     regras: áreas, recorrência, XP, tetos, migração de esquema
  storage.js    persistência (navegador ou ponte Android) e backup cifrado
  app.js        telas, diálogos e o cliente do chat
android/        casca nativa em Java, sem bibliotecas externas
tools/          build de APK sem o SDK do Google
server/         serviço de IA para você publicar (Cloudflare Worker)
tests/          testes das regras (node) e de interface (Chromium)
docs/           estado real, escopo, IA e roteiro no aparelho
```

## Rodar e testar

```bash
npm test          # 20 testes das regras, sem dependências
npm run build     # atualiza os assets Android e dist/trajetoria-preview.html
npm start         # http://127.0.0.1:4173 para abrir no navegador
```

`dist/trajetoria-preview.html` é um arquivo único que abre direto no navegador,
sem servidor e sem rede. Serve para experimentar a interface — no navegador os
dados ficam em `localStorage`, **sem** a camada de criptografia do Android.

## Compilar o APK

Caminho normal, com Android Studio:

```bash
npm run build
# abra a pasta android/ no Android Studio e use Build > Build APK(s)
```

Caminho sem o SDK do Google (usado para gerar o APK entregue):

```bash
sudo apt-get install -y aapt apksigner zipalign
tools/fetch-build-tools.sh     # android.jar e dx, de hosts alternativos
tools/make-keystore.sh         # cria a chave de assinatura (uma única vez)
tools/build-apk.sh release
```

A chave de assinatura fica em `android/keystore/` e **não entra no
repositório**. Guarde o arquivo e a senha: o Android só aceita atualizar um
aplicativo instalado se a assinatura for a mesma. Sem a chave, a única saída é
desinstalar — e desinstalar apaga os dados locais.

## Privacidade

Os dados ficam no aparelho. No Android são gravados cifrados com AES-GCM e
chave do Android Keystore, o backup automático do sistema está desligado e a
janela bloqueia capturas de tela. O backup exportado pode sair cifrado com uma
senha sua. Nenhum dado vai para a rede sem que você configure um serviço e envie
uma mensagem; sono, medicação e registros de saúde nunca são enviados ao chat.
