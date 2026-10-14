# Protocolo v1

HTTPS com JSON. Inscrição POST /api/agent/enroll: {token}; devolve id, role e token de máquina uma única vez. Convite: 30 minutos e consumo atômico.

Após inscrição, Authorization: Bearer MACHINE_TOKEN. Heartbeat POST /api/agent/heartbeat a cada 15s; GET /api/agent/poll a cada 5s. Comando: id, kind, payload, expires_at, lease. Confirmar com POST /api/agent/ack: {id,lease,ok}. Servidor vincula confirmação ao dispositivo, nonce e prazo. Não aceita confirmação repetida. Poll usa FOR UPDATE SKIP LOCKED. Comandos vencem em 5 minutos; atualizações em 2 horas.

Agente registra IDs em disco antes de executar para evitar repetir reinício/desligamento após perda da confirmação. A garantia é de não repetição automática; se cair entre registrar e executar, o comando pode não ser realizado e deve ser revisado pelo operador. Falha ou comando expirado exige revisão; não significa sucesso.

Operações fixas: inventory, reboot, shutdown, wol, steam_update, agent_update. lock/unlock constam do protocolo para adaptador futuro e não são anunciados pelo agente atual. Nenhum PowerShell, caminho de executável, shell ou script arbitrário recebido da nuvem é executado.
