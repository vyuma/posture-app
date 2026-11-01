import { expect, test } from 'bun:test';
import { petEvent, replayPet } from '../src/features/timelapse/model';
import { widgetGeometry } from '../src/features/work/widgetPresentation';
const widget = {sessionId:'test',phase:'focus' as const,paused:false,bad:true,badSince:0,remainingMs:60000,durationMs:60000,cycle:1,cycles:1};
const bad = {...petEvent(0,widget),badAt:0};
const good = petEvent(6,{...widget,bad:false},bad);
test('recovery starts at the existing size and shrinks over 600ms',()=>{
 const events=[bad,good];
 const before=replayPet(events,5.999)!;
 const start=replayPet(events,6)!;
 const middle=replayPet(events,6.3)!;
 expect(start.growth).toBeCloseTo(before.growth,3);
 expect(middle.growth).toBeGreaterThan(0);
 expect(middle.growth).toBeLessThan(start.growth);
 expect(widgetGeometry(start.pose,start.growth).rigHeight).toBeCloseTo(widgetGeometry(before.pose,before.growth).rigHeight,3);
 expect(replayPet(events,6.61)!.growth).toBe(0);
});
