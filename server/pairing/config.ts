import { PairingError } from "./room";
import { RedisRoomStore } from "./redis-store";

export type PairingConfig = { postureOrigin: string; vibeOrigin: string };

function publicOrigin(value: string | undefined) {
  if (!value) throw new Error("Missing public URL");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:"))
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Invalid public URL");
  }
  return url.origin;
}

export function cloudPairingEnvironment() {
  try {
    const config = {
      postureOrigin: publicOrigin(process.env.POSTURE_PUBLIC_URL),
      vibeOrigin: publicOrigin(process.env.VIBE_PUBLIC_URL),
    };
    const redis = new URL(process.env.REDIS_URL ?? "");
    if (!["redis:", "rediss:"].includes(redis.protocol)) throw new Error("Invalid Redis URL");
    return { config, store: new RedisRoomStore(redis.toString()) };
  } catch {
    throw new PairingError(503, "NOT_CONFIGURED", "公開環境のスマートフォン連携がまだ設定されていません。");
  }
}
