using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var configPath=Path.Combine(AppContext.BaseDirectory,"config.json");
if(args.Length==3 && args[0]=="--enroll"){
 var url=new Uri(args[1]);if(url.Scheme!="https")throw new InvalidOperationException("HTTPS obrigatório");
 using var http=new HttpClient{BaseAddress=url,Timeout=TimeSpan.FromSeconds(30)};
 var response=await http.PostAsync("/api/agent/enroll",new StringContent(JsonSerializer.Serialize(new{token=args[2]}),Encoding.UTF8,"application/json"));response.EnsureSuccessStatusCode();
 using var json=JsonDocument.Parse(await response.Content.ReadAsStringAsync());
 var cfg=new Config{ServerUrl=url.GetLeftPart(UriPartial.Authority),Role=json.RootElement.GetProperty("role").GetString()!,ProtectedToken=Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(json.RootElement.GetProperty("token").GetString()!),null,DataProtectionScope.LocalMachine))};
 await File.WriteAllTextAsync(configPath,JsonSerializer.Serialize(cfg,new JsonSerializerOptions{WriteIndented=true}));return;
}
var config=JsonSerializer.Deserialize<Config>(await File.ReadAllTextAsync(configPath))!;
if(new Uri(config.ServerUrl).Scheme!="https")throw new InvalidOperationException("HTTPS obrigatório");
var builder=Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(o=>o.ServiceName="LANControlAgent");builder.Services.AddSingleton(config);builder.Services.AddHostedService<Agent>();
await builder.Build().RunAsync();
public sealed class Config{
 public string ServerUrl{get;set;}="";public string ProtectedToken{get;set;}="";public string Role{get;set;}="station";
 public string DataPath{get;set;}=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"LANControl");
 public string BroadcastAddress{get;set;}="255.255.255.255";
 public bool AllowAnonymousGameUpdates{get;set;}=false;
 public bool MaintenanceValidated{get;set;}=false;
 public string SteamCmdPath{get;set;}="";
 public Dictionary<int,string> AllowedApps{get;set;}=new();
 public string ManifestUrl{get;set;}="";
 public string UpdatePublicKeyPem{get;set;}="";
 public bool UpdatePersistenceValidated{get;set;}=false;
 public string ReleaseVersion{get;set;}="0.1.0";
}
public sealed class Agent(Config cfg,ILogger<Agent> log):BackgroundService{
 readonly HttpClient http=new(){Timeout=TimeSpan.FromSeconds(30)};
 string Journal=>Path.Combine(cfg.DataPath,"executed.json");
 bool Updates=>cfg.AllowAnonymousGameUpdates&&cfg.MaintenanceValidated&&File.Exists(cfg.SteamCmdPath)&&cfg.AllowedApps.Count>0;
 bool AgentUpdates=>cfg.UpdatePersistenceValidated&&cfg.ManifestUrl.StartsWith("https://")&&!string.IsNullOrWhiteSpace(cfg.UpdatePublicKeyPem)&&File.Exists(Path.Combine(AppContext.BaseDirectory,"LANControl.Updater.exe"));
 protected override async Task ExecuteAsync(CancellationToken stop){Directory.CreateDirectory(cfg.DataPath);http.BaseAddress=new Uri(cfg.ServerUrl);http.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(cfg.ProtectedToken),null,DataProtectionScope.LocalMachine)));await Task.WhenAll(Heartbeats(stop),Commands(stop));}
 async Task Heartbeats(CancellationToken stop){while(!stop.IsCancellationRequested){try{var capabilities=new List<string>{"inventory","reboot","shutdown"};if(cfg.Role=="gateway")capabilities.Add("wol");if(Updates)capabilities.Add("steam_update");if(AgentUpdates)capabilities.Add("agent_update");var disk=new DriveInfo(Path.GetPathRoot(cfg.DataPath)!);await Post("/api/agent/heartbeat",new{telemetry=new{hostname=Environment.MachineName,version=cfg.ReleaseVersion,os=Environment.OSVersion.ToString(),freeDiskBytes=disk.AvailableFreeSpace,uptimeSeconds=Environment.TickCount64/1000,lockState="unknown",deepFreezeState="unknown"},capabilities},stop);}catch(OperationCanceledException)when(stop.IsCancellationRequested){return;}catch{log.LogWarning("Heartbeat unavailable; credentials omitted");}await Task.Delay(TimeSpan.FromSeconds(15),stop);}}
 async Task Commands(CancellationToken stop){var seen=File.Exists(Journal)?JsonSerializer.Deserialize<HashSet<string>>(await File.ReadAllTextAsync(Journal,stop))!:new HashSet<string>();while(!stop.IsCancellationRequested){try{using var response=await http.GetAsync("/api/agent/poll",stop);response.EnsureSuccessStatusCode();using var doc=JsonDocument.Parse(await response.Content.ReadAsStringAsync(stop));if(doc.RootElement.ValueKind!=JsonValueKind.Null){var c=doc.RootElement;var id=c.GetProperty("id").GetString()!;var ok=false;if(DateTimeOffset.Parse(c.GetProperty("expires_at").GetString()!)>DateTimeOffset.UtcNow&&!seen.Contains(id)){seen.Add(id);var tmp=Journal+".tmp";await File.WriteAllTextAsync(tmp,JsonSerializer.Serialize(seen),stop);File.Move(tmp,Journal,true);try{await Execute(c.GetProperty("kind").GetString()!,c.GetProperty("payload"),stop);ok=true;}catch{log.LogWarning("Command {CommandId} failed; credentials omitted",id);}}await Post("/api/agent/ack",new{id,lease=c.GetProperty("lease").GetString(),ok},stop);}}
 catch(OperationCanceledException)when(stop.IsCancellationRequested){return;}catch{log.LogWarning("Command channel unavailable; credentials omitted");}await Task.Delay(TimeSpan.FromSeconds(5),stop);}}
 async Task Post(string path,object body,CancellationToken stop){using var content=new StringContent(JsonSerializer.Serialize(body),Encoding.UTF8,"application/json");using var response=await http.PostAsync(path,content,stop);response.EnsureSuccessStatusCode();}
 async Task Execute(string kind,JsonElement payload,CancellationToken stop){switch(kind){case "inventory":return;case "reboot":await Run(Path.Combine(Environment.SystemDirectory,"shutdown.exe"),["/r","/t","30"],stop);return;case "shutdown":await Run(Path.Combine(Environment.SystemDirectory,"shutdown.exe"),["/s","/t","30"],stop);return;case "wol":if(cfg.Role!="gateway")throw new InvalidOperationException();var raw=payload.GetProperty("mac").GetString()!;if(!System.Text.RegularExpressions.Regex.IsMatch(raw,@"^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$"))throw new InvalidOperationException();var mac=Convert.FromHexString(raw.Replace(":",""));var packet=Enumerable.Repeat((byte)255,6).Concat(Enumerable.Range(0,16).SelectMany(_=>mac)).ToArray();using(var udp=new UdpClient()){udp.EnableBroadcast=true;await udp.SendAsync(packet,new System.Net.IPEndPoint(System.Net.IPAddress.Parse(cfg.BroadcastAddress),9),stop);}return;case "steam_update":var appId=payload.GetProperty("appId").GetInt32();if(!Updates||!cfg.AllowedApps.TryGetValue(appId,out var path))throw new InvalidOperationException("App não autorizado");await Run(cfg.SteamCmdPath,["+force_install_dir",path,"+login","anonymous","+app_update",appId.ToString(),"validate","+quit"],stop,TimeSpan.FromMinutes(90));return;case "agent_update":if(!AgentUpdates)throw new InvalidOperationException();await Run(Path.Combine(Environment.SystemDirectory,"schtasks.exe"),["/Run","/TN","LANControlUpdater"],stop);return;default:throw new NotSupportedException("Integração ainda não validada");}}
 static async Task Run(string executable,string[] args,CancellationToken stop,TimeSpan? timeout=null){var psi=new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true};foreach(var a in args)psi.ArgumentList.Add(a);using var process=Process.Start(psi)??throw new InvalidOperationException();using var timed=CancellationTokenSource.CreateLinkedTokenSource(stop);timed.CancelAfter(timeout??TimeSpan.FromMinutes(2));try{await process.WaitForExitAsync(timed.Token);}catch{process.Kill(true);throw;}if(process.ExitCode!=0)throw new InvalidOperationException("Operação falhou");}
}
