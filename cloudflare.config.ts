import { bindings, defineConfig, triggers } from 'cf/config';

export default defineConfig(({mode,isPreview})=>{
  const production=mode==='production'&&!isPreview;
  const name=process.env.PIIIN_WORKER_NAME??(production?'piiin':'piiin-preview');
  const auth=process.env.PIIIN_AUTH_ENABLED==='true',apple=process.env.PIIIN_APPLE_ENABLED==='true',developer=process.env.PIIIN_DEVELOPER_ENABLED==='true';
  const secret=(enabled:boolean)=>enabled?bindings.secret():bindings.text('');
  return { worker: {
    name, entrypoint:'./server/worker.ts',compatibilityDate:'2026-11-08',compatibilityFlags:['nodejs_compat'],
    assets:{notFoundHandling:'single-page-application',runWorkerFirst:['/api/*']},
    // Keep the Vercel CNAME during migration; an HTTPS route intercepts traffic
    // once its DNS record is proxied. Removing the route restores the old origin.
    workersDev:true,previewUrls:false,
    env:{
      ASSETS:bindings.assets(),DB:bindings.d1({name:`${name}-accounts`,...(process.env.PIIIN_D1_ID?{id:process.env.PIIIN_D1_ID}:{})}),
      TELEMETRY:bindings.r2({name:`${name}-telemetry`}),
      APP_ORIGIN:bindings.text(process.env.PIIIN_APP_ORIGIN??(production?'https://www.piiin.app':'http://localhost:5173')),
      GOOGLE_PROFILE_ENABLED:bindings.text(process.env.PIIIN_GOOGLE_PROFILE_ENABLED??'false'),
      RESTORE_LOCK:bindings.text(process.env.PIIIN_RESTORE_LOCK??'false'),
      BETTER_AUTH_SECRET:secret(auth),GOOGLE_CLIENT_ID:secret(auth),GOOGLE_CLIENT_SECRET:secret(auth),
      APPLE_CLIENT_ID:secret(apple),APPLE_TEAM_ID:secret(apple),APPLE_KEY_ID:secret(apple),APPLE_PRIVATE_KEY:secret(apple),
      PIIIN_DEV_USERNAME:secret(developer),PIIIN_DEV_PASSWORD:secret(developer),PIIIN_DEV_SESSION_SECRET:secret(developer),EXPORT_TOKEN:secret(auth),
    },
    triggers:[triggers.scheduled({schedule:'*/15 * * * *'}),
      ...(production&&process.env.PIIIN_DOMAIN_ENABLED==='true'?[triggers.fetch({pattern:'https://www.piiin.app/*',zone:'piiin.app'})]:[]),
    ],
    limits:{cpuMs:30000},
    observability:{enabled:true,headSamplingRate:0.1,redactQueryString:true,logs:{invocationLogs:false}},
  }};
});
