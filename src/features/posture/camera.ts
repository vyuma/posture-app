import { t } from '../i18n';

// Hardware preference belongs to this browser/app, not to an analysis account.
export const CAMERA_DEVICE_KEY = 'piiin.camera.device.v1';

export function loadCameraDeviceId(): string {
  try { return localStorage.getItem(CAMERA_DEVICE_KEY) ?? ''; }
  catch { return ''; }
}

export function saveCameraDeviceId(deviceId: string) {
  if (deviceId) localStorage.setItem(CAMERA_DEVICE_KEY, deviceId);
  else localStorage.removeItem(CAMERA_DEVICE_KEY);
}

export async function openMeasurementCamera(height = 720): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(t('この環境ではカメラを利用できません。'));
  }
  const deviceId = loadCameraDeviceId();
  const camera: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' };
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { ...camera, width: { ideal: Math.round(height * 16 / 9) }, height: { ideal: height } }, audio: false,
    });
  } catch (error) {
    // Relax resolution only; never fall back to a different selected camera.
    if (error instanceof Error && error.name === 'OverconstrainedError' && ['width', 'height'].includes((error as OverconstrainedError).constraint)) {
      return navigator.mediaDevices.getUserMedia({ video: camera, audio: false });
    }
    if (deviceId && error instanceof Error && (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')) {
      throw new Error(t('選択したカメラが見つかりません。設定でカメラを選び直してください。'));
    }
    throw error;
  }
}
