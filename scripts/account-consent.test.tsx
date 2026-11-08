import { beforeEach, afterEach, test, expect, mock } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { initialAccounts, CONSENT_VERSION, type LocalAccounts, type AccountInfo } from '../src/features/accounts/types';
const browser=new Window({url:'https://example.test/app'});
Object.assign(globalThis,{window:browser,document:browser.document,navigator:browser.navigator,location:browser.location,history:browser.history,IS_REACT_ACT_ENVIRONMENT:true});
let local:LocalAccounts,remote:AccountInfo,failConsent=false,offline=false,locked=false,grants=0;
const active={active:true,version:CONSENT_VERSION,generation:1,grantedAt:'2026-11-08T00:00:00Z'};
mock.module('../src/features/accounts/localAccounts',()=>({readAccounts:async()=>structuredClone(local),updateAccounts:async(fn:(s:LocalAccounts)=>void)=>{fn(local);local.revision++;return structuredClone(local);}}));
mock.module('../src/features/work/measurementLock',()=>({acquireMeasurementLock:async()=>locked?null:()=>{}}));
mock.module('../src/features/accounts/api',()=>({
  startLogin:async()=>{remote.user={id:'alice',name:'Alice'};},forgetNativeLogin:async()=>{},
  accountRequest:async(path:string,method='GET')=>{
    if(offline)throw new Error('offline');
    if(path==='/api/me')return structuredClone(remote);
    if(path==='/api/consent'){if(failConsent)throw new Error('consent failed');if(method==='POST'){grants++;remote.consent={...active};}else remote.consent={...active,active:false,generation:2};return {consent:remote.consent};}
    if(path==='/api/auth/sign-out'){remote.user=null;return {};}
    throw new Error('unexpected '+path);
  }
}));
const {AccountBoundary,useAccounts}=await import('../src/features/accounts/AccountBoundary');
let api:ReturnType<typeof useAccounts>;
function Probe(){api=useAccounts();return <p data-owner={api.state.ownerId}>home:{api.homeRevision}</p>;}
let root:Root,host:HTMLElement;
beforeEach(()=>{browser.history.replaceState(null,'','/app');local=initialAccounts();remote={user:null,consent:null,providers:['google'],googleProfileEnabled:false,appleEnabled:false};failConsent=false;offline=false;locked=false;grants=0;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(()=>root.unmount());host.remove();});
const render=()=>act(async()=>{root.render(<AccountBoundary><Probe/></AccountBoundary>);});
const click=(text:string)=>act(async()=>{const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text);expect(button).toBeDefined();button!.click();});

test('first login requires explicit consent, cannot dismiss, and never adopts guest records',async()=>{
  await render();await act(()=>api.login('google'));
  expect(local.ownerId).toBe('alice');expect(local.profiles.guest.space).toBe('legacy');expect(local.profiles.alice.space).not.toBe('legacy');
  expect(grants).toBe(0);expect(host.textContent).toContain('同意して続ける');
  const dialog=host.querySelector('dialog')!;const cancel=new browser.Event('cancel',{cancelable:true});
  await act(()=>dialog.dispatchEvent(cancel as unknown as Event));expect(cancel.defaultPrevented).toBe(true);expect(dialog.open).toBe(true);
  const escape=new browser.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
  await act(()=>dialog.dispatchEvent(escape as unknown as Event));expect(escape.defaultPrevented).toBe(true);
  expect(dialog.querySelector('.work-close')).toBeNull();
  await click('同意して続ける');expect(grants).toBe(1);expect(host.querySelector('dialog')).toBeNull();expect(api.homeRevision).toBeGreaterThan(0);
  await act(()=>api.logout());expect(local.ownerId).toBe('guest');expect(local.profiles.alice.consent?.active).toBe(true);
  await act(()=>api.login('google'));expect(host.querySelector('dialog')).toBeNull();expect(grants).toBe(1);expect(local.ownerId).toBe('alice');
});
test('a returning account on a new device loads existing server consent without another grant',async()=>{
  remote.user={id:'alice',name:'Alice'};remote.consent={...active};browser.history.replaceState(null,'','/app?account=return');
  await render();expect(local.ownerId).toBe('alice');expect(host.querySelector('dialog')).toBeNull();expect(grants).toBe(0);expect(browser.location.search).toBe('');
});
test('failed consent stays blocked and logout still works offline',async()=>{
  await render();await act(()=>api.login('google'));failConsent=true;await click('同意して続ける');
  expect(host.textContent).toContain('consent failed');expect(local.profiles.alice.consent).toBeUndefined();
  offline=true;await click('ログアウト');expect(local.ownerId).toBe('guest');expect(host.querySelector('dialog')).toBeNull();
});
test('withdrawn and old-version consent require a new explicit decision',async()=>{
  await render();remote.consent={...active,active:false};await act(()=>api.login('google'));expect(host.textContent).toContain('同意して続ける');
  await act(()=>api.logout());remote.consent={...active,version:'old'};await act(()=>api.login('google'));expect(host.textContent).toContain('同意して続ける');expect(grants).toBe(0);
});
test('measurement ownership blocks account changes',async()=>{
  await render();locked=true;await act(async()=>{await expect(api.login('google')).rejects.toThrow('測定を終了');});expect(local.ownerId).toBe('guest');
});
test('authentication expiry preserves ownership and prior consent for offline measurements',async()=>{
  local.profiles.alice={space:'alice-local',consent:{...active}};local.ownerId='alice';
  await render();expect(local.ownerId).toBe('alice');expect(local.profiles.alice.consent?.active).toBe(true);expect(host.querySelector('dialog')).toBeNull();
});
test('privacy controls stay accessible before consent and withdrawal logs out without deleting local records',async()=>{
  await render();await act(()=>api.login('google'));await click('プライバシー・データ管理');
  expect(host.textContent).toContain('アカウントを削除');expect(grants).toBe(0);
  await click('同意を撤回してログアウト');await click('同意を撤回する');
  expect(local.ownerId).toBe('guest');expect(local.profiles.alice.consent?.active).toBe(false);expect(local.profiles.alice.space).toBeDefined();
  await act(()=>api.login('google'));expect(host.textContent).toContain('同意して続ける');expect(grants).toBe(0);
});
