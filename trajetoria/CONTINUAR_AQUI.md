# Passagem para a próxima sessão

Projeto pessoal Android de um único usuário. Antes de mexer em qualquer coisa:
`README.md`, `docs/ESTADO.md` (o que é real), `docs/ESCOPO.md` (as decisões do
dono) e `docs/AI.md`.

## Onde está

Versão 0.2.0. APK compilado e assinado neste ambiente, **ainda não executado em
aparelho nem em emulador**. As regras têm 20 testes automatizados e a interface
foi percorrida inteira em um Chromium com viewport de celular, inclusive com
uma ponte `window.Android` simulada. `docs/ESTADO.md` separa item por item o que
foi testado do que só foi implementado.

## O que mudou em relação à 0.1.0

- Esquema v2 com migração a partir da v1, sem perder registro.
- Teto diário de XP por área e total: acima dele a ação continua registrada sem
  somar pontos. Era o buraco que permitia premiar jornada longa.
- Arquivar e reativar missões, preservando o histórico.
- Sono virou registro próprio, datado pela hora de acordar.
- Comparação de 7 e 30 dias contra a janela anterior, por área, com dias ativos.
- Backup opcionalmente cifrado com senha (PBKDF2-SHA256 + AES-GCM).
- Alarme exato (`USE_EXACT_ALARM`), horário da noite configurável, bloqueio ao
  voltar ao aplicativo, cofre com cópia anterior de segurança, tela de estado
  real do aparelho (notificações, alarme exato, bateria, Health Connect).
- `tools/build-apk.sh`: gera APK assinado sem Gradle e sem o SDK do Google.
- `server/worker.js`: serviço de IA autenticado, com limites de uso.
- Código reescrito em formato legível (a versão anterior tinha linhas de 2.800
  caracteres).

## Próximos passos

1. Validar no POCO X7 seguindo `docs/HYPEROS.md` e corrigir o que falhar.
2. Publicar o serviço de IA (`docs/AI.md`) depois que o dono escolher provedor,
   modelo e teto de gasto.
3. Conta privada e sincronização, com tratamento de conflito. O esquema
   versionado já está pronto para isso. Registros de saúde não são enviados
   automaticamente.
4. Verificar marca, modelo e API do relógio Sentela antes de prometer qualquer
   integração; depois avaliar Health Connect.
5. Ajustar missões, sono, treinos e entregas da empresa junto com o dono.

## Regras que não se quebram

- Não apagar histórico em atualização. Toda mudança de esquema vem com migração
  e teste.
- Manter a mesma chave de assinatura (fora do repositório).
- Não inventar dado de saúde, caloria, plano de treino ou horário de medicação.
- Nenhuma resposta de IA simulada. Sem serviço configurado, a pergunta é
  guardada e o aplicativo diz que não há resposta.
- Nenhuma chave de provedor dentro do aplicativo.
- Separar sempre o que está implementado, o que está testado e o que é plano.

## Armadilha do ambiente

`dl.google.com` pode estar bloqueado por política de rede — é o que hospeda o
SDK, as Build-Tools e o Maven do Android. `tools/fetch-build-tools.sh` contorna
isso pegando `android.jar` e o `dx` de hosts alternativos. Como o `dx` não
faz desugaring, o Java tem de continuar em nível 8: **sem lambdas e sem métodos
`default` em interfaces**. Pelo Android Studio essa restrição não existe.
