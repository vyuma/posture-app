import { t, useAppLanguage } from "../i18n";
import { Dialog } from './Dialog';
import './finish-dialog.css';

export function FinishDialog({ busy = false, onContinue, onFinish }: { busy?: boolean; onContinue: () => void; onFinish: () => void }) {
  useAppLanguage();
  return <Dialog title={t("本当に終了しますか？")} className="work-finish-dialog" onClose={() => !busy && onContinue()}>
    <h2>{t("本当に終了しますか？")}</h2>
    <p>{t("ここまでの集中時間と姿勢を記録します。")}</p>
    <div className="work-dialog-actions">
      <button className="work-button white" disabled={busy} onClick={onContinue}>{t("続ける")}</button>
      <button className="work-button orange" disabled={busy} onClick={onFinish}>{t("終了する")}</button>
    </div>
  </Dialog>;
}
