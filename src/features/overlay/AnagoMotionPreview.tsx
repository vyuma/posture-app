import { useEffect, useRef, useState } from "react";

import { WEB_APP_PATH } from "../../routes";
import { WebInlineCharacterOverlay } from "./WebInlineCharacterOverlay";
import { AnagoPlayfulPreview } from "./AnagoPlayfulPreview";
import "./anago-motion-preview.css";

type Mode = "good" | "bad" | "paused" | null;
const choices = [
  { mode: "good", label: "良い姿勢" },
  { mode: "bad", label: "怒り（姿勢不良）" },
  { mode: "paused", label: "休憩" },
  { mode: null, label: "隠す" },
] as const;

export default function AnagoMotionPreview() {
  const [view, setView] = useState<"playful" | "states">("playful");
  const [mode, setMode] = useState<Mode>("good");
  const [playing, setPlaying] = useState(false);
  const [sinkEnabled, setSinkEnabled] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    document.title = "アナゴのモーションプレビュー | PiiiN";
    document.documentElement.lang = "ja";

    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
    };
  }, []);

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying(false);
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const play = () => {
    stop();
    setPlaying(true);
    const sequence: Mode[] = ["good", "paused", "good", "bad", "good", null, "good"];
    sequence.forEach((next, index) => {
      timers.current.push(setTimeout(() => setMode(next), index * 3000));
    });
    timers.current.push(setTimeout(() => setPlaying(false), sequence.length * 3000));
  };

  return (
    <main className="anago-preview">
      <div className="anago-preview-copy">
        <span className="anago-preview-eyebrow">
          アナゴ・モーションプレビュー
        </span>
        <h1>アナゴの小さなリアクション</h1>
        <div className="anago-preview-tabs" role="group" aria-label="プレビューの種類">
          <button aria-pressed={view === "playful"} onClick={() => { stop(); setView("playful"); }}>小さな遊び（試作）</button>
          <button aria-pressed={view === "states"} onClick={() => { stop(); setMode("good"); setView("states"); }}>姿勢の状態遷移</button>
        </div>
        {view === "playful" ? <AnagoPlayfulPreview /> : <>
        <p>
          状態を選んで、動きのつながりを確認してください。
          <br />
          猫背から回復すると、うれしいポーズを少し見せてから良い姿勢に戻ります。休憩すると体をゆっくり曲げて眠ります。
        </p>
        <div className="anago-preview-controls">
          {choices.map((choice) => (
            <button key={choice.label} aria-pressed={mode === choice.mode} onClick={() => { stop(); setMode(choice.mode); }}>
              {choice.label}
            </button>
          ))}
        </div>
        <button className="anago-preview-play" onClick={playing ? stop : play}>
          {playing ? "自動再生を停止" : "一周再生 ↗"}
        </button>
        <label className="anago-preview-sink-toggle">
          <input type="checkbox" checked={sinkEnabled} onChange={event => setSinkEnabled(event.target.checked)} />
          猫背のとき下へ沈む
        </label>
        </>}
        <p className="anago-preview-note">
          開発用プレビュー・遊びの試作はこのページだけで再生されます。
          <br />
          姿勢の状態遷移は、アプリと同じキャラクターと動きを再生します。
        </p>
        <a href={WEB_APP_PATH}>PiiiNに戻る</a>
      </div>
      {view === "states" && <WebInlineCharacterOverlay mode={mode} sinkEnabled={sinkEnabled} />}
    </main>
  );
}
