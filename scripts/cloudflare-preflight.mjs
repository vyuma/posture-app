const missing=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','PIIIN_D1_ID','PIIIN_APP_ORIGIN'].filter(k=>!process.env[k]);
if(missing.length)throw new Error(`Configure the selected GitHub environment: ${missing.join(', ')}`);
if(process.argv[2]==='preview'&&new URL(process.env.PIIIN_APP_ORIGIN).hostname==='www.piiin.app')throw new Error('Preview must use a separate origin and resources.');
if(!/^[0-9a-f-]{36}$/i.test(process.env.PIIIN_D1_ID))throw new Error('PIIIN_D1_ID must be the provisioned database UUID.');
console.log('Deployment environment is configured. Secret values were not printed.');
