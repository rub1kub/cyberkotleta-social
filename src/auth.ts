import type { UserProfile } from "./types";

const oauthStateKey = "kotleta.discord.oauth.state.v1";
const discordSessionKey = "kotleta.discord.session.v1";

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type DiscordSession = {
  user: DiscordUser;
  expiresAt: number;
};

type AuthUrlResult =
  | {
      ok: true;
      url: string;
    }
  | {
      ok: false;
      message: string;
    };

export function buildDiscordAuthUrl(): AuthUrlResult {
  if (import.meta.env.PROD) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return {
      ok: true,
      url: `/api/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}`,
    };
  }

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) {
    return {
      ok: false,
      message: "Нужен VITE_DISCORD_CLIENT_ID",
    };
  }

  const state = crypto.randomUUID();
  sessionStorage.setItem(oauthStateKey, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "token",
    scope: "identify",
    state,
    prompt: "consent",
  });

  return {
    ok: true,
    url: `https://discord.com/oauth2/authorize?${params.toString()}`,
  };
}

export async function consumeDiscordRedirect(): Promise<DiscordSession | null> {
  if (!window.location.hash.includes("access_token")) return null;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("access_token");
  const tokenType = params.get("token_type") ?? "Bearer";
  const returnedState = params.get("state");
  const expectedState = sessionStorage.getItem(oauthStateKey);

  window.history.replaceState(null, document.title, getRedirectUri());
  sessionStorage.removeItem(oauthStateKey);

  if (!token || !expectedState || returnedState !== expectedState) {
    throw new Error("Invalid Discord OAuth state");
  }

  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `${tokenType} ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Discord profile request failed");
  }

  const user = (await response.json()) as DiscordUser;
  const expiresIn = Number(params.get("expires_in") ?? 0);
  const session: DiscordSession = {
    user,
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : Date.now() + 60 * 60 * 1000,
  };

  writeStoredDiscordSession(session);
  return session;
}

export async function readServerDiscordSession(): Promise<DiscordSession | null> {
  try {
    const response = await fetch("/api/auth/session", {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;

    const session = (await response.json()) as DiscordSession | null;
    if (!session?.user?.id || !session.user.username || session.expiresAt <= Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function readStoredDiscordSession(): DiscordSession | null {
  const raw = localStorage.getItem(discordSessionKey);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as DiscordSession;
    if (!session.user?.id || !session.user?.username || session.expiresAt <= Date.now()) {
      clearStoredDiscordSession();
      return null;
    }
    return session;
  } catch {
    clearStoredDiscordSession();
    return null;
  }
}

export function writeStoredDiscordSession(session: DiscordSession): void {
  localStorage.setItem(discordSessionKey, JSON.stringify(session));
}

export function clearStoredDiscordSession(): void {
  localStorage.removeItem(discordSessionKey);
}

export async function clearServerDiscordSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
  } catch {
    // Local UI logout should still work if the server session endpoint is unavailable.
  }
}

export function discordSessionToProfile(
  session: DiscordSession,
  existing?: UserProfile,
): UserProfile {
  const displayName = session.user.global_name || session.user.username;
  return {
    id: `discord:${session.user.id}`,
    name: displayName,
    handle: `@${session.user.username}`,
    bio: existing?.bio ?? "",
    status: existing?.status ?? "Онлайн",
    joinedAt: existing?.joinedAt ?? Date.now(),
    timeOnSiteMinutes: existing?.timeOnSiteMinutes ?? 0,
    avatarUrl: getDiscordAvatarUrl(session.user),
    provider: "discord",
    discordId: session.user.id,
  };
}

function getRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function getDiscordAvatarUrl(user: DiscordUser): string | undefined {
  if (!user.avatar) return undefined;
  const extension = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
}
