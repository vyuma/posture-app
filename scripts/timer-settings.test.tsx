import { afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_TIMER, type TimerSettings as Settings } from '../src/features/work/model';
const browser=new Window({url:'https://example.test/app'});
Object.assign(globalThis,{window:browser,document:browser.document,navigator:browser.navigator,location:browser.location,localStorage:browser.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
const {TimerSettings}=await import('../src/features/work/TimerSettings');
const host=document.createElement('div');document.body.append(host);
let root=createRoot(host);
afterEach(async()=>{await act(()=>root.unmount());root=createRoot(host);});

test('legacy timer defaults to normal/single and submits both new options with remember',async()=>{
  let result:Settings|null=null, remembered=false;
  await act(()=>root.render(<TimerSettings saved={DEFAULT_TIMER} onClose={()=>{}} onSubmit={(value,remember)=>{result=value;remembered=remember;}}/>));
  expect(host.querySelector<HTMLInputElement>('input[value=normal]')!.checked).toBe(true);
  expect(host.querySelectorAll<HTMLInputElement>('input[name=monitors]')[0].checked).toBe(true);
  await act(()=>host.querySelector<HTMLInputElement>('input[value=hard]')!.click());
  await act(()=>host.querySelectorAll<HTMLInputElement>('input[name=monitors]')[1].click());
  await act(()=>host.querySelector('form')!.dispatchEvent(new browser.Event('submit',{bubbles:true,cancelable:true}) as unknown as Event));
  expect(result).toEqual({...DEFAULT_TIMER,posture:{difficulty:'hard',dualMonitor:true}});
  expect(remembered).toBe(true);
});
test('saved posture options reopen and changing difficulty preserves monitor selection',async()=>{
  const saved={...DEFAULT_TIMER,posture:{difficulty:'hard' as const,dualMonitor:true}};let result:Settings|null=null;
  await act(()=>root.render(<TimerSettings saved={saved} onClose={()=>{}} onSubmit={value=>{result=value;}}/>));
  expect(host.querySelector<HTMLInputElement>('input[value=hard]')!.checked).toBe(true);
  expect(host.querySelectorAll<HTMLInputElement>('input[name=monitors]')[1].checked).toBe(true);
  await act(()=>host.querySelector<HTMLInputElement>('input[value=easy]')!.click());
  await act(()=>host.querySelector('form')!.dispatchEvent(new browser.Event('submit',{bubbles:true,cancelable:true}) as unknown as Event));
  expect(result).toEqual({...DEFAULT_TIMER,posture:{difficulty:'easy',dualMonitor:true}});
});
