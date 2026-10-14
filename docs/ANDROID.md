# Android — suporte remoto autorizado

## Instalar e parear

Link curto de download: https://tinyurl.com/25yf64eu (destino /apk). Se necessário, faça o login administrativo com 2FA; o painel retorna automaticamente ao atalho. Toque Baixar APK para gerar o instalador personalizado. Apenas visitar o link não cria um convite. Também é possível usar Celulares e tablets → Baixar APK no painel autenticado. Cada arquivo contém convite de uso único por 48 horas e o endereço HTTPS do painel. Transfira somente para seu dispositivo autorizado e instale pelo instalador padrão do Android. Autorize a fonte de instalação quando o Android solicitar; o app não altera políticas nem desativa proteções. Android mínimo: 8 (API 26), alvo: 15 (API 35). APK Java sem biblioteca nativa, compatível com os ABIs suportados pelo Android.

Abra LAN Control Android com internet. O nome/modelo é enviado durante o pareamento. O token de máquina é cifrado por chave AES-GCM no Android Keystore; backup do app desativado. Não há senha de administrador dentro do APK. Depois do pareamento, o convite não conecta outra máquina.

## Tela — edição de visualização 0.2.3

No tablet, escolha Tela e toque Iniciar sessão e confirme a autorização do sistema. MediaProjection exige consentimento para cada nova sessão; instalar o app não concede essa autorização. A transmissão usa serviço foreground com notificação permanente e botão ENCERRAR.

Desde a versão 0.2.1, o APK não declara serviço de acessibilidade e não executa toques, gestos ou texto remotos. O serviço de controle foi retirado da distribuição de teste após o Play Protect bloquear a versão anterior. Não se altera pacote, assinatura ou alvo de SDK para evitar a análise. O nome do pacote e a chave persistente permanecem iguais, e a versão atual 0.2.3 usa versionCode 4.

O bloqueio mostrado pelo aparelho não prova uma causa específica. Build e assinatura corretos não garantem aprovação pelo Play Protect. Se a nova versão continuar bloqueada, preservar a proteção e encaminhar o APK para revisão pelo canal oficial do Google; não tentar contornar a análise. Distribuição gerenciada e integrações oficiais de controle dependem de validação futura, sem promessa de eliminar autorizações do sistema.

## Câmera

No app, escolha Câmera frontal ou traseira e toque Iniciar sessão, concedendo CAMERA. O administrador pode alternar as câmeras durante essa sessão. Somente tela não autoriza câmera; Câmera não autoriza tela. Para alternar todas as fontes na mesma sessão, escolha Tela e câmeras no aparelho antes de iniciar. Áudio/microfone não implementados.

## Sessão e privacidade

Versão 0.2.2: sessões não têm limite fixo de duração. A sessão administrativa continua sujeita à expiração normal de autenticação (8 horas). Autorizações e conectividade permanecem necessárias. Notificação e aplicativo mostram captura ativa, com ENCERRAR. Parar no tablet, encerrar explicitamente no painel, revogar o dispositivo ou perder a conexão interrompe o compartilhamento. O serviço não é iniciado no boot e não tenta reconectar silenciosamente. Permissões são concedidas pelas telas oficiais; não existe desbloqueio de senha, root, ADB ou captura de telas protegidas pelo Android.

Primeira implementação: JPEG por WebSocket HTTPS/WSS, até cerca de 4 quadros por segundo, imagem de tela com maior lado até 1024 pixels. Sem áudio, WebRTC, gravação ou acesso a arquivos. Latência e resolução de câmera dependem do aparelho/rede. Frames são encaminhados em memória, não armazenados em disco/banco. Logs registram sessão e ações solicitadas, sem conteúdo de imagens ou texto digitado.

## APK personalizado e assinatura

O build cria APK unsigned como template privado do servidor. A API substitui assets/enrollment.json, alinha o ZIP e assina/valida o APK com apksigner. Chave PKCS12 e senha ficam somente em /data/android-signing com permissões restritas, geradas no primeiro download. Faça backup seguro dessa pasta: perder a identidade de assinatura impede atualizar as instalações existentes com a mesma assinatura. Nenhuma chave ou senha fica no GitHub. Downloads exigem sessão 2FA e Origin do painel; convite de máquina não confere acesso administrativo.

## Estado de validação

Build Android e assinatura do APK personalizados validados localmente; testes de protocolo com cliente Android simulado e administrador cobrem autenticação, origem, consentimento, frames, câmeras e revogação. Execução real de MediaProjection, Camera2, câmera frontal/traseira precisa do piloto no tablet; instalação e aceitação pelo Play Protect ainda dependem de teste real. SDK/AGP e binários de assinatura também são compilados/configurados no Docker do Railway.

Referências oficiais: https://developer.android.com/media/grow/media-projection ; https://developer.android.com/develop/background-work/services/fgs/service-types .

## Fluxo simplificado 0.2.2

Um seletor Tela/Câmera frontal/Câmera traseira e um botão Iniciar sessão substituem os três botões de início. Permissões de notificações e câmera (somente no modo câmera) são solicitadas quando a pessoa inicia, continuando o fluxo após cada aprovação. MediaProjection mantém a confirmação oficial de cada sessão. Negar qualquer permissão cancela o início; não há aceite automático. Não são solicitadas todas as permissões indiscriminadamente. O botão Encerrar aparece durante a sessão; a notificação permanente também permite parar. Rotação conserva o modo aguardando autorização, sem repetir o pedido automaticamente. O consentimento, a parada local e a revogação são preservados.

## Autorização conjunta 0.2.3

Escolha Tela e câmeras, toque Iniciar sessão e conceda as permissões oficiais em sequência. Na primeira vez podem aparecer notificações, câmera e captura de tela; não são aceitas automaticamente. A sessão começa pela tela. No painel, Tela, Câmera frontal e Câmera traseira alternam o que é transmitido durante essa sessão, sem repetir a confirmação de captura a cada troca. O app pode ficar em segundo plano enquanto o serviço foreground permanece ativo, sujeito às regras do Android/fabricante.

A captura de tela permanece ativa ao visualizar a câmera. Não se reutiliza uma autorização expirada: a mesma MediaProjection e o único VirtualDisplay continuam ativos até encerrar; a troca apenas seleciona os frames transmitidos. Tela e câmera usam ImageReaders separados, e a câmera é fechada ao voltar à tela. A notificação identifica a fonte e a captura de tela ainda ativa. O escopo screen/camera da conexão não pode ser ampliado após sua declaração. Clientes antigos continuam limitados ao modo ativo informado.

Parar pelo app/notificação, encerrar explicitamente pelo painel, revogar acesso, perda de conexão do tablet ou interrupção do sistema encerram a sessão. Uma desconexão do painel concede até 60 segundos para reconectar ao mesmo compartilhamento; sem reconexão, ele é encerrado. Para iniciar outra captura de tela, a confirmação oficial é solicitada novamente. Não há início no boot, reconexão oculta, acesso a microfone ou toques remotos. Testes de protocolo cobrem seleção, escopo, parada e revogação; captura simultaneamente autorizada, alternância em segundo plano e câmera real precisam de teste no tablet. A captura de tela pode encerrar ao bloquear o aparelho conforme a versão do Android.

## Recarregar o painel

A aba e o UUID do dispositivo selecionado são guardados em sessionStorage da aba do navegador, sem senha, token ou imagens. Recarregar restaura essa seleção após o login. O servidor mantém a mesma sessão autorizada durante até 60 segundos de desconexão do visualizador; voltar cancela o prazo e retoma a fonte atual. O painel tenta reconectar automaticamente em caso de falha de transporte por até 45 segundos. Sem retorno, o serviço recebe STOP e a conexão do tablet é fechada. Encerrar explicitamente, revogar ou expirar a autenticação do visualizador conectado encerra o acesso imediatamente. Isso não inicia uma nova captura nem reaproveita uma autorização encerrada. Uma nova sessão de tela ainda depende da confirmação oficial do Android. Não é necessário atualizar o APK para esta correção.
