#requires -RunAsAdministrator
$ErrorActionPreference='Stop'
Stop-Service LANControlAgent -ErrorAction SilentlyContinue
& sc.exe delete LANControlAgent
Unregister-ScheduledTask -TaskName LANControlUpdater -Confirm:$false -ErrorAction SilentlyContinue
Write-Host 'Servico removido. Revogue o agente no painel. Dados/configuracao preservados para remocao manual autorizada.'
