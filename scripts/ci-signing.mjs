import {execFileSync} from 'node:child_process';
import {writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
const required=['APPLE_CERTIFICATE_BASE64','APPLE_CERTIFICATE_PASSWORD','APPLE_SIGNING_IDENTITY','ASC_KEY_ID','ASC_ISSUER_ID','ASC_PRIVATE_KEY'];
for(const key of required)if(!process.env[key])throw new Error(`Missing ${key}`);
const dir=process.env.RUNNER_TEMP;if(!dir)throw new Error('Use this signing setup only in an ephemeral CI runner.');
const keychain=join(dir,'piiin-build.keychain-db'),password=randomBytes(32).toString('hex'),certificate=join(dir,'certificate.p12'),apiKey=join(dir,`AuthKey_${process.env.ASC_KEY_ID}.p8`);
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:'pipe'});
writeFileSync(certificate,Buffer.from(process.env.APPLE_CERTIFICATE_BASE64,'base64'),{mode:0o600});writeFileSync(apiKey,process.env.ASC_PRIVATE_KEY,{mode:0o600});
run('security',['create-keychain','-p',password,keychain]);run('security',['set-keychain-settings','-lut','21600',keychain]);run('security',['unlock-keychain','-p',password,keychain]);
run('security',['import',certificate,'-k',keychain,'-P',process.env.APPLE_CERTIFICATE_PASSWORD,'-T','/usr/bin/codesign','-T','/usr/bin/productbuild']);
run('security',['set-key-partition-list','-S','apple-tool:,apple:','-k',password,keychain]);run('security',['list-keychains','-d','user','-s',keychain]);
const values={PIIIN_CI_KEYCHAIN:keychain};
if(process.env.RELEASE_CHANNEL==='direct') {
  for(const key of ['TAURI_SIGNING_PRIVATE_KEY','TAURI_SIGNING_PUBLIC_KEY'])if(!process.env[key])throw new Error(`Missing ${key}`);
  if(process.env.TAURI_SIGNING_PUBLIC_KEY.trim()!==JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8')).plugins.updater.pubkey)throw new Error('Existing update public key must be preserved.');
  const updater=join(dir,'updater.key');writeFileSync(updater,process.env.TAURI_SIGNING_PRIVATE_KEY,{mode:0o600});writeFileSync(`${updater}.pub`,process.env.TAURI_SIGNING_PUBLIC_KEY);
  values.TAURI_SIGNING_PRIVATE_KEY_PATH=updater;values.PIIIN_NOTARY_PROFILE='piiin-ci';
  run('xcrun',['notarytool','store-credentials','piiin-ci','--key',apiKey,'--key-id',process.env.ASC_KEY_ID,'--issuer',process.env.ASC_ISSUER_ID]);
}else {
  if(!process.env.APPLE_PROVISION_PROFILE_BASE64)throw new Error('Missing APPLE_PROVISION_PROFILE_BASE64');
  // The profile is distributed in the signed app, unlike private signing keys.
  const profile=join(dir,'distribution.provisionprofile');writeFileSync(profile,Buffer.from(process.env.APPLE_PROVISION_PROFILE_BASE64,'base64'),{mode:0o644});chmodSync(profile,0o644);
  const config=join(dir,'store-profile.json');writeFileSync(config,JSON.stringify({bundle:{macOS:{files:{'embedded.provisionprofile':profile}}}}));values.PIIIN_STORE_PROFILE_CONFIG=config;
}
for(const [key,value]of Object.entries(values))writeFileSync(process.env.GITHUB_ENV,`${key}=${value}\n`,{flag:'a'});
console.log('Ephemeral signing keychain configured.');
