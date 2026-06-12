import { sanitizeSocialState } from "./storage";
import type {
  MediaAttachment,
  PixelCell,
  Post,
  PostAppearance,
  PostInteractionSettings,
  PostKind,
  PostPoll,
  PostPosition,
  SketchStroke,
  SocialState,
  UserProfile,
} from "./types";

const sharedStatePath = "/api/social-state";
const sharedStateEventsPath = "/api/social-state/events";
const sharedStateActionsPath = "/api/social-state/actions";

export type SharedStateSnapshot = {
  conflict?: boolean;
  state: SocialState;
  version: number;
};

export type SharedStateAction =
  | {
      type: "post.create";
      actorId: string;
      actor?: UserProfile;
      post: {
        id: string;
        wallId: string;
        kind?: PostKind;
        text: string;
        attachments: MediaAttachment[];
        position?: PostPosition;
        appearance?: PostAppearance;
        settings?: PostInteractionSettings;
        sketch?: SketchStroke[];
        checklist?: Post["checklist"];
        poll?: PostPoll;
        repostOfId?: string;
        createdAt?: number;
      };
    }
  | {
      type: "post.move";
      actorId: string;
      actor?: UserProfile;
      postId: string;
      x: number;
      y: number;
    }
  | {
      type: "post.react";
      actorId: string;
      actor?: UserProfile;
      postId: string;
      amount: number;
    }
  | {
      type: "post.view";
      actorId: string;
      actor?: UserProfile;
      postId: string;
    }
  | {
      type: "pixel.paint";
      actorId: string;
      actor?: UserProfile;
      x: PixelCell["x"];
      y: PixelCell["y"];
      color: PixelCell["color"];
    };

export async function readSharedSocialState(): Promise<SharedStateSnapshot | null> {
  try {
    const response = await fetch(sharedStatePath, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as SharedStateSnapshot;
    if (!payload.state || !Number.isFinite(payload.version)) return null;

    return {
      state: sanitizeSocialState(payload.state),
      version: payload.version,
    };
  } catch {
    return null;
  }
}

export async function writeSharedSocialState(
  state: SocialState,
  expectedVersion: number | null,
): Promise<SharedStateSnapshot | null> {
  try {
    const response = await fetch(sharedStatePath, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state, version: expectedVersion }),
    });
    if (!response.ok && response.status !== 409) return null;

    const payload = (await response.json()) as SharedStateSnapshot;
    if (!payload.state || !Number.isFinite(payload.version)) return null;

    return {
      conflict: response.status === 409 || payload.conflict === true,
      state: sanitizeSocialState(payload.state),
      version: payload.version,
    };
  } catch {
    return null;
  }
}

export async function dispatchSharedSocialAction(
  action: SharedStateAction,
): Promise<SharedStateSnapshot | null> {
  try {
    const response = await fetch(sharedStateActionsPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(action),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as SharedStateSnapshot;
    if (!payload.state || !Number.isFinite(payload.version)) return null;

    return {
      state: sanitizeSocialState(payload.state),
      version: payload.version,
    };
  } catch {
    return null;
  }
}

export function subscribeSharedSocialState(
  onSnapshot: (snapshot: SharedStateSnapshot) => void,
): () => void {
  if (typeof EventSource === "undefined") return () => undefined;

  const source = new EventSource(sharedStateEventsPath);
  source.addEventListener("social-state", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent<string>).data) as SharedStateSnapshot;
      if (!payload.state || !Number.isFinite(payload.version)) return;

      onSnapshot({
        state: sanitizeSocialState(payload.state),
        version: payload.version,
      });
    } catch {
      // Broken SSE payload should not break the app.
    }
  });

  return () => source.close();
}
