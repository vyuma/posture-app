/** ブラウザで PC ペアリングサーバーへ接続するモード用のクエリを解析する */

export type RemotePairingConfig = {
  host: string;
  port: number;
  token: string;
};

/**
 * 例: ?remotePair=1&host=192.168.1.2&port=54321&token=abc
 * 同一 Wi‑Fi 上のスマホから Vite 配信 URL を開く想定。
 */
export function parseRemotePairingSearch(search: string): RemotePairingConfig | null {
  const normalized = search.startsWith("?") ? search : `?${search}`;
  const params = new URLSearchParams(normalized);
  if (params.get("remotePair") !== "1") {
    return null;
  }
  const host = params.get("host")?.trim();
  const portRaw = params.get("port")?.trim();
  const token = params.get("token")?.trim();
  if (!host || !portRaw || !token) {
    return null;
  }
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return null;
  }
  return { host, port, token };
}
