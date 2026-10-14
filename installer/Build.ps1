$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$out=Join-Path $root 'artifacts/setup'
New-Item -ItemType Directory -Force "$out/bin" | Out-Null
foreach ($project in @('agent/LANControl.Agent.csproj','updater/LANControl.Updater.csproj')) {
 dotnet publish "$root/windows/$project" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o "$out/bin"
 if ($LASTEXITCODE -ne 0) { throw 'Build falhou' }
}
Copy-Item "$PSScriptRoot/Install.ps1","$PSScriptRoot/Uninstall.ps1" $out
Compress-Archive -Path "$out/*" -DestinationPath "$root/artifacts/LANControl-Setup.zip" -Force
Get-FileHash "$root/artifacts/LANControl-Setup.zip" -Algorithm SHA256

dotnet publish "$root/windows/installer/LANControl.Installer.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true "-p:AgentBundlePath=$root/artifacts/LANControl-Setup.zip" -o "$root/artifacts/exe"
if ($LASTEXITCODE -ne 0) { throw 'Build do instalador falhou' }
