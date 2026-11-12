import { writeFile } from 'node:fs/promises';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.split(/=(.*)/s).slice(0,2)));
if(!process.env.PIIIN_EXPORT_TOKEN||!args.output)throw new Error('Set PIIIN_EXPORT_TOKEN and pass output=/private/path.json [from=ISO] [to=ISO] [user=ID] [platform=web] [format=csv].');
if(args.view==='profiles'&&args.format==='csv')throw new Error('Profile history export uses JSON.');
const origin=process.env.PIIIN_API_ORIGIN??'https://www.piiin.app';
const records=[];let cursor=0,parts=[];
do {
  const query=new URLSearchParams({...Object.fromEntries(Object.entries(args).filter(([k])=>['from','to','user','platform','format','view'].includes(k))),cursor:String(cursor)});
  const response=await fetch(`${origin}/api/operator/export?${query}`,{headers:{Authorization:`Bearer ${process.env.PIIIN_EXPORT_TOKEN}`},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Export failed (${response.status}); no output file written.`);
  if(args.format==='csv'){let text=await response.text();if(parts.length)text=text.slice(text.indexOf('\r\n')+2);parts.push(text);cursor=Number(response.headers.get('X-Next-Cursor')??0);}
  else {const data=await response.json();records.push(...data.records);cursor=data.nextCursor??0;}
}while(cursor);
await writeFile(args.output,args.format==='csv'?parts.join('\r\n'):JSON.stringify({exportedAt:new Date().toISOString(),records},null,2),{mode:0o600,flag:'wx'});
console.log(`Saved analysis export to ${args.output}. Keep it outside public repositories.`);
