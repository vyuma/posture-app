import {test,expect} from 'bun:test';
import {Window} from 'happy-dom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
const browser=new Window({url:'https://example.test/app'});
Object.assign(globalThis,{window:browser,document:browser.document,navigator:browser.navigator,IS_REACT_ACT_ENVIRONMENT:true});
const {DeveloperAccessProvider,useDeveloperAccess}=await import('../src/features/developer/DeveloperAccessContext');
const {NextRewardSetting}=await import('../src/features/work/NextRewardSetting');
let access:ReturnType<typeof useDeveloperAccess>;
function Probe(){access=useDeveloperAccess();return <NextRewardSetting collection={{revision:0,generation:0,cards:[],selectedId:null,timer:null,migrated:true}} onChange={async()=>{}}/>;}
test('only the independent developer session exposes the selector; normal user, guest and expired sessions do not',async()=>{
  const original=globalThis.fetch;let authorized=false,failed=false;
  globalThis.fetch=(async(input:RequestInfo|URL)=>{expect(String(input)).toBe('/api/dev-session');if(failed)throw new Error('offline');return Response.json({authenticated:authorized});}) as typeof fetch;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(<DeveloperAccessProvider><Probe/></DeveloperAccessProvider>));
    expect(host.textContent).toBe('');
    authorized=true;await act(()=>access.refresh());expect(host.textContent).toContain('次に獲得するピンアナゴ');
    authorized=false;await act(()=>access.refresh());expect(host.textContent).toBe('');
    authorized=true;await act(()=>access.refresh());failed=true;await act(()=>access.refresh());expect(host.textContent).toBe('');
  }finally{await act(()=>root.unmount());host.remove();globalThis.fetch=original;}
});
