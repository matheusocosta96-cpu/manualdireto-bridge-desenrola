# Instalar e validar no POCO X7 (Android 15 / HyperOS 2)

O APK é assinado com uma chave pessoal. **Mantenha essa chave**: atualizações só
instalam por cima se a assinatura for a mesma. Desinstalar apaga os dados.

## Instalar

1. Copie o `.apk` para o aparelho.
2. Abra o arquivo pelo Gerenciador de Arquivos. O HyperOS vai pedir para
   autorizar a instalação por esse aplicativo: **Ajustes → autorizar**.
3. O HyperOS pode exibir uma verificação de segurança e sugerir enviar o
   aplicativo para análise. Como é um aplicativo seu, escolha instalar mesmo
   assim.
4. Se aparecer "Verificação de aplicativos" do Play Protect, a instalação
   continua depois de confirmar.

## Primeira abertura

- Se o aparelho tem bloqueio de tela, o aplicativo pede a credencial antes de
  mostrar qualquer dado. Sem bloqueio configurado ele avisa e abre.
- Conceda a permissão de notificações quando pedir (ou em Conexões → Ativar
  lembrete da noite).

## Ajustes do HyperOS que decidem se o lembrete chega

Faça os três; no HyperOS qualquer um deles sozinho já adia notificação:

1. **Ajustes → Aplicativos → Trajetória → Economia de bateria → Sem
   restrições.** O botão "Abrir ajuste de bateria" em Conexões leva direto.
2. **Ajustes → Aplicativos → Trajetória → Início automático: ligado.** É o que
   permite reagendar o lembrete depois de reiniciar o aparelho.
3. Na tela de aplicativos recentes, **segure o cartão do Trajetória e toque no
   cadeado** para o sistema não encerrar o aplicativo.

Depois disso, abra **Conexões → Estado do aparelho** e confira: notificações
permitidas, alarme exato permitido, economia de bateria sem restrição.

## Roteiro de validação (marque o que passou)

| # | O que testar | Como | Esperado |
|---|---|---|---|
| 1 | Abertura | Abrir o aplicativo | Pede a credencial e mostra "Hoje" |
| 2 | Registro | Registrar "Ler por 5 minutos" | +10 XP, aparece no histórico |
| 3 | Persistência | Fechar de verdade e reabrir | O XP continua lá |
| 4 | Bloqueio ao voltar | Sair, esperar 1 minuto, voltar | Pede a credencial de novo |
| 5 | Captura de tela | Tentar capturar a tela | O sistema bloqueia |
| 6 | Lembrete da noite | Em Conexões, ajustar o horário para 3 minutos à frente e ativar | A notificação chega no horário |
| 7 | Notificação não confirma | Dispensar a notificação | A missão continua em aberto |
| 8 | Lembrete da manhã | Registrar "Registrar quando acordei" | Chega a notificação do remédio da manhã |
| 9 | Reinício | Reiniciar o aparelho e conferir em Conexões | "Próximo disparo" continua preenchido |
| 10 | Tela bloqueada | Deixar o aparelho bloqueado até o horário | A notificação aparece sem mostrar conteúdo sensível |
| 11 | Exportar | Conexões → Exportar backup, com senha | O seletor de arquivos abre e o `.tjb` é salvo |
| 12 | Restaurar | Restaurar o arquivo salvo | Pede a senha e repõe os registros |
| 13 | Voltar | Botão voltar em Missões / em Hoje | Volta para Hoje / sai do aplicativo |
| 14 | Giro de tela | Girar o aparelho | A tela não recarrega nem perde o que estava aberto |
| 15 | Atualização | Instalar uma versão nova por cima | Os dados continuam intactos |

Anote o que falhar com o número do item. Se o item 6 ou o 9 falhar, quase sempre
é um dos três ajustes do HyperOS acima.

## Se algo der errado

- **"Aplicativo não instalado"**: já existe uma versão com outra assinatura.
  Desinstale a anterior (isso apaga os dados — exporte antes, se houver).
- **Tela preta ao abrir**: o WebView do sistema pode estar desatualizado.
  Atualize "Android System WebView" pela Play Store.
- **Nada acontece ao exportar**: o seletor de arquivos do HyperOS pode estar
  desativado; autorize o aplicativo "Arquivos".
