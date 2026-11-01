import { widgetGeometry, widgetGrowth, widgetPose, speechGeometry } from '../src/features/work/widgetPresentation';
import type { WidgetState } from '../src/features/work/Widget';
import { writeFileSync, readFileSync } from 'node:fs';
const keys = ['growth','rigWidth','rigHeight','rigLeft','rigTop','maskLeft','maskTop','maskWidth','maskHeight','bubbleLeft','bubbleTop','bubbleWidth','bubbleHeight','bubbleAngle','fontSize','lineHeight','tracking'] as const;
const cases=[];
for (const pose of ['good','bad','rest','paused']) for (const height of [324,540,870]) for (const reduced of [false,true]) for (const now of [1000,3500,7000]) {
  const state:WidgetState={sessionId:'parity',remainingMs:923000,durationMs:1500000,phase:pose==='rest'?'rest':'focus',bad:pose==='bad',paused:pose==='paused',badSince:1000,cycle:1,cycles:2,feedbackVersion:1,speech:{id:'p',code:'general',text:'姿勢を戻して！',startedAt:1000,endsAt:7500}};
  const actualPose=widgetPose(state);
  const geometry=speechGeometry(widgetGeometry(actualPose,widgetGrowth(state,now,reduced),height-40),state.speech!.text);
  // These two rest overrides are in widget.css, not widgetGeometry itself.
  if(actualPose==='rest'){geometry.maskLeft=-60;geometry.maskWidth=238;}
  cases.push({name:`${pose}/${height}/${reduced}/${now}`,state,height,reduced,now,expected:keys.map(k=>geometry[k])});
}
const path='src-tauri/native-pet/Tests/PiiiNPetNativeTests/Fixtures/presentation.json';
const json=JSON.stringify(cases,null,2)+'\n';
if(process.argv.includes('--check')) {if(readFileSync(path,'utf8')!==json)throw new Error('Native pet fixtures differ from the current web presentation contract. Regenerate and run Swift tests.');console.log(`${cases.length} native parity fixtures match the shipping web widget.`);}
else writeFileSync(path,json);
