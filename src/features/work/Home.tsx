import { useEffect, useRef, useState } from 'react';
import type { Collection, Card } from './model';
import { catalog, character, CharacterCard, Portrait } from './CharacterCard';
import { Icon } from './Dialog';

export function Brand() { return <img className="work-brand" src="/logo/logo_white.png" alt="PiiiN" />; }

function HomePet({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let inView = true;
    const update = () => setMoving(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  return <div ref={ref} className="work-home-pet" data-moving={moving}><Portrait id={id} /></div>;
}

export function Home({ collection, onStart, onPick, onCard, onReset, onStory, onSound }: { collection: Collection; onStart: () => void; onPick: () => void; onCard: (card: Card) => void; onReset: () => void; onStory: () => void; onSound: () => void }) {
  const [menu, setMenu] = useState(false); const [order, setOrder] = useState('number');
  const owned = new Map(collection.cards.map(card => [card.characterId, card]));
  const slots = Array.from({ length: 111 }, (_, index) => ({ index, id: catalog[index]?.id }));
  if (order === 'acquired') slots.sort((a, b) => { const ai = collection.cards.findIndex(card => card.characterId === a.id); const bi = collection.cards.findIndex(card => card.characterId === b.id); return (ai < 0 ? 1000 + a.index : ai) - (bi < 0 ? 1000 + b.index : bi); });
  const selected = character(collection.selectedId);
  return <main className="work-home"><header className="work-home-hero"><Brand /><div className="work-profile-wrap"><button className="work-about" onClick={onStory}>ピンアナゴとは</button><button className="work-profile" aria-label="プロフィールメニュー" aria-expanded={menu} onClick={() => setMenu(!menu)}><Portrait id={selected.id} /></button>{menu && <nav className="work-profile-menu" aria-label="プロフィール"><button onClick={() => { setMenu(false); onSound(); }}>サウンド設定</button><button onClick={() => { setMenu(false); onStory(); }}>ストーリーを見る</button><button onClick={() => { setMenu(false); onReset(); }}>コレクションを初期化</button></nav>}</div>
    <h1>正しい姿勢を継続して<br />ピンアナゴをゲットしよう！</h1><div className="work-hero-actions"><button className="work-button orange" onClick={onStart}>作業スタート</button><button className="work-button white" onClick={onPick}>ピンアナゴを変更</button></div><HomePet key={selected.id} id={selected.id} /></header>
    <section className="work-collection" aria-label="コレクション"><div className="work-collection-heading"><h2>コレクション <span><b>{collection.cards.length}</b> / 111</span></h2><label className="work-sort"><svg className="work-sort-arrow" viewBox="0 0 14 14" aria-hidden="true"><path d="M0 0h14L7 14Z" fill="currentColor" /></svg><select aria-label="コレクションの並び順" value={order} onChange={event => setOrder(event.target.value)}><option value="number">番号順</option><option value="acquired">獲得順</option></select></label></div>
      <div className="work-card-grid">{slots.map(({ index, id }) => <CharacterCard key={index} index={index} id={id && owned.has(id) ? id : undefined} onClick={id && owned.has(id) ? () => onCard(owned.get(id)!) : undefined} />)}</div>
    </section></main>;
}
export function CharacterPicker({ collection, onConfirm, onClose }: { collection: Collection; onConfirm: (id: string) => void; onClose: () => void }) {
  const owned = new Set(collection.cards.map(card => card.characterId));
  const choices = catalog.filter(item => owned.has(item.id));
  const [draft, setDraft] = useState(choices.find(item => item.id === collection.selectedId)?.id ?? choices[0]?.id ?? null);
  const selected = character(draft);
  const message = draft === 'oto-anago' ? '眠い・・・' : '頑張ろう！';
  return <main className="work-screen work-picker">
    <Brand />
    <button className="work-close screen-close" onClick={onClose} aria-label="変更をキャンセル"><Icon name="close" /></button>
    <section className="work-picker-preview" aria-label="今日のピンアナゴ">
      <h1>今日のピンアナゴ</h1>
      <div className="work-picker-pet"><Portrait id={selected.id} /></div>
      {draft && <p className="work-bubble" aria-live="polite">{message}</p>}
    </section>
    <section className="work-picker-list" aria-label="ピンアナゴを選択">
      <div className="work-picker-grid" tabIndex={0} aria-label="獲得済みのピンアナゴ">
        {choices.map(item => <CharacterCard key={item.id} id={item.id} index={catalog.indexOf(item)} selected={draft === item.id} onClick={() => setDraft(item.id)} />)}
        {!choices.length && <p className="work-picker-empty">まだ仲間がいません<br />姿勢チェックで、仲間を増やそう！</p>}
      </div>
      <footer><button className="work-button blue" disabled={!draft} onClick={() => draft && onConfirm(draft)}>決定</button></footer>
    </section>
  </main>;
}
