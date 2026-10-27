import { OptionMenu } from './OptionMenu';
import { BUILTIN_SOUND_OPTIONS, type SoundSettings } from '../sound/types/soundSettings';
import './sound-select.css';
export function SoundSelect({ settings, onChange }: { settings: SoundSettings; onChange?: (value: SoundSettings) => void }) {
  const options = [...new Set([...BUILTIN_SOUND_OPTIONS, ...settings.customSounds])].map((path, index) => ({
    value: path, label: path.startsWith('data:') ? `カスタム ${index + 1}` : path.split('/').pop()?.replace(/\.(mp3|wav)$/i, '') || path,
  }));
  return <div className="work-sound-row"><span>効果音</span><OptionMenu value={settings.selectedSound}
    onChange={selectedSound => onChange?.({ ...settings, selectedSound })} options={options} label="効果音" className="work-sound-select"
    arrow={<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>} /></div>;
}
