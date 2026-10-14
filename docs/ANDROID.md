# Android — suporte remoto autorizado

## Instalar e parear

No painel autenticado, abra Celulares e tablets → Baixar APK. Cada arquivo contém convite de uso único por 48 horas e o endereço HTTPS do painel. Transfira somente para seu dispositivo autorizado e instale pelo instalador padrão do Android. Autorize a fonte de instalação quando o Android solicitar; o app não altera políticas nem desativa proteções. Android mínimo: 8 (API 26), alvo: 15 (API 35). APK Java sem biblioteca nativa, compatível com os ABIs suportados pelo Android.

Abra LAN Control Android com internet. O nome/modelo é enviado durante o pareamento. O token de máquina é cifrado por chave AES-GCM no Android Keystore; backup do app desativado. Não há senha de administrador dentro do APK. Depois do pareamento, o convite não conecta outra máquina.

## Tela e controle

No tablet, toque Compartilhar tela e confirme a autorização do sistema. Compartilhamento de tela usa MediaProjection com serviço foreground e notificação permanente de sessão. Para gestos, habilite LAN Control Android nas opções de acessibilidade do Android e marque Permitir toques nesta sessão no app. Dependendo da versão e origem de instalação, o Android pode exigir aprovação adicional nas próprias configurações; nunca é aplicada automaticamente.

No painel, selecione o tablet. Toque na imagem para tocar no Android; arraste para deslizar. Há Voltar, Início e Aplicativos, e envio de texto para um campo editável selecionado. Gestos e texto são negados sem consentimento local. Configurações, telas de permissões, instalação de apps, tela bloqueada e campos de senha identificados pelo Android são bloqueados para controle remoto; ações necessárias nesses locais são feitas no dispositivo.

## Câmera

Inicie Compartilhar câmera frontal ou traseira no app, concedendo CAMERA. O administrador pode alternar as câmeras durante essa sessão. Não é possível ligar a câmera pelo painel se o usuário iniciou apenas compartilhamento de tela; encerrar e iniciar o modo câmera no tablet continua necessário. Áudio/microfone não implementados.

## Sessão e privacidade

Sessões duram no máximo 15 minutos. Notificação e aplicativo mostram captura e controle ativos, com ENCERRAR. Parar no tablet, desconectar/encerrar a visualização no painel, revogar o dispositivo ou perder a conexão interrompe o compartilhamento. O serviço não é iniciado no boot e não tenta reconectar silenciosamente. Permissões são concedidas pelas telas oficiais; não existe desbloqueio de senha, root, ADB ou captura de telas protegidas pelo Android.

Primeira implementação: JPEG por WebSocket HTTPS/WSS, até cerca de 4 quadros por segundo, imagem de tela com maior lado até 1024 pixels. Sem áudio, WebRTC, gravação ou acesso a arquivos. Latência e resolução de câmera dependem do aparelho/rede. Frames são encaminhados em memória, não armazenados em disco/banco. Logs registram sessão e ações solicitadas, sem conteúdo de imagens ou texto digitado.

## APK personalizado e assinatura

O build cria APK unsigned como template privado do servidor. A API substitui assets/enrollment.json, alinha o ZIP e assina/valida o APK com apksigner. Chave PKCS12 e senha ficam somente em /data/android-signing com permissões restritas, geradas no primeiro download. Faça backup seguro dessa pasta: perder a identidade de assinatura impede atualizar as instalações existentes com a mesma assinatura. Nenhuma chave ou senha fica no GitHub. Downloads exigem sessão 2FA e Origin do painel; convite de máquina não confere acesso administrativo.

## Estado de validação

Build Android e assinatura do APK personalizados validados localmente; testes de protocolo com cliente Android simulado e administrador cobrem autenticação, origem, consentimento, frames, câmeras e revogação. Execução real de MediaProjection, Camera2, câmera frontal/traseira e gestos precisa do piloto no tablet. SDK/AGP e binários de assinatura também são compilados/configurados no Docker do Railway.

Referências oficiais: https://developer.android.com/media/grow/media-projection ; https://developer.android.com/reference/android/accessibilityservice/AccessibilityService ; https://developer.android.com/develop/background-work/services/fgs/service-types .
