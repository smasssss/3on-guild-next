// Backups may contain nonpublic operation records. Only authenticated ciphertext
// is uploaded to the PUBLIC repository's Actions artifact storage.
import {createCipheriv,randomBytes,scryptSync} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
if(!process.env.CLOUDFLARE_API_TOKEN)throw Error('Existing Cloudflare secret required');
execFileSync('python3',['-c',"import shutil;shutil.make_archive('/tmp/3on-evidence','zip','automation-evidence')"]);
const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(process.env.CLOUDFLARE_API_TOKEN,salt,32),cipher=createCipheriv('aes-256-gcm',key,iv);
const content=Buffer.concat([cipher.update(readFileSync('/tmp/3on-evidence.zip')),cipher.final()]);
mkdirSync('automation-encrypted',{recursive:true});
writeFileSync('automation-encrypted/3ON-automation-evidence.aesgcm',Buffer.concat([Buffer.from('3ONBAK01'),salt,iv,cipher.getAuthTag(),content]));
writeFileSync('automation-encrypted/README.txt','3ON encrypted deployment backup. AES-256-GCM; key: scrypt(existing CLOUDFLARE_API_TOKEN, stored salt, 32 bytes). Format: magic(8), salt(16), IV(12), tag(16), ciphertext. Restore using authorized Cloudflare CI secret. Keep the current secret available until backup rotation.\n');
console.log('Evidence encrypted with AES-256-GCM; no plaintext business backup will be uploaded.');
