import { REASONS, type Direction, type Reason } from '../posture/feedback';
import type { Session } from './model';

const patterns: Record<Reason, string> = {
  headShoulderAngle: '肩に対する頭の位置が変わる場面があったね。',
  headShoulderDistance: '頭と肩の間隔が変わる場面があったね。', neckAngle: '首の角度が変わる場面があったね。',
  earShoulderBalance: '耳と肩のバランスが変わる場面があったね。', faceScale: '顔が大きく映る場面があったね。',
  faceNear: '顔が近づく場面があったね。', headForward: '頭が前に出る場面があったね。',
  headTilt: '頭が傾く場面があったね。', bodyTilt: '体が傾く場面があったね。',
  headShift: '頭が横にずれる場面があったね。', headPitch: 'あごの位置が変わる場面があったね。',
  shoulderTilt: '左右の肩の高さが変わる場面があったね。', headTurn: '顔が横を向く場面があったね。',
};
const directed: Partial<Record<Reason, Partial<Record<Direction, string>>>> = {
  headShoulderAngle: { forward: '頭が前に出る場面があったね。', backward: '頭が後ろに傾く場面があったね。' },
  headTilt: { left: '頭が左に傾く場面があったね。', right: '頭が右に傾く場面があったね。' },
  bodyTilt: { left: '体が左に傾く場面があったね。', right: '体が右に傾く場面があったね。' },
  headShift: { left: '頭が左にずれる場面があったね。', right: '頭が右にずれる場面があったね。' },
  headPitch: { down: 'あごが下がる場面があったね。', up: 'あごが上がる場面があったね。' },
  shoulderTilt: { left: '左肩が高くなる場面があったね。', right: '右肩が高くなる場面があったね。' },
  headTurn: { left: '顔が左を向く場面があったね。', right: '顔が右を向く場面があったね。' },
};
const suggestions: Record<Reason, string> = {
  headShoulderAngle: '次は肩に対する頭の位置を意識してみよう。',
  headShoulderDistance: '次は登録したときの頭と肩の間隔を意識してみよう。', neckAngle: '次は登録したときの首の角度を意識してみよう。',
  earShoulderBalance: '次は登録したときの耳と肩のバランスを意識してみよう。', faceScale: '次は画面との距離も意識してみよう。',
  faceNear: '次は画面との距離も意識してみよう。', headForward: '次は肩に対する頭の位置を意識してみよう。',
  headTilt: '次は頭の傾きを意識してみよう。', bodyTilt: '次は体の傾きを意識してみよう。',
  headShift: '次は肩の中央に頭を戻すことを意識してみよう。', headPitch: '次は登録したときのあごの位置を意識してみよう。',
  shoulderTilt: '次は左右の肩の高さを意識してみよう。', headTurn: '次は登録したときの顔の向きを意識してみよう。',
};

/** Adjacent observed seconds only: gaps, pauses and new baselines cannot imply recovery. */
export function summarizeFeedback(session: Pick<Session, 'samples'>) {
  const reasons = Object.fromEntries(REASONS.map(reason => [reason, { observedMs: 0, activeMs: 0, directions: {} as Partial<Record<Direction, number>> }])) as Record<Reason, { observedMs: number; activeMs: number; directions: Partial<Record<Direction, number>> }>;
  let observedMs = 0, goodMs = 0, badMs = 0, recovered = false, badRun = 0, goodRun = 0, pendingRecovery = false;
  for (let i = 1; i < session.samples.length; i++) {
    const a = session.samples[i - 1], b = session.samples[i], ms = b.focusMs - a.focusMs;
    if (!a.feedback || ![2,3].includes(a.feedback.version) || b.feedback?.version !== a.feedback.version || a.state === 'untracked' || b.state === 'untracked' ||
        a.segment !== b.segment || a.calibrationId !== b.calibrationId || b.sequence !== a.sequence + 1 ||
        ms <= 0 || ms > 1500 || Math.abs(b.elapsedMs - a.elapsedMs - ms) > 1 ||
        b.feedback.observedAtMs <= a.feedback.observedAtMs || b.feedback.observedAtMs - a.feedback.observedAtMs > 1500 ||
        !REASONS.some(reason => Number.isFinite(a.feedback!.evidence[reason]) && Number.isFinite(b.feedback!.evidence[reason]))) {
      badRun = goodRun = 0; pendingRecovery = false; continue;
    }
    observedMs += ms;
    if (a.state === 'good' && b.state === 'good') {
      goodMs += ms; goodRun += ms; badRun = 0;
      if (pendingRecovery && goodRun >= 3000) recovered = true;
    } else {
      goodRun = 0;
      if (a.state === 'bad' && b.state === 'bad') { badMs += ms; badRun += ms; if (badRun >= 3000) pendingRecovery = true; }
      if (a.state === 'good' && b.state === 'bad') { badRun = 0; pendingRecovery = false; }
    }
    for (const reason of REASONS) {
      const av = a.feedback.evidence[reason], bv = b.feedback.evidence[reason], stats = reasons[reason];
      if (av === null || bv === null || !Number.isFinite(av) || !Number.isFinite(bv)) continue;
      stats.observedMs += ms;
      if (a.state !== 'bad' || b.state !== 'bad' || av < 1 || bv < 1) continue;
      stats.activeMs += ms;
      const direction = a.feedback.directions?.[reason];
      if (direction && direction === b.feedback.directions?.[reason]) stats.directions[direction] = (stats.directions[direction] ?? 0) + ms;
    }
  }
  return { reasons, observedMs, goodMs, badMs, recovered };
}

export function postureComment(session: Session): [string, string] | null {
  if (session.feedbackVersion !== 2 && session.feedbackVersion !== 3) return null;
  const summary = summarizeFeedback(session);
  if (summary.observedMs < 10000 || summary.observedMs < session.focusMs * .5) return [
    '今回は姿勢を確認できた時間が短かったね。', '顔と肩が映る位置で、また測ってみよう。',
  ];
  const reason = REASONS.filter(r => summary.reasons[r].activeMs >= 3000 && summary.reasons[r].activeMs >= summary.reasons[r].observedMs * .1)
    .sort((a, b) => summary.reasons[b].activeMs - summary.reasons[a].activeMs)[0];
  if (reason) {
    const stats = summary.reasons[reason];
    const direction = (Object.keys(stats.directions) as Direction[]).find(d => stats.directions[d]! >= stats.activeMs * .6);
    return [direction ? directed[reason]?.[direction] ?? patterns[reason] : patterns[reason],
      summary.recovered ? '登録した姿勢に戻せた場面もあったよ。' : suggestions[reason]];
  }
  if (summary.goodMs >= session.focusMs * .8) return ['登録した姿勢をよく保てていたね。', '次もこの調子で、無理なく続けよう。'];
  if (summary.badMs < 3000) return ['今回の測定、お疲れさま。', '次もときどき姿勢を意識してみよう。'];
  return ['登録した姿勢から変わる場面があったね。', summary.recovered ? '登録した姿勢に戻せた場面もあったよ。' : '次もときどき姿勢を意識してみよう。'];
}
