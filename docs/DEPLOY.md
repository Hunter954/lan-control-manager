# Publicação Railway

## Infraestrutura

Repositório público: Hunter954/lan-control-manager (visibilidade autorizada pelo proprietário). Projeto Railway existente: LAN CONTROL MANAGER, ambiente production, serviço Postgres. Use o volume existente lan-control-data de 1 GB em /data; não crie outra base ou projeto.

## Quando o repositório estiver disponível

1. Envie os arquivos de fonte e package-lock.json; não envie .env, chaves, .git exportado, binários locais ou node_modules. Exemplo em CLI autenticada: git push origin main. Se já existir, configure origin e faça git push.
2. No projeto EXISTENTE, crie serviço da branch main desse repositório. Dockerfile na raiz. Não duplique projeto ou Postgres. O railway.json já define /health e uma réplica.
3. Configure DATABASE_URL com referência ${{Postgres.DATABASE_URL}}; MASTER_KEY: 32 bytes aleatórios em hexadecimal; BOOTSTRAP_TOKEN: token aleatório de 32 bytes ou mais; PUBLIC_URL: domínio HTTPS exato sem barra final; DATA_DIR=/data; NODE_ENV=production. Gere os segredos fora do código e proteja/seale variáveis no Railway. Não envie segredos em chat, issues ou commits.
4. Associe lan-control-data ao serviço em /data. Garanta que o usuário node do container tenha escrita no volume; ajuste o dono em manutenção se necessário. A API somente lê os pacotes de release, não faz upload de binário pelo navegador.
5. Crie domínio público, atualize PUBLIC_URL e implante. Inicialização aplica SQL automaticamente. Observe status terminal SUCCESS, verifique /health, login/2FA e convites. As migrations são executadas pelo processo da aplicação dentro da rede privada; a conexão OAuth não precisa receber credenciais do banco.
6. O Dockerfile compila agentes e instalador Windows. O painel entrega LANControl-Instalar.exe personalizado. O ZIP é apenas recurso interno para compilar o EXE. O entrypoint copia o EXE base, o pacote interno e seu SHA256 para /data/releases na inicialização, com permissões para o usuário node. /api/installer libera download apenas com sessão administrativa. Executáveis assinados via OTA devem ser hospedados em endpoint HTTPS confiável, acessível pelo atualizador.
7. Após configurar administrador, guarde o bootstrap com acesso restrito. A configuração já é recusada quando existe administrador. Faça backup de Postgres, MASTER_KEY, chaves de assinatura privadas e /data conforme a política da LAN house.

Publicação concluída com status SUCCESS em 14/10/2026. Painel: https://lan-control-manager-production.up.railway.app. Não foi enviado um agente a uma estação real.

## Estado aplicado

Serviço lan-control-manager segue a branch main automaticamente. PostgreSQL associado via referência de variável; volume lan-control-data montado em /data; variáveis de criptografia e bootstrap geradas aleatoriamente no Railway. Migrações aplicadas na inicialização. Pacote Windows compilado e copiado para o volume; download exige sessão administrativa. Nenhum segredo foi incluído no repositório.
