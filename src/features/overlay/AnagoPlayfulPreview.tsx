import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";

const takes = [
  { id: "runrun", name: "るんるん", frames: [0, 150], duration: "5秒", description: "いい調子。小さくリズムをとって、最後にこくん。", mood: "ごきげん・おすすめ" },
  { id: "kyoro", name: "きょろっ", frames: [150, 330], duration: "6秒", description: "何か聞こえた？ 首をかしげて、ぱちぱち。", mood: "好奇心いっぱい" },
  { id: "doze", name: "うとうと…はっ", frames: [330, 540], duration: "7秒", description: "安心してうとうと。はっと気づいて、すまし顔。", mood: "ちょっとおとぼけ" },
] as const;

export function AnagoPlayfulPreview() {
  const container = useRef<HTMLDivElement>(null);
  const animation = useRef<AnimationItem | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(0);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [aspectRatio, setAspectRatio] = useState("860 / 1022");

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) {
        animation.current?.pause();
        setPaused(true);
      }
    };
    update();
    preference.addEventListener("change", update);
    let disposed = false;
    let player: AnimationItem | undefined;
    const controller = new AbortController();
    void Promise.all([
      import("lottie-web/build/player/lottie_light"),
      fetch("/animations/anago/normal-nago/playful-preview.json", { signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error("Animation unavailable"); return response.json(); }),
    ]).then(([{ default: lottie }, animationData]) => {
      if (disposed || !container.current) return;
      setAspectRatio(`${animationData.w} / ${animationData.h}`);
      player = lottie.loadAnimation({ container: container.current, renderer: "svg", loop: false, autoplay: false, animationData });
      animation.current = player;
      player.addEventListener("DOMLoaded", () => {
        player?.goToAndStop(0, true);
        setReady(true);
      });
      player.addEventListener("complete", () => { setActive(false); setPaused(false); });
      player.addEventListener("data_failed", () => setError(true));
    }).catch(() => { if (!disposed) setError(true); });
    return () => {
      disposed = true;
      controller.abort();
      preference.removeEventListener("change", update);
      player?.destroy();
      animation.current = null;
    };
  }, []);

  const play = (index: number) => {
    if (!animation.current || !ready || active) return;
    setSelected(index);
    setActive(true);
    setPaused(false);
    animation.current.setSpeed(speed);
    animation.current.playSegments([...takes[index].frames], true);
  };

  return <>
    <section className="anago-playful" aria-label="小さな遊びの試作">
      <p>姿勢をキープしていたら、アナゴも楽しくなってきた。<br />ボタンを押すと、一度だけ遊んで元の姿に戻ります。</p>
      <div className="anago-playful-choices">
        {takes.map((take, index) => <button key={take.id} aria-pressed={selected === index} disabled={!ready || active || error} onClick={() => play(index)}>
          <span className="anago-playful-meta">0{index + 1} · {take.mood} · {take.duration}</span>
          <strong>{take.name}</strong>
          <span>{take.description}</span>
        </button>)}
      </div>
      <div className="anago-playful-transport">
        <button disabled={!ready || error} onClick={() => {
          if (!active) { play(selected); return; }
          if (paused) animation.current?.play(); else animation.current?.pause();
          setPaused(!paused);
        }}>{active ? paused ? "続きから再生" : "一時停止" : "もう一度見る"}</button>
        <label>速さ <select value={speed} onChange={event => {
          const value = Number(event.target.value);
          setSpeed(value);
          animation.current?.setSpeed(value);
        }}><option value={1}>通常</option><option value={0.5}>ゆっくり（0.5倍）</option></select></label>
      </div>
      <label className="anago-playful-effects-toggle">
        <input type="checkbox" checked={effectsEnabled} onChange={event => setEffectsEnabled(event.target.checked)} />
        リアクションの飾りを表示（音符・？・Zzz・びっくり）
      </label>
      <p className="anago-preview-note" role="status">
        {error ? "アニメーションを読み込めませんでした。ページを再読み込みしてください。" : !ready ? "アナゴを準備しています…" : active ? `${takes[selected].name} ${paused ? "一時停止中" : "再生中 — 元の姿に戻ってから次の案を選べます。"}` : "気になる案を選んでください。自動では動きません。"}
        {reducedMotion && <><br />端末の「動きを減らす」設定が有効です。再生ボタンを押したときだけ動きます。</>}
      </p>
    </section>
    <div className="web-inline-character-overlay" data-effects-enabled={effectsEnabled} role="img" aria-label={`アナゴ：${takes[selected].name}の動作プレビュー（飾り${effectsEnabled ? "あり" : "なし"}）`}>
      <div className="web-inline-character" style={{ aspectRatio }}><div className="web-inline-character-lottie" ref={container} /></div>
    </div>
  </>;
}
