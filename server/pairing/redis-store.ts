import { Redis } from "ioredis";
import { PairingError, requireRoom, ROOM_TTL_SECONDS, type Room, type RoomStore } from "./room";

// Compare and publish atomically: concurrent PC updates and phone heartbeats cannot overwrite each other.
export const UPDATE_ROOM_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
redis.call('PUBLISH', KEYS[2], ARGV[2])
return 1
`;
const LIMIT_CREATION_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 600) end
return count
`;

export class RedisRoomStore implements RoomStore {
  private readonly redis: Redis;
  constructor(url: string, private readonly prefix = "posture:pairing:v1:") {
    this.redis = new Redis(url, {
      lazyConnect: true, connectTimeout: 4000, commandTimeout: 4000,
      maxRetriesPerRequest: 1, retryStrategy: (attempt) => Math.min(250 * attempt, 2000),
    });
    // Request handlers report a safe error without leaking a Redis URL or its password.
    this.redis.on("error", () => {});
  }
  private key(id: string) { return `${this.prefix}room:{${id}}`; }
  private channel(id: string) { return `${this.prefix}events:{${id}}`; }

  async create(room: Room) {
    const result = await this.redis.set(this.key(room.id), JSON.stringify(room), "EX", ROOM_TTL_SECONDS, "NX");
    if (!result) throw new Error("Room ID collision");
  }
  async get(id: string) {
    const raw = await this.redis.get(this.key(id));
    return raw ? JSON.parse(raw) as Room : null;
  }
  async update(id: string, change: (room: Room) => Room) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const raw = await this.redis.get(this.key(id));
      const previous = requireRoom(raw ? JSON.parse(raw) as Room : null);
      const next = change({ ...previous });
      next.revision = previous.revision + 1;
      const applied = await this.redis.eval(UPDATE_ROOM_SCRIPT, 2, this.key(id), this.channel(id), raw!, JSON.stringify(next));
      if (applied === 1) return next;
    }
    throw new PairingError(503, "RETRY", "接続状態を更新できませんでした。もう一度お試しください。");
  }
  async subscribe(id: string, changed: (room: Room) => void, failed: () => void) {
    const subscriber = this.redis.duplicate({ lazyConnect: true });
    subscriber.on("error", failed);
    subscriber.on("message", (_channel, raw) => {
      try { changed(JSON.parse(raw) as Room); } catch { failed(); }
    });
    try {
      await subscriber.subscribe(this.channel(id));
    } catch (error) {
      subscriber.disconnect();
      throw error;
    }
    return () => { subscriber.disconnect(); };
  }
  async allowCreation(client: string) {
    return Number(await this.redis.eval(LIMIT_CREATION_SCRIPT, 1, `${this.prefix}limit:${client}`)) <= 30;
  }
  close() { this.redis.disconnect(); }
}
