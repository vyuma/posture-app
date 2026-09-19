import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ROOM_TTL_SECONDS = 6 * 60 * 60;
export const HOST_LEASE_MS = 20_000;
export const PHONE_LEASE_MS = 60_000;
export const OWNER_COOKIE = "posture_pairing_owner";

export class PairingError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type Room = {
  id: string;
  ownerHash: string;
  phoneToken: string;
  expiresAt: number;
  revision: number;
  paired: boolean;
  deviceName: string | null;
  phoneSeenAt: number;
  hostSeenAt: number;
  measuring: boolean;
  registering: boolean;
  isBad: boolean;
};

export type RoomStore = {
  create(room: Room): Promise<void>;
  get(id: string): Promise<Room | null>;
  update(id: string, change: (room: Room) => Room): Promise<Room>;
  subscribe(id: string, changed: (room: Room) => void, failed: () => void): Promise<() => void>;
  allowCreation(client: string): Promise<boolean>;
};

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function sameSecret(a: string, b: string) {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}

export function newRoom(now = Date.now()) {
  const owner = randomBytes(32).toString("hex");
  const room: Room = {
    id: randomBytes(16).toString("hex"), ownerHash: hash(owner),
    phoneToken: randomBytes(32).toString("hex"), expiresAt: now + ROOM_TTL_SECONDS * 1000,
    revision: 0, paired: false, deviceName: null, phoneSeenAt: 0, hostSeenAt: now,
    measuring: false, registering: false, isBad: false,
  };
  return { room, owner };
}

export function requireRoom(room: Room | null, now = Date.now()): Room {
  if (!room || room.expiresAt <= now) {
    throw new PairingError(401, "SESSION_EXPIRED", "接続の有効期限が切れました。PCのQRを読み直してください。");
  }
  return room;
}

export function requireOwner(room: Room | null, secret: string, now = Date.now()) {
  const active = requireRoom(room, now);
  if (!sameSecret(active.ownerHash, hash(secret))) {
    throw new PairingError(401, "INVALID_TOKEN", "PCの接続情報を取得し直してください。");
  }
  return active;
}

export function requirePhone(room: Room | null, token: string, now = Date.now()) {
  const active = requireRoom(room, now);
  if (!sameSecret(active.phoneToken, token)) {
    throw new PairingError(401, "INVALID_TOKEN", "接続リンクが無効です。PCのQRを読み直してください。");
  }
  return active;
}

export function roomId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{32}$/.test(value)) {
    throw new PairingError(400, "INVALID_ROOM", "接続リンクが無効です。PCのQRを読み直してください。");
  }
  return value;
}

export function ownerCredentials(cookie = "") {
  const value = cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${OWNER_COOKIE}=`))?.slice(OWNER_COOKIE.length + 1);
  const match = value?.match(/^([a-f0-9]{32})\.([a-f0-9]{64})$/);
  return match ? { id: match[1], secret: match[2] } : null;
}

/** A complete snapshot makes reconnects and missed pub/sub events recoverable. Never expose owner credentials. */
export function snapshot(room: Room, now = Date.now()) {
  const hostAlive = now - room.hostSeenAt < HOST_LEASE_MS;
  const paired = room.paired && now - room.phoneSeenAt < PHONE_LEASE_MS;
  const measuring = hostAlive && room.measuring;
  return {
    type: room.paired ? "snapshot" : "disconnected",
    sequence: room.revision, paired,
    deviceName: paired ? room.deviceName : null,
    lastSeenAt: room.phoneSeenAt ? new Date(room.phoneSeenAt).toISOString() : null,
    createdAt: new Date(now).toISOString(),
    measuringSessionActive: measuring,
    goodPostureRegistrationActive: hostAlive && room.registering && !measuring,
    isBad: paired && measuring && room.isBad,
  };
}
