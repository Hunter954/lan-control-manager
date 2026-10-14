# LAN Control Manager — 0.1.1

Primeira implementação executável do gerenciamento da LAN house. Painel Next.js responsivo e API NestJS no mesmo serviço; PostgreSQL com migrações; scheduler persistente; serviço Windows C#/.NET 10 e gateway WOL; instalador executável Windows personalizado, sem campos para código ou endereço.

**Painel:** https://lan-control-manager-production.up.railway.app

**Estado desta entrega:** código compilado e testes locais aprovados; publicado no GitHub/Railway. Integrações autenticadas Deep Freeze, HandyCafe, bloqueio/desbloqueio e Steam cliente permanecem desabilitadas. Consulte docs/STATUS.md para a separação entre implementação, testes locais e validação real.

## Executar

Node 24: npm ci, npm run build, npm test. Injete as variáveis de .env.example no processo; npm start. A inicialização exige PostgreSQL acessível e aplica as migrações automaticamente sob advisory lock. A transação de migração utiliza uma única conexão. /health valida SELECT 1.

Na tela Primeiro acesso, informe BOOTSTRAP_TOKEN, configure a chave TOTP no autenticador e crie uma senha de pelo menos 14 caracteres. O banco só permite um administrador nesta versão. Para entrar após o cadastro, espere o próximo código do autenticador. Todos os logins exigem 2FA; não existe acesso padrão nem senha no código.

## Estrutura

- apps/web: painel em português, visão de estações, comandos, agendamentos, credenciais, auditoria, instalação.
- apps/api: API NestJS, autenticação, fila, scheduler e criptografia.
- apps/worker: contrato do scheduler incorporado nesta etapa.
- packages/database: SQL versionado e runner de migrações.
- windows/agent: serviço Windows e gateway local.
- windows/updater: atualização com assinatura RSA-PSS, SHA-256, versão crescente e backup local.
- installer: instalar uma vez, remover serviço e produzir pacote Windows.
- security: ferramenta de assinatura da release; nenhuma chave privada incluída.

Instalação: docs/INSTALACAO.md. Segurança: docs/SEGURANCA.md. Integrações: docs/INTEGRACOES.md. Deploy: docs/DEPLOY.md.

## Primeiro acesso em produção

Abra o painel e selecione Primeiro acesso. No Railway, no serviço lan-control-manager, copie BOOTSTRAP_TOKEN em Variables e informe-o somente nessa tela HTTPS. Configure o autenticador TOTP, crie usuário e senha própria (mínimo 14 caracteres). Nenhum administrador padrão foi criado. Aguarde o próximo código do autenticador após o cadastro antes de fazer login. MASTER_KEY deve permanecer protegida e preservada; não a substitua para corrigir login.

O instalador Windows pode ser baixado na seção Instalação depois do login. O build Docker gera os executáveis e inicializa /data/releases automaticamente. Validação do agente em Windows real e integrações continuam pendentes.

## Instalação simplificada

Instalação → Baixar instalador Windows (.exe) → executar no PC → confirmar. Convite embutido de uso único por 48 horas. Nome do Windows e MAC obtidos automaticamente; detecção de HandyCafe sem alterar configuração. Não importamos ainda apelidos personalizados do HandyCafe. Cada arquivo instala uma única estação. O painel não solicita senha de administrador na máquina cliente. O Windows solicita sua autorização local para registrar o serviço.
