// Private key remains outside the repository. Run on a trusted release host.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,sign,constants} from 'node:crypto';
const [binary,version,url,keyPath,output]=process.argv.slice(2);
if(!binary||!version||!url||!keyPath||!output)throw new Error('Usage: node security/sign-release.mjs EXE VERSION HTTPS_URL PRIVATE_KEY_PATH OUTPUT');
if(new URL(url).protocol!=='https:')throw new Error('HTTPS required');
const manifest={version,url,sha256:createHash('sha256').update(readFileSync(binary)).digest('hex'),expiresAt:new Date(Date.now()+7*86400000).toISOString()};
const payload=Buffer.from(JSON.stringify(manifest));
const signature=sign('sha256',payload,{key:readFileSync(keyPath),padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32});
writeFileSync(output,JSON.stringify({payload:payload.toString('base64'),signature:signature.toString('base64')}));
