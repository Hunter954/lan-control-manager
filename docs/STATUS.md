# Estado da entrega — 14/10/2026

## Implementado e testado localmente

Painel Next.js + API NestJS compilados. Seis testes aprovados com motor PostgreSQL embarcado PGlite e requisições HTTP reais locais: fluxo 2FA/sessão, prevenção de replay, convites únicos, comando/lease/ack, revogação, expiração, scheduler de terça-feira sem duplicação, migrações idempotentes, limitação de tentativas, sigilo de credenciais e proteção de origem. npm audit --omit=dev: zero vulnerabilidades reportadas nesta execução.

Serviço C# e atualizador compilados e publicados self-contained win-x64, sem erros de compilação. Pacote com Install.ps1 e Uninstall.ps1 produzido. Nenhuma execução Windows real realizada. Teste visual automatizado não concluído: o ambiente não disponibilizou o executável Chromium; o build de produção e os testes HTTP foram concluídos.

## Confirmado no Railway

Postgres SUCCESS com volume persistente. Volume lan-control-data de 1 GB associado ao serviço em /data. Projeto existente preservado; nenhum projeto/banco duplicado. Variáveis da base existem; seus valores são ocultados pela conexão OAuth.

## Publicado

Repositório público Hunter954/lan-control-manager autorizado pelo proprietário. Serviço Railway publicado com status SUCCESS; PostgreSQL e migrations inicializados; volume da aplicação associado em /data. Painel: https://lan-control-manager-production.up.railway.app. Bootstrap e MASTER_KEY gerados aleatoriamente e mantidos em variáveis externas. Administrador inicial ainda deve ser criado pelo proprietário com senha própria e autenticador TOTP.

Verificação em produção: /health responde 200; painel/login responde 200; /api/overview e /api/installer sem sessão retornam 401; escrita de origem diferente retorna 403; configuração inicial validou a conexão real/migrations e geração de chave TOTP sem criar usuário. Build gerou os executáveis Windows e o ZIP para download autenticado. Teste autenticado de download ainda depende da criação do administrador.

## Depende de PCs reais e/ou desenvolvimento adicional

| Recurso | Estado |
| --- | --- |
| Login + TOTP, painel, credenciais criptografadas, auditoria CSV | Publicados; testes locais e proteção HTTP em produção aprovados |
| Inventário, heartbeat, reiniciar e desligar Windows | Código compilado; piloto Windows pendente |
| Gateway Wake-on-LAN | Código compilado; hardware/rede e boot real pendentes |
| Instalador Windows x64 | Pacote compilado; instalação real e Authenticode pendentes |
| OTA de agente assinada RSA-PSS | Implementada opt-in; chave, hospedagem de releases e teste de rollback pendentes |
| Atualizar o próprio atualizador | Não implementado via OTA; requer manutenção local autorizada |
| SteamCMD anonymous e agendamento terça | Opt-in, só apps allowlist compatíveis; piloto/licença/persistência pendentes |
| Cliente Steam autenticado e Steam Guard | Não automatizados; fluxo oficial e integração pendentes |
| Deep Freeze thaw/freeze e consulta de estado | Adaptador não implementado; edição/versão/licença e DFC/API pendentes |
| HandyCafe, bloquear/desbloquear teclado e mouse | Adaptador não implementado; API e validação local pendentes |
| Múltiplos admins, recuperação 2FA e RBAC | Não implementados nesta versão |
| Métricas históricas, alertas e backup automático | Não implementados nesta versão |

A entrega é uma base executável publicada, ainda não o sistema completo validado nos PCs da LAN house. Credenciais armazenadas no painel não tornam as integrações funcionais. Offline/unknown não são estados físicos confirmados. Operações de WOL/OTA/reboot registram o pedido aceito; confirmar resultado em heartbeat e/ou inspeção local.

Verificação final: build com webpack aprovado após falha interna de cache Turbopack no ambiente. Reexecutados os seis testes: 6/6 aprovados. Binários finais recompilados após ajustes de opt-in/persistência do atualizador. Pacote de código contém docs/INSTALLER-SHA256.txt para conferir o ZIP Windows.

## Atualização 0.1.1 — instalador sem digitação

Download autenticado de EXE com convite e endereço embutidos, válido por 48 horas e uso único. Nome Windows/MAC automáticos; leitura apenas de nome e versão do HandyCafe no registro de desinstalação. Instalação com confirmação e UAC, serviço automático e entrada em Aplicativos do Windows. Build do EXE e protocolo testados; execução Windows real, Authenticode e importação de nomes personalizados do HandyCafe pendentes.
