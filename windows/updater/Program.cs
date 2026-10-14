using System.Security.Cryptography;
using System.Text.Json;
using System.Diagnostics;
// Invoked by the fixed SYSTEM task installed alongside the agent; no shell received from server.
var dir=AppContext.BaseDirectory;var configPath=Path.Combine(dir,"config.json");var oldConfig=await File.ReadAllTextAsync(configPath);var cfg=JsonSerializer.Deserialize<Dictionary<string,JsonElement>>(await File.ReadAllTextAsync(configPath))!;
if(!cfg.TryGetValue("UpdatePersistenceValidated",out var validated)||!validated.GetBoolean())throw new InvalidOperationException("Persistence validation required");
var manifestUri=new Uri(cfg["ManifestUrl"].GetString()!);if(manifestUri.Scheme!="https")throw new InvalidOperationException("HTTPS required");
using var http=new HttpClient{Timeout=TimeSpan.FromMinutes(5)};using var envelope=JsonDocument.Parse(await http.GetStringAsync(manifestUri));
var payload=Convert.FromBase64String(envelope.RootElement.GetProperty("payload").GetString()!);if(payload.Length>16384)throw new InvalidOperationException();
using var rsa=RSA.Create();rsa.ImportFromPem(cfg["UpdatePublicKeyPem"].GetString()!);if(!rsa.VerifyData(payload,Convert.FromBase64String(envelope.RootElement.GetProperty("signature").GetString()!),HashAlgorithmName.SHA256,RSASignaturePadding.Pss))throw new InvalidOperationException("Invalid release signature");
using var manifest=JsonDocument.Parse(payload);var m=manifest.RootElement;var version=Version.Parse(m.GetProperty("version").GetString()!);if(version<=Version.Parse(cfg["ReleaseVersion"].GetString()!))return;
var uri=new Uri(m.GetProperty("url").GetString()!);if(uri.Scheme!="https"||uri.GetLeftPart(UriPartial.Authority)!=manifestUri.GetLeftPart(UriPartial.Authority))throw new InvalidOperationException("Release origin invalid");
if(DateTimeOffset.Parse(m.GetProperty("expiresAt").GetString()!)<DateTimeOffset.UtcNow)throw new InvalidOperationException("Expired manifest");
var tmp=Path.Combine(dir,"LANControl.Agent.exe.new");using(var response=await http.GetAsync(uri,HttpCompletionOption.ResponseHeadersRead)){response.EnsureSuccessStatusCode();if(response.Content.Headers.ContentLength>250_000_000)throw new InvalidOperationException();await using var source=await response.Content.ReadAsStreamAsync();await using var file=File.Create(tmp);var buffer=new byte[81920];long total=0;int read;while((read=await source.ReadAsync(buffer))>0){total+=read;if(total>250_000_000)throw new InvalidOperationException();await file.WriteAsync(buffer.AsMemory(0,read));}}
await using(var file=File.OpenRead(tmp)){var hash=Convert.ToHexString(await SHA256.HashDataAsync(file));if(!hash.Equals(m.GetProperty("sha256").GetString(),StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Hash mismatch");}
var exe=Path.Combine(dir,"LANControl.Agent.exe");var backup=exe+".bak";
await Sc("stop");for(int i=0;i<30;i++){await Task.Delay(1000);try{using var test=new FileStream(exe,FileMode.Open,FileAccess.ReadWrite,FileShare.None);break;}catch(IOException){if(i==29)throw;}}
File.Copy(exe,backup,true);try{File.Move(tmp,exe,true);cfg["ReleaseVersion"]=JsonSerializer.SerializeToElement(version.ToString());await File.WriteAllTextAsync(configPath,JsonSerializer.Serialize(cfg,new JsonSerializerOptions{WriteIndented=true}));await Sc("start");}catch{File.Copy(backup,exe,true);await File.WriteAllTextAsync(configPath,oldConfig);await Sc("start");throw;}
static async Task Sc(string action){var psi=new ProcessStartInfo(Path.Combine(Environment.SystemDirectory,"sc.exe")){UseShellExecute=false,CreateNoWindow=true};psi.ArgumentList.Add(action);psi.ArgumentList.Add("LANControlAgent");using var p=Process.Start(psi)!;await p.WaitForExitAsync();if(p.ExitCode!=0)throw new InvalidOperationException("Service operation failed");}
