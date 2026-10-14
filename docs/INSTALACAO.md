# Instalação simplificada — Windows x64

No painel autenticado, abra Instalação e clique Baixar instalador Windows (.exe). Cada download gera um convite diferente, de uso único, válido por 48 horas. Execute LANControl-Instalar.exe no PC desejado, autorize o Windows e confirme a instalação. O arquivo já contém o endereço deste painel e o convite; não há ZIP para extrair nem código para copiar. O próprio instalador identifica o nome do Windows e o MAC de uma interface ativa. O agente aparece no painel automaticamente.

Baixe um novo arquivo para cada PC. Não reutilize o mesmo arquivo em vários computadores. Uma instalação já existente é detectada; o instalador não sobrescreve seu agente nem reaproveita sua identidade. Convites já consumidos, expirados ou revogados não conectam outra máquina. Se uma instalação falhar após consumo do convite, baixe outro arquivo para tentar novamente.

Para gateway, use o botão separado Baixar instalador do gateway no painel, em um computador que ficará ligado na rede local.

O executável é self-contained .NET 10 e traz os dois binários do agente. Não exige runtime .NET instalado. A autorização UAC do Windows permanece obrigatória. Sem certificado Authenticode nesta entrega; assinatura do instalador e execução real no PC piloto ainda precisam de validação. Não há desativação da proteção do Deep Freeze: instale em uma janela descongelada autorizada e confirme persistência após reinício.

Nome automático: hostname do Windows. HandyCafe é detectado por DisplayName/DisplayVersion no cadastro de programas instalados, sem ler senhas, alterar configurações ou comunicar com seu servidor. Um nome personalizado no HandyCafe não é importado nesta versão. Confirme versão/exportação ou API oficial antes dessa integração.

O installer base é compilado no Docker. A API adiciona um pequeno frame JSON ao fim do executável (uso autorizado, 48 horas, sessão administrativa, Cache-Control no-store). O frame contém serverUrl, token e expiresAt; o instalador só aceita o domínio deste painel. O arquivo personalizado não deve ser publicado no GitHub ou compartilhado publicamente. Personalização por overlay não é compatível com assinatura Authenticode prévia do arquivo completo; provisionar assinatura do download final ou formato apropriado antes de distribuir em produção com assinatura.

Para remover, utilize LAN Control Agent em Aplicativos do Windows. Serviço e tarefa são removidos; arquivos e dados locais permanecem para remoção autorizada. Revogue também a estação no painel.

## Manutenção avançada

## Gateway

Instalador personalizado de gateway pelo botão separado do painel. Deve ficar ligado na mesma rede física das estações. BroadcastAddress padrão 255.255.255.255, configurável localmente em config.json. Habilite Wake-on-LAN no BIOS/UEFI, NIC e driver. Teste com o PC desligado e depois confirme Online. Um envio UDP bem sucedido não prova que o PC ligou. Gateway desligado não envia WOL.

## SteamCMD experimental, opt-in local

Atualizações inicialmente desabilitadas. Instale SteamCMD oficial e configure, por administrador, SteamCmdPath, AllowedApps (mapa App ID → diretório absoluto), AllowAnonymousGameUpdates=true e MaintenanceValidated=true somente depois de validar licença, persistência e ausência de proteção que reverta os arquivos. Apenas login anonymous é implementado, para apps que o permitem. Não use credenciais Steam do painel em script ou linha de comando. Login Steam Guard permanece oficial e interativo. Agente não detecta automaticamente estado do Deep Freeze nesta versão.

## Atualizações de agente

Inicialmente desabilitadas. Configure ManifestUrl HTTPS, UpdatePublicKeyPem (chave pública RSA em PEM), UpdatePersistenceValidated=true e uma área persistente apropriada. O servidor de releases publica envelope {payload base64, signature base64}; payload contém version, url HTTPS da mesma origem, sha256 e expiresAt. O arquivo precisa estar dentro do prazo, a versão deve aumentar e a assinatura precisa validar antes de parar o serviço. Atualizador tenta restaurar o binário anterior e a configuração em falha. Valide recuperação, reboot, serviço e nova versão num PC piloto antes de habilitar em outras estações. Tarefa fixa SYSTEM faz a troca fora do processo do agente. Confirmação do comando registra solicitação da tarefa, não sucesso definitivo da atualização; confira a nova versão no heartbeat.

O atualizador atual troca apenas LANControl.Agent.exe. Alterar o próprio atualizador/instalador requer manutenção local autorizada. Assinatura de release privada não incluída. Gere-a fora do repositório; use security/sign-release.mjs. Restrinja acesso à chave privada.

## Remoção

Revogue o agente no painel e execute Uninstall.ps1 como administrador. Serviço e tarefa são removidos; arquivos são preservados para remoção local autorizada. Falha de instalação após consumo do convite exige novo convite. Verifique logs locais sem credenciais antes de tentar novamente.
