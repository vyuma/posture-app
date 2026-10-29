import type { CSSProperties } from 'react';
import { character, characterSpeech } from './CharacterCard';
import './character-speech.css';

export function CharacterSpeech({ id }: { id: string }) {
  const message = characterSpeech(id);
  let delay = 100;
  const lines = message.split('\n').map(line => Array.from(line).map(letter => {
    const glyph = { letter, delay };
    delay += /[、。！…]/u.test(letter) ? 100 : 38;
    return glyph;
  }));
  const duration = Math.max(1000, delay + 150) * (id === 'oto-anago' ? 1.5 : 1);
  return <>
    {/* Announce the complete line once, never each animated letter. */}
    <p className="work-speech-announcement" role="status" aria-live="polite" aria-atomic="true">
      {character(id).name}：{message.replace(/\n/g, ' ')}
    </p>
    <p key={id} className="work-bubble work-bubble-speaking" data-multiline={lines.length > 1}
      style={{ '--speech-duration': `${duration}ms` } as CSSProperties} aria-hidden="true">
      {lines.map((line, lineIndex) => <span className="work-speech-line" key={lineIndex}>
        {line.map(({ letter, delay: letterDelay }, index) => <span className="work-speech-letter" key={index}
          style={{ '--speech-delay': `${letterDelay}ms` } as CSSProperties}>{letter}</span>)}
      </span>)}
    </p>
  </>;
}
