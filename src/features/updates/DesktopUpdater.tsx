import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'checking' | 'available' | 'current' | 'installing' | 'installed' | 'error';

export function DesktopUpdater({ canInstall }: { canInstall: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const candidate = useRef<Update | null>(null);
  const running = useRef(false);
  const [phase, setPhase] = useState<Phase>('checking');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  const checkUpdate = useCallback(async (manual: boolean) => {
    if (running.current) return;
    running.current = true;
    if (manual) setVisible(true);
    setPhase('checking');
    try {
      await candidate.current?.close();
      candidate.current = null;
      const update = await check({ timeout: 15000 });
      candidate.current = update;
      setVersion(update?.version ?? '');
      setPhase(update ? 'available' : 'current');
      if (update) setVisible(true);
    } catch {
      setPhase('error');
      // Offline startup stays quiet. A manual check always reports failure.
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isTauri() || !navigator.userAgent.includes('Mac')) return;
    const unlisten = listen('check-for-updates', () => void checkUpdate(true));
    const timer = window.setTimeout(() => void checkUpdate(false), 3000);
    return () => {
      window.clearTimeout(timer);
      void unlisten.then((dispose) => dispose());
    };
  }, [checkUpdate]);

  // A background update must never interrupt registration or measurement.
  useEffect(() => {
    const element = dialog.current;
    if (visible && canInstall) element?.showModal();
    else element?.close();
  }, [visible, canInstall]);

  const install = async () => {
    if (!canInstall || running.current || !candidate.current) return;
    running.current = true;
    setPhase('installing');
    setProgress(null);
    let received = 0;
    let total = 0;
    try {
      await candidate.current.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          received += event.data.chunkLength;
          if (total > 0) setProgress(Math.min(100, Math.round(received / total * 100)));
        }
      });
      setPhase('installed');
      await relaunch();
    } catch {
      // Keep installed distinct: retrying a restart must not reinstall the app.
      setPhase((current) => current === 'installed' ? 'installed' : 'error');
    } finally {
      running.current = false;
    }
  };

  return (
    <dialog ref={dialog} className="desktop-update-dialog" aria-labelledby="update-heading"
      onCancel={(event) => {
        if (phase === 'installing') event.preventDefault();
        else setVisible(false);
      }}>
      <h2 id="update-heading">PiiiN アップデート</h2>
      <p role="status" aria-live="polite">
        {phase === 'checking' && 'アップデートを確認しています…'}
        {phase === 'available' && `バージョン ${version} を利用できます。更新後にアプリを再起動します。`}
        {phase === 'current' && '最新バージョンを使用しています。'}
        {phase === 'installing' && '更新をインストールしています。アプリを終了しないでください。'}
        {phase === 'installed' && '更新が完了しました。アプリを再起動してください。'}
        {phase === 'error' && '更新を完了できませんでした。通信環境を確認して、もう一度お試しください。'}
      </p>
      {phase === 'installing' && <progress aria-label="ダウンロード" max={100} value={progress ?? undefined} />}
      <div className="desktop-update-actions">
        {phase !== 'installing' && <button onClick={() => setVisible(false)}>{phase === 'available' ? 'あとで' : '閉じる'}</button>}
        {phase === 'available' && <button className="primary" onClick={() => void install()}>更新して再起動</button>}
        {phase === 'installed' && <button className="primary" onClick={() => void relaunch().catch(() => {})}>再起動</button>}
        {phase === 'error' && <button className="primary" onClick={() => void checkUpdate(true)}>再確認</button>}
      </div>
    </dialog>
  );
}
