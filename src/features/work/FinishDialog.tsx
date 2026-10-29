import { Dialog } from './Dialog';
import './finish-dialog.css';

export function FinishDialog({ busy = false, onContinue, onFinish }: { busy?: boolean; onContinue: () => void; onFinish: () => void }) {
  return <Dialog title="本当に終了しますか？" className="work-finish-dialog" onClose={() => !busy && onContinue()}>
    <h2>本当に終了しますか？</h2>
    <p>ここまでの集中時間と姿勢を記録します。</p>
    <div className="work-dialog-actions">
      <button className="work-button white" disabled={busy} onClick={onContinue}>続ける</button>
      <button className="work-button orange" disabled={busy} onClick={onFinish}>終了する</button>
    </div>
  </Dialog>;
}
