import { LanguageMenu } from '../i18n/LanguageMenu';
import { t, useAppLanguage } from "../i18n";
import { getCharacterAtSlotIndex } from "../characters/characterCatalog";
import { useEffect, useRef, useState } from 'react';
import type { Collection, Card } from './model';
import { catalog, character, characterStyle, CharacterCard, Portrait } from './CharacterCard';
import { Icon } from './Dialog';
import { CollectionSort, type CollectionOrder } from './CollectionSort';
import { CharacterSpeech } from './CharacterSpeech';
import { Brand } from './Brand';
import './home-layout.css';
import './picker-presentation.css';

export { Brand } from './Brand';

function HomePet({ id }: { id: string }) {
  useAppLanguage();
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
  return <div ref={ref} className="work-home-pet" data-moving={moving}><div className="work-home-pet-motion"><Portrait id={id} /></div></div>;
}

export function Home({ collection, onStart, onPick, onCard, onReset, onStory, onSound, onSettings, onLegal }: { collection: Collection; onStart: () => void; onPick: () => void; onCard: (card: Card) => void; onReset: () => void; onStory: () => void; onSound: () => void; onSettings?: () => void; onLegal?: (page: 'privacy' | 'support') => void }) {
  useAppLanguage();
  const [menu, setMenu] = useState(false); const [order, setOrder] = useState<CollectionOrder>('number');
  const owned = new Map(collection.cards.map(card => [card.characterId, card]));
  const slots = Array.from({ length: 111 }, (_, index) => ({ index, id: getCharacterAtSlotIndex(index)?.id }));
  if (order === 'acquired') slots.sort((a, b) => { const ai = collection.cards.findIndex(card => card.characterId === a.id); const bi = collection.cards.findIndex(card => card.characterId === b.id); return (ai < 0 ? 1000 + a.index : ai) - (bi < 0 ? 1000 + b.index : bi); });
  const selected = character(collection.selectedId);
  return <main className="work-home"><header className="work-home-hero"><Brand /><div className="work-profile-wrap"><LanguageMenu /><button className="work-profile" style={characterStyle(selected.id)} aria-label={t("プロフィールメニュー")} aria-expanded={menu} onClick={() => setMenu(!menu)}><Portrait id={selected.id} /></button>{menu && <nav className="work-profile-menu" aria-label={t("プロフィール")}>{onSettings && <button onClick={() => { setMenu(false); onSettings(); }}>{t("設定")}</button>}<button onClick={() => { setMenu(false); onSound(); }}>{t("サウンド設定")}</button><button onClick={() => { setMenu(false); onStory(); }}>{t("ストーリーを見る")}</button><button onClick={() => { setMenu(false); onReset(); }}>{t("コレクションを初期化")}</button>{onLegal && <><button onClick={() => { setMenu(false); onLegal('privacy'); }}>{t("プライバシー・データ管理")}</button><button onClick={() => { setMenu(false); onLegal('support'); }}>{t("サポート")}</button></>}</nav>}</div>
    <h1>{t("正しい姿勢を継続して")}<br />{t("ピンアナゴをゲットしよう！")}</h1><div className="work-hero-actions"><button className="work-button orange" onClick={onStart}><img src="/figma/home-play.svg" width="30" height="30" alt="" draggable={false} /><span>{t("作業スタート！")}</span></button><button className="work-button white" onClick={onPick}><img src="/figma/home-swap.svg" width="28" height="27.48" alt="" draggable={false} /><span>{t("ピンアナゴ変更")}</span></button></div><HomePet key={selected.id} id={selected.id} /></header>
    <section className="work-collection" aria-label={t("コレクション")}><div className="work-collection-heading"><h2>{t("コレクション")}<span><b>{collection.cards.length}</b> / 111</span></h2><CollectionSort value={order} onChange={setOrder} /></div>
      <div className="work-card-grid">{slots.map(({ index, id }) => <CharacterCard key={index} index={index} id={id && owned.has(id) ? id : undefined} onClick={id && owned.has(id) ? () => onCard(owned.get(id)!) : undefined} />)}</div>
    </section></main>;
}
function PickerPet({ id }: { id: string }) {
  useAppLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let inView = false;
    const update = () => setMoving(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  return <div ref={ref} className="work-picker-pet" data-moving={moving}>
    <div key={id} className="work-picker-pet-motion" data-character={id}><Portrait id={id} /></div>
  </div>;
}

export function CharacterPicker({ collection, onConfirm, onClose }: { collection: Collection; onConfirm: (id: string) => void; onClose: () => void }) {
  useAppLanguage();
  const owned = new Set(collection.cards.map(card => card.characterId));
  const choices = catalog.filter(item => owned.has(item.id));
  const [draft, setDraft] = useState(choices.find(item => item.id === collection.selectedId)?.id ?? choices[0]?.id ?? null);
  const selected = character(draft);
  return <main className="work-screen work-picker">
    <Brand />
    <button className="work-close screen-close" onClick={onClose} aria-label={t("変更をキャンセル")}><Icon name="close" /></button>
    <section className="work-picker-preview" aria-label={t("今日のピンアナゴ")}>
      <h1>{t("今日のピンアナゴ")}</h1>
      <PickerPet id={selected.id} />
      {draft && <CharacterSpeech id={selected.id} />}
    </section>
    <section className="work-picker-list" aria-label={t("ピンアナゴを選択")}>
      <div className="work-picker-grid" tabIndex={0} aria-label={t("獲得済みのピンアナゴ")}>
        {choices.map(item => <CharacterCard key={item.id} id={item.id} index={item.number - 1} selected={draft === item.id} onClick={() => setDraft(item.id)} />)}
        {!choices.length && <p className="work-picker-empty">{t("まだ仲間がいません")}<br />{t("姿勢チェックで、仲間を増やそう！")}</p>}
      </div>
      <footer><button className="work-button blue" disabled={!draft} onClick={() => draft && onConfirm(draft)}>{t("決定")}</button></footer>
    </section>
  </main>;
}
