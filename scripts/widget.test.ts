import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { widgetArtworkPose, widgetPose, widgetGrowth, widgetGeometry } from '../src/features/work/widgetPresentation';
import { petEvent, replayPet, ASSET_VERSION } from '../src/features/timelapse/model';
const focus = { sessionId:'qa', remainingMs:120000, durationMs:300000, phase:'focus' as const, paused:false, bad:true, badSince:10000, cycle:1, cycles:4 };
describe('widget state and recording compatibility', () => {
  test('pause and rest take precedence over a stale bad posture reading', () => {
    expect(widgetPose(focus)).toBe('bad');
    expect(widgetPose({...focus,paused:true})).toBe('paused');
    expect(widgetPose({...focus,phase:'rest'})).toBe('rest');
    expect(widgetGrowth({...focus,paused:true},20000)).toBe(0);
    expect(widgetGrowth({...focus,phase:'rest'},20000)).toBe(0);
  });
  test('growth starts immediately, reaches maximum in 3 seconds and respects motion limits', () => {
    expect(widgetGrowth(focus,9000)).toBe(0);
    expect(widgetGrowth(focus,10000)).toBe(0);
    expect(widgetGrowth(focus,10001)).toBeCloseTo(1 / 3000, 8);
    expect(widgetGrowth(focus,11500)).toBe(.5);
    expect(widgetGrowth(focus,13000)).toBe(1);
    expect(widgetGrowth({...focus,badSince:null},13000)).toBe(0);
    expect(widgetGrowth({...focus,bad:false},13000)).toBe(0);
    expect(widgetGrowth(focus,90000)).toBe(1);
    expect(widgetGrowth(focus,90000,true)).toBe(0);
    const full = widgetGeometry('bad',1,982), short = widgetGeometry('bad',1,492);
    expect(full.maskWidth).toBe(327); expect(full.maskHeight).toBeCloseTo(417.95, 2);
    expect(short.growth).toBeLessThan(1);
    for(const h of [300,492,720,822,982]) {
      const g=widgetGeometry('bad',1,h);
      // Reserve 77px for timer + bottom inset, and the rotated bubble's upper edge.
      expect(h - 77 + g.bubbleTop - 24).toBeGreaterThanOrEqual(0);
    }
  });
  test('bad posture keeps the neutral artwork in live and new recordings', () => {
    expect(widgetArtworkPose('bad')).toBe('good');
    const bad = {...petEvent(0, focus), badAt: 0};
    expect(bad.widgetVersion).toBe(4);
    expect(replayPet([bad], .1)?.growth).toBeCloseTo(.1 / 3);
    expect(replayPet([bad], 3)?.growth).toBe(1);
    const replay = replayPet([bad], 1.5)!;
    expect(replay.frame).toBe(0); expect(replay.growth).toBe(.5);
    expect(replay.angle).not.toBe(0);
    expect(replayPet([{...bad, widgetVersion: 2}], 2.5)?.frame).toBe(1);
    const paused = petEvent(3, {...focus, paused: true}, bad);
    expect(replayPet([bad, paused], 3)?.frame).toBe(409);
  });
  test('recorded warning and recovery retain each version’s growth timing', () => {
    const bad = {...petEvent(0, focus), badAt: 0};
    const good = petEvent(1.5, {...focus, bad: false}, bad);
    expect(replayPet([bad, good], 1.5)?.growth).toBe(.5);
    expect(replayPet([bad, good], 2.1)?.growth).toBe(0);
    const delayed = {...bad, widgetVersion: 3 as const};
    expect(replayPet([delayed], 2)?.growth).toBe(0);
    expect(replayPet([delayed], 3.5)?.growth).toBe(.5);
    expect(replayPet([delayed], 5)?.growth).toBe(1);
    expect(replayPet([delayed, {...good, widgetVersion: 3}], 1.5)?.growth).toBe(0);
    for (const widgetVersion of [undefined, 2] as const) {
      expect(replayPet([{...bad, widgetVersion}], 2.5)?.growth).toBe(.5);
    }
  });
  test('old Lottie layers and their keyframe timing are preserved byte-for-byte', () => {
    const original=JSON.parse(readFileSync('public/animations/anago/normal-nago/expression-states.json','utf8'));
    const next=JSON.parse(readFileSync('public/animations/anago/normal-nago/widget-states-v2.json','utf8'));
    expect(next.layers.slice(0,original.layers.length)).toEqual(original.layers);
    expect(next.layers.filter((layer:{ip:number;op:number})=>layer.ip<=408&&layer.op>408)).toHaveLength(7);
    expect(next.layers.every((layer:{op:number})=>layer.op<=next.op)).toBe(true);
  });
  test('new recordings distinguish rest/pause while old recordings retain their frame mapping', () => {
    expect(ASSET_VERSION).toBe('widget-states-v2');
    const paused=petEvent(0,{...focus,paused:true});
    const rest=petEvent(0,{...focus,bad:false,phase:'rest'});
    expect(replayPet([paused],2)?.frame).toBe(408);
    expect(replayPet([paused],2)?.remainingMs).toBe(120000);
    expect(replayPet([rest],2)?.frame).toBe(2);
    const legacy={...paused,widgetVersion:undefined};
    expect(replayPet([legacy],2)?.frame).toBe(2);
  });
});
