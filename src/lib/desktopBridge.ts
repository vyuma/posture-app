import { invoke } from "@tauri-apps/api/core";

export const PAIRING_PORT = 47831;

export const buildPairingUrl = (deviceIp: string, token?: string) =>
  `vibeapp://pair?host=${deviceIp}&port=${PAIRING_PORT}&token=${token ?? "pending"}&httpProtocol=http&wsProtocol=ws`;

type PairingStatus = {
  running: boolean;
  port: number;
  paired: boolean;
  pairedPhoneIp: string | null;
  pairingToken: string;
};

export async function getPrimaryIpv4() {
  try {
    return await invoke<string | null>("get_primary_ipv4");
  } catch {
    return null;
  }
}

export async function getSavedPhoneIp() {
  try {
    return await invoke<string | null>("get_saved_phone_ip");
  } catch {
    return null;
  }
}

export async function savePhoneIp(phoneIp: string) {
  try {
    await invoke("save_phone_ip", { phoneIp });
  } catch {
    // Tauri以外では何もしない。将来のバック実装に差し替える前提。
  }
}

export async function setBlackoutWindow(active: boolean) {
  try {
    await invoke("set_blackout_window", { active });
  } catch {
    // Tauri以外では何もしない。将来のバック実装に差し替える前提。
  }
}

export async function getPairingStatus(): Promise<PairingStatus> {
  try {
    return await invoke<PairingStatus>("get_pairing_status");
  } catch {
    return {
      running: false,
      port: PAIRING_PORT,
      paired: false,
      pairedPhoneIp: null,
      pairingToken: "",
    };
  }
}

export async function startPairingServer() {
  try {
    return await invoke<string>("start_pairing_server");
  } catch {
    return null;
  }
}

export async function stopPairingServer() {
  try {
    await invoke("stop_pairing_server");
  } catch {
    // Tauri以外では何もしない。将来のバック実装に差し替える前提。
  }
}

export async function sendVibrationSignal(targetIp?: string) {
  try {
    await invoke("send_vibration_signal", {
      targetIp: targetIp ?? null,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendPostureSignal(isBad: boolean) {
  try {
    await invoke("emit_posture_signal", {
      isBad,
    });
    return true;
  } catch {
    return false;
  }
}