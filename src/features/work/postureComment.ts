import { REASONS, type Direction, type Reason } from '../posture/feedback';
import { preferredFeedbackReason } from '../posture/feedbackPriority';
import type { Session } from './model';

const patterns: Record<Reason, string> = {
  headShoulderAngle: '今日は肩に対する頭の位置が変わりがちだったね。',
  headShoulderDistance: '今日は頭と肩の間隔が変わりがちだったね。', neckAngle: '今日は首の角度が変わりがちだったね。',
  earShoulderBalance: '今日は耳と肩のバランスが崩れがちだったね。', faceScale: '今日は顔が大きく映りがちだったね。',
  faceNear: '今日は画面に顔が近づきがちだったね。', headForward: '今日は頭が前に出がちだったね。',
  headTilt: '今日は頭が傾きがちだったね。', bodyTilt: '今日は体が傾きがちだったね。',
  headShift: '今日は頭が横にずれがちだったね。', headPitch: '今日はあごの位置が変わりがちだったね。',
  shoulderTilt: '今日は左右の肩の高さがずれがちだったね。', headTurn: '今日は顔が横を向きがちだったね。',
};
const directed: Partial<Record<Reason, Partial<Record<Direction, string>>>> = {
  headShoulderAngle: { forward: '今日は頭が前に出がちだったね。', backward: '今日は頭が後ろに傾きがちだったね。' },
  headTilt: { left: '今日は頭が左に傾きがちだったね。', right: '今日は頭が右に傾きがちだったね。' },
  bodyTilt: { left: '今日は体が左に傾きがちだったね。', right: '今日は体が右に傾きがちだったね。' },
  headShift: { left: '今日は頭が左にずれがちだったね。', right: '今日は頭が右にずれがちだったね。' },
  headPitch: { down: '今日はあごが下がりがちだったね。', up: '今日はあごが上がりがちだったね。' },
  shoulderTilt: { left: '今日は左肩が上がりがちだったね。', right: '今日は右肩が上がりがちだったね。' },
  headTurn: { left: '今日は顔が左を向きがちだったね。', right: '今日は顔が右を向きがちだったね。' },
};
const suggestions: Record<Reason, string> = {
  headShoulderAngle: '首や肩に負担がかかりやすいから、明日は肩の真上に頭を戻してみよう！',
  headShoulderDistance: '首や肩に負担がかかりやすいから、明日は肩の力を抜いて、登録したときの頭の位置に戻してみよう！', neckAngle: '首や肩に負担がかかりやすいから、明日は首を曲げすぎず、画面を正面から見てみよう！',
  earShoulderBalance: '首や肩に負担がかかりやすいから、明日は左右の肩の高さをそろえて、頭を中央に戻してみよう！', faceScale: '目や背中に負担がかかりやすいから、明日はもう少し画面から離れてみよう！',
  faceNear: '目や背中に負担がかかりやすいから、明日はもう少し画面から離れてみよう！', headForward: '首や肩に負担がかかりやすいから、明日は肩の真上に頭を戻してみよう！',
  headTilt: '首や肩に負担がかかりやすいから、明日は頭をまっすぐにしてみよう！', bodyTilt: '背中や腰に負担がかかりやすいから、明日は体を中央に戻して座ってみよう！',
  headShift: '首や肩に負担がかかりやすいから、明日は左右の肩の中央に頭を戻してみよう！', headPitch: '首に負担がかかりやすいから、明日はあごを登録したときの位置に戻してみよう！',
  shoulderTilt: '肩こりにつながりやすいから、明日は左右の肩の高さをそろえてみよう！', headTurn: '首や肩に負担がかかりやすいから、明日は画面を正面に置いて、顔も正面に向けてみよう！',
};

/** Adjacent observed seconds only: gaps, pauses and new baselines cannot imply recovery. */
export function summarizeFeedback(session: Pick<Session, 'samples'>) {
  const reasons = Object.fromEntries(REASONS.map(reason => [reason, { observedMs: 0, activeMs: 0, commentMs: 0, directions: {} as Partial<Record<Direction, number>> }])) as Record<Reason, { observedMs: number; activeMs: number; commentMs: number; directions: Partial<Record<Direction, number>> }>;
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
    const [ac, bc] = [a.feedback, b.feedback].map(feedback => {
      const active = REASONS.filter(reason => Number.isFinite(feedback.evidence[reason]) && feedback.evidence[reason]! >= 1);
      return active.map(reason => preferredFeedbackReason(reason, active, feedback.directions));
    });
    for (const reason of REASONS) {
      const av = a.feedback.evidence[reason], bv = b.feedback.evidence[reason], stats = reasons[reason];
      if (av === null || bv === null || !Number.isFinite(av) || !Number.isFinite(bv)) continue;
      stats.observedMs += ms;
      if (a.state !== 'bad' || b.state !== 'bad' || av < 1 || bv < 1) continue;
      stats.activeMs += ms;
      if (ac.includes(reason) && bc.includes(reason)) stats.commentMs += ms;
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
    '今日は姿勢を確認できた時間が短かったね。', '明日は顔と肩が映る位置で、また測ってみよう！',
  ];
  const reason = REASONS.filter(r => summary.reasons[r].commentMs >= 3000 && summary.reasons[r].commentMs >= summary.reasons[r].observedMs * .1)
    .sort((a, b) => summary.reasons[b].commentMs - summary.reasons[a].commentMs)[0];
  if (reason) {
    const stats = summary.reasons[reason];
    const direction = (Object.keys(stats.directions) as Direction[]).find(d => stats.directions[d]! >= stats.activeMs * .6);
    return [direction ? directed[reason]?.[direction] ?? patterns[reason] : patterns[reason],
      summary.recovered ? 'でも、登録した姿勢に戻せていたよ！' : suggestions[reason]];
  }
  if (summary.goodMs >= session.focusMs * .8) return ['今日は登録した姿勢をよく保てていたね。', '明日もこの調子で、無理なく続けよう！'];
  if (summary.badMs < 3000) return ['今日の測定、お疲れさま！', '明日はときどき姿勢を整えてみよう！'];
  return ['今日は登録した姿勢から変わりがちだったね。', summary.recovered ? 'でも、登録した姿勢に戻せていたよ！' : '明日はときどき姿勢を整えてみよう！'];
}
