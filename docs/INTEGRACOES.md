# Integrações oficiais e pendências

## Deep Freeze

A Faronics documenta DFC para Deep Freeze Enterprise. Compatibilidade depende de edição, versão, licença e política da LAN house. Fonte: https://support.faronics.com/help/en-ca/29-deep-freeze-windows/103-how-do-i-enable-or-disable-deep-freeze e https://www.faronics.com/webhelp/DFE/860/EN/Chapter.1.156.html .

O painel já guarda credenciais criptografadas, mas o agente atual não as recebe nem chama DFC. Estado fica unknown. Descongelar, recongelar, estado real e teclado/mouse exigem validação oficial. O sistema não remove driver, altera senha, modifica instalação nem contorna proteção. Para manutenção automática será necessário um fluxo comprovado de descongelar → reboot → validar estado → atualizar → recongelar → reboot → validar. Esse fluxo ainda não está implementado.

## HandyCafe e bloqueio

Versão/API/licença não informadas e nenhuma interface oficial validada nesta entrega. Credencial pode ser guardada no painel; adaptador desabilitado. Bloquear/desbloquear teclado/mouse requer ação oficial do HandyCafe ou aplicativo de sessão aprovado em projeto separado. Um serviço Windows fica em Session 0 e não pode controlar a interface do usuário simplesmente por chamar BlockInput. Não foi implementado overlay fingindo bloqueio nem desbloqueio de sessão Windows sem autenticação.

## Steam

O Steam PC Café Program é o caminho oficial para licenças e operação em LAN house: https://partner.steamgames.com/doc/sitelicense ; setup: https://partner.steamgames.com/doc/sitelicense/licensees/gettingstarted/licensemodelpc .

Agente implementa somente SteamCMD +login anonymous para App IDs locais explicitamente permitidos, e começa desabilitado. Isso não cobre todos os jogos da biblioteca Steam nem efetua login de cliente Steam. Autenticação, Steam Guard e termos de uso não são contornados; o armazenamento da credencial não ativa login automático. A atualização de jogos de contas autenticadas e o cache PC Café exigem validação no ambiente e licenças corretas.

## Windows

Serviço Windows via Microsoft.Extensions.Hosting.WindowsServices, modelo oficial Worker/BackgroundService: https://learn.microsoft.com/en-us/dotnet/core/extensions/windows-service . Gateway é uma role do mesmo serviço. SDK usado: .NET 10.0.402; target net10.0-windows; binários self-contained win-x64.
