import { useCallback, useEffect, useRef, useState } from 'react';
import { t, useAppLanguage } from '../i18n';
import { CAMERA_DEVICE_KEY, loadCameraDeviceId, saveCameraDeviceId } from './camera';
import './camera-settings.css';

export function CameraSettings() {
  useAppLanguage();
  const [selected, setSelected] = useState(loadCameraDeviceId);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(false), revision = useRef(0);
  const probe = useRef<MediaStream | null>(null);
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  const supported = !!media?.enumerateDevices && !!media?.getUserMedia;
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const list = await media?.enumerateDevices();
      if (mounted.current && current === revision.current) {
        setDevices((list ?? []).filter(device => device.kind === 'videoinput' && device.deviceId));
      }
    } catch {
      if (mounted.current && current === revision.current) setMessage('カメラ一覧を取得できません。もう一度お試しください。');
    }
  }, [media]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const changed = () => { void refresh(); };
    const stored = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      if (event.key === CAMERA_DEVICE_KEY || event.key === null) setSelected(loadCameraDeviceId());
    };
    media?.addEventListener?.('devicechange', changed);
    window.addEventListener('storage', stored);
    return () => {
      mounted.current = false; revision.current++;
      probe.current?.getTracks().forEach(track => track.stop()); probe.current = null;
      media?.removeEventListener?.('devicechange', changed);
      window.removeEventListener('storage', stored);
    };
  }, [media, refresh]);

  async function checkCameras() {
    setBusy(true); setMessage('');
    try {
      if (!devices.some(device => device.label)) {
        const stream = await media!.getUserMedia({ video: true, audio: false });
        // Enumeration needs permission on some browsers; this stream is never recorded.
        if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
        probe.current = stream;
      }
      if (mounted.current) await refresh();
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error && error.name === 'NotAllowedError'
        ? 'OS・ブラウザーの設定でカメラを許可して、もう一度お試しください。'
        : 'カメラを確認できません。接続や他のアプリでの使用を確認してください。');
    } finally {
      probe.current?.getTracks().forEach(track => track.stop()); probe.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  return <section className="camera-settings" aria-labelledby="camera-heading" aria-busy={busy}>
    <h2 id="camera-heading"><label htmlFor="measurement-camera">{t('測定に使うカメラ')}</label></h2>
    <div className="camera-settings-controls">
      <select id="measurement-camera" value={selected} disabled={!supported || busy} aria-describedby="camera-setting-hint" onChange={event => {
        try { saveCameraDeviceId(event.target.value); setSelected(event.target.value); setMessage(''); }
        catch { setMessage('カメラ設定を保存できません。保存を許可して、もう一度お試しください。'); }
      }}>
        <option value="">{t('自動（標準カメラ）')}</option>
        {selected && !devices.some(device => device.deviceId === selected) && <option value={selected} disabled>{t('選択したカメラ（未接続・未確認）')}</option>}
        {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || t('カメラ {number}', { number: index + 1 })}</option>)}
      </select>
      <button type="button" disabled={!supported || busy} onClick={() => void checkCameras()}>{busy ? t('確認中…') : t('カメラ一覧を更新')}</button>
    </div>
    <p id="camera-setting-hint">{t('次にカメラを開くときに反映します。')}</p>
    {!supported ? <p role="status">{t('この環境ではカメラを利用できません。')}</p>
      : message ? <p role="status">{t(message)}</p>
      : !devices.length && <p role="status">{t('カメラが表示されない場合は、一覧を更新してください。')}</p>}
  </section>;
}
