# Instalação Windows x64

## Pacote entregue

LANControl-Setup.zip contém Install.ps1, Uninstall.ps1 e bin/LANControl.Agent.exe + bin/LANControl.Updater.exe. Executáveis autocontidos .NET 10: não exigem instalar runtime .NET separadamente. Compilação cruzada concluída; execução/instalação real Windows não testada neste ambiente Linux. Instalador de um clique MSI/EXE e assinatura Authenticode ficam pendentes; o pacote atual é um instalador PowerShell interativo como administrador.

1. Publique o painel e configure administrador/2FA.
2. Autorize a instalação e abra uma janela de manutenção pelo mecanismo oficial do Deep Freeze. Instale quando a alteração puder persistir; o software não desativa nem contorna Deep Freeze.
3. Crie convite no painel com nome e tipo (estação ou gateway). Cada convite vale uma instalação por 30 minutos.
4. Baixe o pacote de uma fonte confiável, confira o SHA256 contra o arquivo de hashes entregue, extraia e execute Install.ps1 no PowerShell como administrador. Use a política de execução aprovada pela organização; não é fornecido bypass de política.
5. Informe endereço HTTPS do painel e convite. O instalador grava em Program Files/LANControl, registra serviço automático LANControlAgent e tarefa SYSTEM LANControlUpdater. Token de máquina é protegido por DPAPI LocalMachine. Configuração e journal ficam acessíveis apenas a SYSTEM/Administradores. Não copie config.json entre PCs.
6. Verifique Online e a operação inventário. Reinício/desligamento são agendados para 30 segundos após recebimento. Faça esse teste fora de atendimento, sem dados não salvos.
7. Confirme que binários, configuração, registro do serviço e ProgramData/LANControl sobrevivem ao reboot e ao congelamento. Se necessário, configure área persistente/ThawSpace oficialmente; o caminho padrão não cria essa área. Não habilite OTA se as alterações serão revertidas pelo Deep Freeze.

## Gateway

Convite tipo gateway no mesmo pacote. Deve ficar ligado na mesma rede física das estações. BroadcastAddress padrão 255.255.255.255, configurável localmente em config.json. Habilite Wake-on-LAN no BIOS/UEFI, NIC e driver. Teste com o PC desligado e depois confirme Online. Um envio UDP bem sucedido não prova que o PC ligou. Gateway desligado não envia WOL.

## SteamCMD experimental, opt-in local

Atualizações inicialmente desabilitadas. Instale SteamCMD oficial e configure, por administrador, SteamCmdPath, AllowedApps (mapa App ID → diretório absoluto), AllowAnonymousGameUpdates=true e MaintenanceValidated=true somente depois de validar licença, persistência e ausência de proteção que reverta os arquivos. Apenas login anonymous é implementado, para apps que o permitem. Não use credenciais Steam do painel em script ou linha de comando. Login Steam Guard permanece oficial e interativo. Agente não detecta automaticamente estado do Deep Freeze nesta versão.

## Atualizações de agente

Inicialmente desabilitadas. Configure ManifestUrl HTTPS, UpdatePublicKeyPem (chave pública RSA em PEM), UpdatePersistenceValidated=true e uma área persistente apropriada. O servidor de releases publica envelope {payload base64, signature base64}; payload contém version, url HTTPS da mesma origem, sha256 e expiresAt. O arquivo precisa estar dentro do prazo, a versão deve aumentar e a assinatura precisa validar antes de parar o serviço. Atualizador tenta restaurar o binário anterior e a configuração em falha. Valide recuperação, reboot, serviço e nova versão num PC piloto antes de habilitar em outras estações. Tarefa fixa SYSTEM faz a troca fora do processo do agente. Confirmação do comando registra solicitação da tarefa, não sucesso definitivo da atualização; confira a nova versão no heartbeat.

O atualizador atual troca apenas LANControl.Agent.exe. Alterar o próprio atualizador/instalador requer manutenção local autorizada. Assinatura de release privada não incluída. Gere-a fora do repositório; use security/sign-release.mjs. Restrinja acesso à chave privada.

## Remoção

Revogue o agente no painel e execute Uninstall.ps1 como administrador. Serviço e tarefa são removidos; arquivos são preservados para remoção local autorizada. Falha de instalação após consumo do convite exige novo convite. Verifique logs locais sem credenciais antes de tentar novamente.
