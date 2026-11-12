const COOKIE_NAME = "piiin_developer_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

const textEncoder = new TextEncoder();

export function getDeveloperAuthConfig(env = process.env) {
  const username = env.PIIIN_DEV_USERNAME ?? "";
  const password = env.PIIIN_DEV_PASSWORD ?? "";
  const sessionSecret = env.PIIIN_DEV_SESSION_SECRET ?? "";

  if (!username || !password || sessionSecret.length < 32) {
    return null;
  }

  return { username, password, sessionSecret };
}

export async function credentialsMatch(config, username, password) {
  const [usernameMatches, passwordMatches] = await Promise.all([
    constantTimeTextEqual(config.username, username),
    constantTimeTextEqual(config.password, password),
  ]);

  return usernameMatches && passwordMatches;
}

export async function createDeveloperSessionCookie(request, sessionSecret) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = await createSignedSessionValue(expiresAt, sessionSecret);
  const secure = isHttpsRequest(request) ? "; Secure" : "";

  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function createExpiredDeveloperSessionCookie(request) {
  const secure = isHttpsRequest(request) ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export async function hasValidDeveloperSession(request, sessionSecret) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionValue = readCookie(cookieHeader, COOKIE_NAME);

  if (!sessionValue) {
    return false;
  }

  const separatorIndex = sessionValue.indexOf(".");
  if (separatorIndex <= 0) {
    return false;
  }

  const expiresAtText = sessionValue.slice(0, separatorIndex);
  const suppliedSignature = sessionValue.slice(separatorIndex + 1);
  const expiresAt = Number(expiresAtText);

  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() / 1000) {
    return false;
  }

  const expectedSignature = await sign(expiresAtText, sessionSecret);
  return constantTimeAsciiEqual(expectedSignature, suppliedSignature);
}

export function jsonResponse(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), { ...init, headers });
}

async function createSignedSessionValue(expiresAt, sessionSecret) {
  const expiresAtText = String(expiresAt);
  const signature = await sign(expiresAtText, sessionSecret);
  return `${expiresAtText}.${signature}`;
}

async function sign(value, sessionSecret) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)),
  );

  return bytesToBase64Url(signature);
}

async function constantTimeTextEqual(expected, supplied) {
  const [expectedDigest, suppliedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(expected)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(supplied)),
  ]);

  return constantTimeBytesEqual(
    new Uint8Array(expectedDigest),
    new Uint8Array(suppliedDigest),
  );
}

function constantTimeAsciiEqual(expected, supplied) {
  return constantTimeBytesEqual(
    textEncoder.encode(expected),
    textEncoder.encode(supplied),
  );
}

function constantTimeBytesEqual(expected, supplied) {
  const length = Math.max(expected.length, supplied.length);
  let difference = expected.length ^ supplied.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (expected[index] ?? 0) ^ (supplied[index] ?? 0);
  }

  return difference === 0;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function readCookie(cookieHeader, name) {
  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = part.trim().split("=");
    if (cookieName === name) {
      return valueParts.join("=");
    }
  }

  return null;
}

function isHttpsRequest(request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  return forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
}
