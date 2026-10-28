import type { Label, Sample } from "./main";

/**
 * 「頭を前に出しても深度の値が動かない」原因を切り分けるための集計。
 *
 * H1 モデルの限界：頭が実際に前に出ても、深度の耳−肩差が分離しない。
 * H2 指標の問題：背景合わせした耳−肩差では分離するが、旧指標では埋もれる。
 *
 * 前提として、頭が本当に前に出たこと（Face で測った移動量）と、
 * 体ごと近づいたときに深度が反応すること（陽性対照）を確かめる。
 */

const MIN_SAMPLES = 10;
/** 頭を前に出したとみなす最小の移動量。 */
const MANIPULATION_CM = 2;
/** ラベル間で「分離している」とみなす d′。 */
const SEPARATED_D = 1;
/** 陽性対照（体ごと近づく）で深度が反応しているとみなす d′。 */
const POSITIVE_CONTROL_D = 2;

export const SIGNALS = {
  oldMetric: { name: "旧指標（レンジ割り）", digits: 4, pick: (s: Sample) => s.oldMetric },
  earChange: { name: "耳の変化（背景合わせ）", digits: 4, pick: (s: Sample) => s.earChange },
  shoulderChange: { name: "肩の変化（背景合わせ）", digits: 4, pick: (s: Sample) => s.shoulderChange },
  neckChange: { name: "耳−肩の変化（背景合わせ）", digits: 4, pick: (s: Sample) => s.neckChange },
  faceForwardCm: { name: "Face 頭の前方移動 cm", digits: 1, pick: (s: Sample) => s.faceForwardCm },
  mediapipeHeadForwardDeg: {
    name: "MediaPipe 頭部前傾角 °",
    digits: 1,
    pick: (s: Sample) => s.mediapipeHeadForwardDeg,
  },
} as const;

export type SignalKey = keyof typeof SIGNALS;

type Stats = { mean: number; sd: number; n: number };

type Row = {
  good: Stats | null;
  forwardHead: Stats | null;
  closer: Stats | null;
  dForward: number | null;
  dCloser: number | null;
};

export type Verdict = {
  level: "pending" | "ok" | "warn" | "bad";
  headline: string;
  reasons: string[];
  rows: Record<SignalKey, Row>;
};

function stats(samples: Sample[], label: Label, key: SignalKey): Stats | null {
  const values = samples
    .filter((s) => s.settled && s.label === label)
    .map(SIGNALS[key].pick)
    .filter((v): v is number => v !== null);
  if (values.length === 0) {
    return null;
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return { mean, sd: Math.sqrt(variance), n: values.length };
}

/** 2群の平均差を、ばらつきの平均で割った分離度。符号は「後者 − 前者」。 */
function dPrime(a: Stats | null, b: Stats | null) {
  if (!a || !b || a.n < 2 || b.n < 2) {
    return null;
  }
  const pooled = Math.sqrt((a.sd ** 2 + b.sd ** 2) / 2);
  return pooled > 0 ? (b.mean - a.mean) / pooled : null;
}

const enough = (s: Stats | null): s is Stats => s !== null && s.n >= MIN_SAMPLES;
const f = (value: number | null, digits = 2) => (value === null ? "-" : value.toFixed(digits));

export function buildVerdict(samples: Sample[]): Verdict {
  const rows = Object.fromEntries(
    (Object.keys(SIGNALS) as SignalKey[]).map((key) => {
      const good = stats(samples, "good", key);
      const forwardHead = stats(samples, "forward-head", key);
      const closer = stats(samples, "closer", key);
      return [key, { good, forwardHead, closer, dForward: dPrime(good, forwardHead), dCloser: dPrime(good, closer) }];
    }),
  ) as Record<SignalKey, Row>;

  const reasons: string[] = [];
  const neck = rows.neckChange;
  if (!enough(neck.good) || !enough(neck.forwardHead)) {
    return {
      level: "pending",
      headline: `データ不足：「1 良い姿勢」と「2 頭を前に出す」をそれぞれ ${MIN_SAMPLES} 件以上（300ms 間隔で約 4 秒以上）記録してください。`,
      reasons: ["基準の学習（最初の 5 秒）が終わってからの値だけが集計されます。"],
      rows,
    };
  }

  // 1. 操作の確認：頭は本当に前に出たか。
  const face = rows.faceForwardCm;
  const movedCm = face.good && face.forwardHead ? face.forwardHead.mean - face.good.mean : null;
  if (movedCm === null) {
    reasons.push("Face で頭の移動量を測れていません（顔が検出されていない）。操作が十分かどうかは未確認です。");
  } else if (movedCm < MANIPULATION_CM) {
    return {
      level: "warn",
      headline: `判定不能：Face で見ると頭は ${movedCm.toFixed(1)} cm しか前に出ていません（${MANIPULATION_CM} cm 以上が必要）。もっとはっきり頭を前に出して取り直してください。`,
      reasons,
      rows,
    };
  } else {
    reasons.push(`操作の確認 OK：Face で見ると頭は約 ${movedCm.toFixed(1)} cm 前に出ています（d′=${f(face.dForward)}）。`);
  }

  // 2. 陽性対照：体ごと近づいたとき、深度は反応するか。
  const ear = rows.earChange;
  let positiveControl: boolean | null = null;
  if (enough(ear.closer)) {
    positiveControl = (ear.dCloser ?? 0) >= POSITIVE_CONTROL_D;
    reasons.push(
      positiveControl
        ? `陽性対照 OK：体ごと近づくと、深度の耳の値は大きく動きます（d′=${f(ear.dCloser)}）。`
        : `陽性対照 NG：体ごと近づいても、深度の耳の値が分離しません（d′=${f(ear.dCloser)}）。背景合わせが効いていないか、パイプラインに問題があります。`,
    );
    if (!positiveControl) {
      return { level: "bad", headline: "パイプラインを疑う：大きな奥行きの変化すら捉えられていません。", reasons, rows };
    }
  } else {
    reasons.push("陽性対照が未記録です。「5 体ごと近づく」を記録すると、深度が大きな変化を捉えられるかを確認できます。");
  }

  // 3. 本題：耳−肩差は分離するか。旧指標と比べる。
  const neckD = neck.dForward ?? 0;
  const oldD = rows.oldMetric.dForward ?? 0;
  const earD = ear.dForward ?? 0;
  reasons.push(
    `d′（頭を前に − 良い姿勢）：耳−肩 ${f(neck.dForward)} / 耳 ${f(ear.dForward)} / 肩 ${f(rows.shoulderChange.dForward)} / 旧指標 ${f(rows.oldMetric.dForward)} / Face ${f(face.dForward)} / MediaPipe ${f(rows.mediapipeHeadForwardDeg.dForward)}`,
  );
  if (neckD <= -SEPARATED_D) {
    reasons.push("耳−肩差が想定と逆向き（頭が遠ざかった側）に動いています。読み取り位置が髪や背景に乗っていないか確認してください。");
  }

  if (neckD >= SEPARATED_D) {
    return oldD < SEPARATED_D
      ? {
          level: "ok",
          headline: `H2 指標の問題：背景合わせした耳−肩差では分離します（d′=${f(neckD)}）が、旧指標では埋もれています（d′=${f(oldD)}）。指標を差し替えれば使えます。`,
          reasons,
          rows,
        }
      : {
          level: "ok",
          headline: `深度で検出できています：耳−肩差 d′=${f(neckD)}、旧指標 d′=${f(oldD)}。動きが小さく見えたのは表示スケールのせいです。`,
          reasons,
          rows,
        };
  }

  if (earD >= SEPARATED_D) {
    return {
      level: "warn",
      headline: `頭は近づいて見えます（耳 d′=${f(earD)}）が、肩も一緒に動くため耳−肩差では打ち消されています（d′=${f(neckD)}）。`,
      reasons,
      rows,
    };
  }

  return {
    level: "bad",
    headline:
      `H1 モデルの限界：頭が実際に前に出ても、深度の耳−肩差は分離しません（d′=${f(neckD)}）。` +
      (positiveControl ? "体ごとの移動は捉えているので、人物の内側の数 cm の差を、この解像度のモデルが出せていません。" : ""),
    reasons,
    rows,
  };
}
