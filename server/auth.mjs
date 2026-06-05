import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sendJson, sendText } from "./shared-state-store.mjs";

const discordApiOrigin = "https://discord.com/api";
const oauthStateCookie = "kotleta_oauth_state";
const sessionCookie = "kotleta_session";
const sessionTtlSeconds = 60 * 60 * 24 * 7;

export function createAuthHandler() {
  return async function handleAuth(request, response, pathname) {
    try {
      if (pathname === "/api/auth/session" && request.method === "GET") {
        sendJson(response, readSessionFromRequest(request));
        return true;
      }

      if (pathname === "/api/auth/logout" && request.method === "POST") {
        clearCookie(response, sessionCookie);
        sendJson(response, { ok: true });
        return true;
      }

      if (pathname === "/api/auth/discord/start" && request.method === "GET") {
        const config = getDiscordConfig(request);
        if (!config.ok) {
          sendText(response, 503, config.message);
          return true;
        }

        const requestUrl = new URL(request.url ?? "/", config.origin);
        const state = randomUUID();
        const returnTo = normalizeReturnTo(requestUrl.searchParams.get("returnTo"));
        setSignedCookie(response, oauthStateCookie, JSON.stringify({ returnTo, state }), {
          maxAge: 10 * 60,
          secure: config.secureCookies,
        });

        const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
        authorizeUrl.searchParams.set("client_id", config.clientId);
        authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("scope", "identify");
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("prompt", "consent");

        response.statusCode = 302;
        response.setHeader("Location", authorizeUrl.toString());
        response.end();
        return true;
      }

      if (pathname === "/api/auth/discord/callback" && request.method === "GET") {
        const config = getDiscordConfig(request);
        if (!config.ok) {
          sendText(response, 503, config.message);
          return true;
        }

        const requestUrl = new URL(request.url ?? "/", config.origin);
        const code = requestUrl.searchParams.get("code");
        const returnedState = requestUrl.searchParams.get("state");
        const storedState = readSignedCookie(request, oauthStateCookie);
        clearCookie(response, oauthStateCookie);

        if (!code || !returnedState || !storedState || storedState.state !== returnedState) {
          sendText(response, 400, "Invalid Discord OAuth state");
          return true;
        }

        const session = await exchangeDiscordCode(code, config);
        setSignedCookie(response, sessionCookie, JSON.stringify(session), {
          maxAge: sessionTtlSeconds,
          secure: config.secureCookies,
        });

        response.statusCode = 302;
        response.setHeader("Location", storedState.returnTo);
        response.end();
        return true;
      }

      return false;
    } catch (error) {
      console.error(error);
      sendText(response, 500, "Auth error");
      return true;
    }
  };
}

function getDiscordConfig(request) {
  const clientId = process.env.DISCORD_CLIENT_ID ?? process.env.VITE_DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const authSecret = process.env.KOTLETA_AUTH_SECRET;
  const origin = process.env.PUBLIC_ORIGIN ?? getRequestOrigin(request);
  const secureCookies = origin.startsWith("https://");

  if (!clientId || !clientSecret || !authSecret) {
    return {
      ok: false,
      message: "Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and KOTLETA_AUTH_SECRET",
    };
  }

  return {
    ok: true,
    authSecret,
    clientId,
    clientSecret,
    origin,
    redirectUri: `${origin}/api/auth/discord/callback`,
    secureCookies,
  };
}

async function exchangeDiscordCode(code, config) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const tokenResponse = await fetch(`${discordApiOrigin}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!tokenResponse.ok) {
    throw new Error(`Discord token exchange failed: ${tokenResponse.status}`);
  }

  const token = await tokenResponse.json();
  const profileResponse = await fetch(`${discordApiOrigin}/users/@me`, {
    headers: {
      Authorization: `${token.token_type ?? "Bearer"} ${token.access_token}`,
    },
  });
  if (!profileResponse.ok) {
    throw new Error(`Discord profile request failed: ${profileResponse.status}`);
  }

  const user = await profileResponse.json();
  const expiresIn = Number(token.expires_in) || sessionTtlSeconds;

  return {
    user: {
      id: user.id,
      username: user.username,
      global_name: user.global_name ?? null,
      avatar: user.avatar ?? null,
    },
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function readSessionFromRequest(request) {
  const session = readSignedCookie(request, sessionCookie);
  if (!session || !session.user?.id || !session.user?.username || session.expiresAt <= Date.now()) {
    return null;
  }

  return session;
}

function setSignedCookie(response, name, value, { maxAge, secure }) {
  const encoded = Buffer.from(value, "utf8").toString("base64url");
  const signed = `${encoded}.${sign(encoded)}`;
  const parts = [
    `${name}=${signed}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  appendSetCookie(response, parts.join("; "));
}

function clearCookie(response, name) {
  appendSetCookie(response, `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function appendSetCookie(response, value) {
  const current = response.getHeader("Set-Cookie");
  if (!current) {
    response.setHeader("Set-Cookie", value);
    return;
  }

  response.setHeader("Set-Cookie", Array.isArray(current) ? [...current, value] : [current, value]);
}

function readSignedCookie(request, name) {
  const raw = parseCookies(request.headers.cookie ?? "")[name];
  if (!raw) return null;

  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature || !isValidSignature(encoded, signature)) return null;

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function sign(value) {
  const secret = process.env.KOTLETA_AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function isValidSignature(value, signature) {
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);
  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
}

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    cookies[key] = value;
  }
  return cookies;
}

function getRequestOrigin(request) {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "127.0.0.1";
  const proto = request.headers["x-forwarded-proto"] ?? "http";
  return `${proto}://${host}`;
}

function normalizeReturnTo(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
