import {createDecipheriv,scryptSync} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const [input,output]=process.argv.slice(2);
if(!input||!output||!process.env.CLOUDFLARE_API_TOKEN)throw Error('Usage: supply encrypted input, ZIP output, and existing Cloudflare secret in environment');
const b=readFileSync(input);if(b.subarray(0,8).toString()!=='3ONBAK01')throw Error('Unknown archive format');
const key=scryptSync(process.env.CLOUDFLARE_API_TOKEN,b.subarray(8,24),32),d=createDecipheriv('aes-256-gcm',key,b.subarray(24,36));d.setAuthTag(b.subarray(36,52));
const raw=Buffer.concat([d.update(b.subarray(52)),d.final()]);writeFileSync(output,raw,{mode:0o600});console.log('Authenticated backup decryption complete.');
