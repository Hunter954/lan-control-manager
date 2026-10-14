using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Win32;

var target=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"LANControl");
var dataPath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"LANControl");
var createdService=false;
try {
 if(args.Contains("--uninstall")){
  if(Native.MessageBox(IntPtr.Zero,"Remover o serviço LAN Control deste computador?","LAN Control",0x24)!=6)return;
  await Run("sc.exe",["stop","LANControlAgent"]);await Run("sc.exe",["delete","LANControlAgent"]);
  await Run("schtasks.exe",["/Delete","/TN","LANControlUpdater","/F"]);
  Registry.LocalMachine.DeleteSubKeyTree(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\LANControl",false);
  Native.MessageBox(IntPtr.Zero,"Serviço removido. Revogue a estação no painel. Os arquivos e dados locais foram preservados.","LAN Control",0x40);return;
 }
 if(await Run("sc.exe",["query","LANControlAgent"])==0){Native.MessageBox(IntPtr.Zero,"O agente já está instalado neste PC. Não é necessário executar novamente.","LAN Control",0x40);return;}
 var settings=ReadSettings();var server=new Uri(settings.ServerUrl);
 if(server.Scheme!="https"||server.AbsolutePath!="/"||server.GetLeftPart(UriPartial.Authority)!="https://lan-control-manager-production.up.railway.app")throw new InvalidOperationException("O endereço do painel é inválido.");
 if(DateTimeOffset.UtcNow>=settings.ExpiresAt)throw new InvalidOperationException("Este instalador expirou. Baixe um novo pelo painel; não é preciso digitar código.");
 if(settings.Token.Length!=64||!settings.Token.All(Uri.IsHexDigit))throw new InvalidOperationException("Convite inválido. Baixe novamente pelo painel.");
 if(Native.MessageBox(IntPtr.Zero,$"Instalar e conectar este computador ao LAN Control?\n\nComputador: {Environment.MachineName}\nPainel: {server.Host}\n\nO serviço iniciará automaticamente com o Windows.","LAN Control — Instalação",0x24)!=6)return;
 Directory.CreateDirectory(target);Directory.CreateDirectory(dataPath);
 foreach(var dir in new[]{target,dataPath})await MustRun("icacls.exe",[dir,"/inheritance:r","/grant:r","*S-1-5-18:(OI)(CI)F","*S-1-5-32-544:(OI)(CI)F"]);
 using(var resource=Assembly.GetExecutingAssembly().GetManifestResourceStream("LANControl.Payload.zip")??throw new InvalidOperationException("Pacote incompleto."))
 using(var zip=new ZipArchive(resource,ZipArchiveMode.Read)){
  foreach(var name in new[]{"LANControl.Agent.exe","LANControl.Updater.exe"}){
   var entry=zip.GetEntry("bin/"+name)??throw new InvalidOperationException("Pacote incompleto.");
   await using var source=entry.Open();await using var file=File.Create(Path.Combine(target,name));await source.CopyToAsync(file);
  }
 }
 await MustRun("sc.exe",["create","LANControlAgent","binPath=",$"\"{Path.Combine(target,"LANControl.Agent.exe")}\"","start=","auto","DisplayName=","LAN Control Agent"]);createdService=true;
 await MustRun(Path.Combine(target,"LANControl.Agent.exe"),["--enroll",server.GetLeftPart(UriPartial.Authority),settings.Token]);
 await MustRun("sc.exe",["failure","LANControlAgent","reset=","86400","actions=","restart/15000/restart/30000/restart/60000"]);
 XNamespace ns="http://schemas.microsoft.com/windows/2004/02/mit/task";
 var xml=new XDocument(new XElement(ns+"Task",new XAttribute("version","1.2"),new XElement(ns+"Principals",new XElement(ns+"Principal",new XAttribute("id","System"),new XElement(ns+"UserId","S-1-5-18"),new XElement(ns+"RunLevel","HighestAvailable"))),new XElement(ns+"Settings",new XElement(ns+"MultipleInstancesPolicy","IgnoreNew"),new XElement(ns+"DisallowStartIfOnBatteries",false),new XElement(ns+"StopIfGoingOnBatteries",false),new XElement(ns+"AllowStartOnDemand",true),new XElement(ns+"ExecutionTimeLimit","PT15M")),new XElement(ns+"Actions",new XAttribute("Context","System"),new XElement(ns+"Exec",new XElement(ns+"Command",Path.Combine(target,"LANControl.Updater.exe"))))));
 var taskFile=Path.Combine(target,"updater-task.xml");xml.Save(taskFile);try{await MustRun("schtasks.exe",["/Create","/TN","LANControlUpdater","/XML",taskFile,"/F"]);}finally{File.Delete(taskFile);}
 File.Copy(Environment.ProcessPath!,Path.Combine(target,"Uninstall.exe"),true);
 using(var uninstall=Registry.LocalMachine.CreateSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\LANControl")){
  uninstall.SetValue("DisplayName","LAN Control Agent");uninstall.SetValue("DisplayVersion","0.1.1");uninstall.SetValue("Publisher","LAN Control");uninstall.SetValue("InstallLocation",target);uninstall.SetValue("UninstallString",$"\"{Path.Combine(target,"Uninstall.exe")}\" --uninstall");uninstall.SetValue("NoModify",1,RegistryValueKind.DWord);uninstall.SetValue("NoRepair",1,RegistryValueKind.DWord);
 }
 await MustRun("sc.exe",["start","LANControlAgent"]);
 Native.MessageBox(IntPtr.Zero,$"Instalação concluída.\n\n{Environment.MachineName} aparecerá automaticamente no painel.\n\nNão é necessário executar este instalador novamente.","LAN Control",0x40);
} catch {
 if(createdService){await Run("sc.exe",["stop","LANControlAgent"]);await Run("sc.exe",["delete","LANControlAgent"]);await Run("schtasks.exe",["/Delete","/TN","LANControlUpdater","/F"]);}
 Native.MessageBox(IntPtr.Zero,"Não foi possível concluir a instalação.\n\nVerifique conexão com a internet e uma janela de manutenção autorizada. Se o convite expirou ou já foi usado, baixe um novo instalador no painel.\n\nNenhuma senha é solicitada pelo instalador.","LAN Control — Instalação não concluída",0x10);
 Environment.ExitCode=1;
}
static Settings ReadSettings(){
 using var file=File.OpenRead(Environment.ProcessPath!);if(file.Length<12)throw new InvalidOperationException();file.Seek(-12,SeekOrigin.End);using var reader=new BinaryReader(file,Encoding.UTF8,true);var length=reader.ReadUInt32();var marker=Encoding.ASCII.GetString(reader.ReadBytes(8));if(marker!="LANSET01"||length==0||length>4096||file.Length<12+length)throw new InvalidOperationException();file.Seek(-12-(long)length,SeekOrigin.End);return JsonSerializer.Deserialize<Settings>(reader.ReadBytes((int)length),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??throw new InvalidOperationException();
}
static async Task<int> Run(string executable,string[] args){try{
 if(!Path.IsPathRooted(executable))executable=Path.Combine(Environment.SystemDirectory,executable);
 var start=new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};foreach(var arg in args)start.ArgumentList.Add(arg);
 using var p=Process.Start(start)!;var stdout=p.StandardOutput.ReadToEndAsync();var stderr=p.StandardError.ReadToEndAsync();using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(2));try{await p.WaitForExitAsync(timeout.Token);}catch{p.Kill(true);return -1;}await Task.WhenAll(stdout,stderr);return p.ExitCode;
}catch{return -1;}}
static async Task MustRun(string executable,string[] args){if(await Run(executable,args)!=0)throw new InvalidOperationException("Installation operation failed");}
record Settings(string ServerUrl,string Token,DateTimeOffset ExpiresAt);
static class Native{[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int MessageBox(IntPtr window,string text,string title,uint type);}
