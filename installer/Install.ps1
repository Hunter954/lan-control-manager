# Run as administrator on an authorized maintenance/thawed session.
# Never put passwords in this script or in a deployment repository.
# Requires the locally downloaded release ZIP to be verified before execution.
#requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$panel = Read-Host 'Endereco HTTPS do painel'
$invite = Read-Host 'Convite de uso unico (48 horas)'
$uri = [Uri]$panel
if ($uri.Scheme -ne 'https') { throw 'HTTPS obrigatorio' }
$source = Join-Path $PSScriptRoot 'bin'
$target = Join-Path $env:ProgramFiles 'LANControl'
$data = Join-Path $env:ProgramData 'LANControl'
if (Get-Service LANControlAgent -ErrorAction SilentlyContinue) { throw 'Agente ja instalado. Use atualizacao assinada ou desinstalacao autorizada.' }
if (!(Test-Path "$source\LANControl.Agent.exe") -or !(Test-Path "$source\LANControl.Updater.exe")) { throw 'Pacote incompleto. Compile a release Windows primeiro.' }
New-Item -ItemType Directory -Force $target, $data | Out-Null
# Only SYSTEM and Administrators can change binaries, machine token, config and execution journal.
& icacls.exe $target /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
& icacls.exe $data /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
Copy-Item "$source\*" $target -Recurse -Force
& "$target\LANControl.Agent.exe" --enroll $panel $invite
if ($LASTEXITCODE -ne 0) { throw 'Falha na inscricao. Gere outro convite; nenhum servico foi ativado.' }
& sc.exe create LANControlAgent binPath= "`"$target\LANControl.Agent.exe`"" start= auto DisplayName= 'LAN Control Agent'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar servico' }
& sc.exe description LANControlAgent 'Gerenciamento autorizado e auditado de estacao LAN Control'
& sc.exe failure LANControlAgent reset= 86400 actions= restart/15000/restart/30000/restart/60000
$action = New-ScheduledTaskAction -Execute "$target\LANControl.Updater.exe"
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'LANControlUpdater' -Action $action -Principal $principal -Force | Out-Null
Start-Service LANControlAgent
Write-Host 'Instalado. Verifique o contato do agente no painel. Atualizacoes ficam desabilitadas ate configurar a chave publica e validar uma release.'
