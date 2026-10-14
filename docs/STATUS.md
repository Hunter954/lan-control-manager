# Estado da entrega — 14/10/2026

## Implementado e testado localmente

Painel Next.js + API NestJS compilados. Seis testes aprovados com motor PostgreSQL embarcado PGlite e requisições HTTP reais locais: fluxo 2FA/sessão, prevenção de replay, convites únicos, comando/lease/ack, revogação, expiração, scheduler de terça-feira sem duplicação, migrações idempotentes, limitação de tentativas, sigilo de credenciais e proteção de origem. npm audit --omit=dev: zero vulnerabilidades reportadas nesta execução.

Serviço C# e atualizador compilados e publicados self-contained win-x64, sem erros de compilação. Pacote com Install.ps1 e Uninstall.ps1 produzido. Nenhuma execução Windows real realizada. Teste visual automatizado não concluído: o ambiente não disponibilizou o executável Chromium; o build de produção e os testes HTTP foram concluídos.

## Confirmado no Railway

Postgres SUCCESS com volume persistente. Volume lan-control-data de 1 GB criado para /data, ainda sem serviço associado. Projeto existente preservado; nenhum projeto/banco duplicado. Variáveis da base existem; seus valores são ocultados pela conexão OAuth.

## Ainda não publicado

Repositório público Hunter954/lan-control-manager criado pelo proprietário; envio e publicação autorizados. Sem repositório conectado, não há serviço web nem domínio público. Migrações, variáveis secretas da aplicação, associação do volume e download pelo painel ficam pendentes do primeiro deploy. Nenhum URL de painel é fornecido como se estivesse operacional.

## Depende de PCs reais e/ou desenvolvimento adicional

| Recurso | Estado |
| --- | --- |
| Login + TOTP, painel, credenciais criptografadas, auditoria CSV | Testados localmente; publicação pendente |
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

A entrega é uma base executável verificável, ainda não o sistema completo validado em produção. Credenciais armazenadas no painel não tornam as integrações funcionais. Offline/unknown não são estados físicos confirmados. Operações de WOL/OTA/reboot registram o pedido aceito; confirmar resultado em heartbeat e/ou inspeção local.

Verificação final: build com webpack aprovado após falha interna de cache Turbopack no ambiente. Reexecutados os seis testes: 6/6 aprovados. Binários finais recompilados após ajustes de opt-in/persistência do atualizador. Pacote de código contém docs/INSTALLER-SHA256.txt para conferir o ZIP Windows.
