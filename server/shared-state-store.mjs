import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createDefaultState } from "./default-state.mjs";

const maxRequestBodyBytes = 6 * 1024 * 1024;
const defaultDataDir = ".data";
const pixelColumns = 300;
const pixelRows = 190;
const maxPixelCells = pixelColumns * pixelRows;
const pixelPalette = new Set(["#111318", "#f6f8f7", "#21e69a", "#0f9f68", "#6c7685", "#5c6cff", "#d93862"]);
const minecraftWallId = "space:minecraft";
const minecraftDownloadPostId = "minecraft-download-post";
const minecraftDownloadObjectId = "minecraft:download-card";

export function createSharedStateStore({ dataDir = process.env.KOTLETA_DATA_DIR ?? defaultDataDir } = {}) {
  const stateFile = resolve(dataDir, "social-state.json");

  async function read() {
    try {
      const raw = await readFile(stateFile, "utf8");
      const payload = JSON.parse(raw);
      if (!payload?.state || !Number.isFinite(payload.version)) {
        throw new Error("Invalid shared state payload");
      }

      return {
        state: sanitizeSocialState(payload.state),
        version: payload.version,
      };
    } catch {
      const payload = {
        state: createDefaultState(),
        version: Date.now(),
      };
      await write(payload.state, payload.version);
      return payload;
    }
  }

  async function write(state, version = Date.now()) {
    const payload = {
      state: sanitizeSocialState(state),
      version,
    };
    const tempFile = `${stateFile}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(dirname(stateFile), { recursive: true });
    await writeFile(tempFile, JSON.stringify(payload, null, 2), "utf8");
    await rename(tempFile, stateFile);
    return payload;
  }

  return {
    read,
    stateFile,
    write,
  };
}

export function createSocialStateHandler(store = createSharedStateStore()) {
  return async function handleSocialState(request, response) {
    try {
      if (request.method === "GET") {
        sendJson(response, await store.read());
        return;
      }

      if (request.method === "PUT") {
        const body = await readRequestBody(request, maxRequestBodyBytes);
        const payload = JSON.parse(body || "{}");
        if (!payload.state) {
          sendText(response, 400, "Missing state");
          return;
        }

        const current = await store.read();
        if (Number.isFinite(payload.version) && payload.version !== current.version) {
          sendJson(response, { ...current, conflict: true }, 409);
          return;
        }

        sendJson(response, await store.write(payload.state));
        return;
      }

      response.setHeader("Allow", "GET, PUT");
      sendText(response, 405, "Method not allowed");
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        sendText(response, 413, "State payload is too large");
        return;
      }

      console.error(error);
      sendText(response, 500, "Shared state error");
    }
  };
}

export function sendJson(response, payload, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

export function sendText(response, statusCode, text) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(text);
}

async function readRequestBody(request, maxBytes) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let bytes = 0;

    request.on("data", (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        reject(new RequestBodyTooLargeError());
        request.destroy();
        return;
      }

      body += chunk.toString("utf8");
    });
    request.on("end", () => resolveBody(body));
    request.on("error", reject);
  });
}

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
  }
}

function sanitizeSocialState(state) {
  const fallback = createDefaultState();
  const users = ensureGuestUser(normalizeUsers(state?.users, fallback.users));
  const userIds = new Set(users.map((user) => user.id));
  const walls = ensureRequiredWalls(normalizeWalls(state?.walls, fallback.walls, userIds), fallback.walls);
  const wallIds = new Set(walls.map((wall) => wall.id));
  const posts = ensureMinecraftDownloadPost(
    normalizePosts(state?.posts, fallback.posts, wallIds, userIds),
    state?.utilityPositions,
    userIds,
  );
  const postIds = new Set(posts.map((post) => post.id));
  const comments = normalizeComments(state?.comments, fallback.comments, postIds, userIds);
  const pixelCells = normalizePixelCells(state?.pixelCells, userIds);

  return {
    siteSections: fallback.siteSections,
    users,
    activeUserId: userIds.has(state?.activeUserId) ? state.activeUserId : "guest",
    walls,
    posts,
    comments,
    utilityPositions: {
      ...normalizeUtilityPositions(fallback.utilityPositions),
      ...normalizeUtilityPositions(state?.utilityPositions),
    },
    follows: Array.isArray(state?.follows) ? state.follows : fallback.follows,
    savedPostIds: normalizeIdList(state?.savedPostIds, postIds),
    pinnedPostIds: normalizeIdList(state?.pinnedPostIds, postIds),
    hiddenPostIds: normalizeIdList(state?.hiddenPostIds, postIds),
    hiddenCommentIds: normalizeIdList(state?.hiddenCommentIds, new Set(comments.map((comment) => comment.id))),
    notifications: Array.isArray(state?.notifications) ? state.notifications : fallback.notifications,
    pixelCells,
    pixelCooldowns: normalizePixelCooldowns(state?.pixelCooldowns, userIds),
    reports: Array.isArray(state?.reports) ? state.reports : [],
  };
}

function normalizeUsers(value, fallback) {
  const users = Array.isArray(value) ? value : fallback;
  return users
    .filter((user) => typeof user?.id === "string" && typeof user?.name === "string")
    .map((user) => ({
      id: user.id,
      name: user.name,
      handle: typeof user.handle === "string" ? user.handle : `@${user.id}`,
      bio: typeof user.bio === "string" ? user.bio : "",
      status: typeof user.status === "string" && user.status.trim() ? user.status.trim().slice(0, 40) : "Онлайн",
      joinedAt: Number(user.joinedAt) || Date.now(),
      timeOnSiteMinutes: Math.max(0, Number(user.timeOnSiteMinutes) || 0),
      avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : undefined,
      provider: user.provider === "discord" ? "discord" : undefined,
      discordId: typeof user.discordId === "string" ? user.discordId : undefined,
    }));
}

function ensureMinecraftDownloadPost(posts, utilityPositions, userIds) {
  const position = normalizePosition(utilityPositions?.[minecraftDownloadObjectId]) ?? { x: 274, y: 44 };
  const authorId = userIds.has("rub1kub") ? "rub1kub" : "guest";
  const existing = posts.find((post) => post.id === minecraftDownloadPostId);
  if (existing) {
    return posts.map((post) =>
      post.id === minecraftDownloadPostId
        ? {
            ...post,
            wallId: minecraftWallId,
            authorId: userIds.has(post.authorId) ? post.authorId : authorId,
            text: "мод пак для игры на WhiteShield",
            position: post.position ?? position,
          }
        : post,
    );
  }

  return [
    {
      id: minecraftDownloadPostId,
      wallId: minecraftWallId,
      authorId,
      text: "мод пак для игры на WhiteShield",
      attachments: [],
      reactions: 0,
      views: {
        total: 0,
        uniqueUserIds: [],
      },
      position,
      createdAt: Date.now() - 60000,
    },
    ...posts,
  ];
}

function ensureGuestUser(users) {
  if (users.some((user) => user.id === "guest")) return users;
  return [createDefaultState().users[0], ...users];
}

function normalizeWalls(value, fallback, userIds) {
  const walls = Array.isArray(value) ? value : fallback;
  return walls
    .filter((wall) => typeof wall?.id === "string" && typeof wall?.siteSectionId === "string")
    .map((wall) => ({
      ...wall,
      ownerId: typeof wall.ownerId === "string" && userIds.has(wall.ownerId) ? wall.ownerId : undefined,
      name: typeof wall.name === "string" && wall.name.trim() ? wall.name.trim() : wall.id,
      description: typeof wall.description === "string" ? wall.description : "",
      rules: typeof wall.rules === "string" ? wall.rules : "",
      avatarUrl: normalizeOptionalUrl(wall.avatarUrl),
      bannerUrl: normalizeOptionalUrl(wall.bannerUrl),
      coverUrl: normalizeOptionalUrl(wall.coverUrl),
      avatarFocus: normalizeMediaFocus(wall.avatarFocus),
      bannerFocus: normalizeMediaFocus(wall.bannerFocus),
      accentColor: normalizeWallAccentColor(wall.accentColor),
      actionButtons: normalizeWallActionButtons(wall.actionButtons),
      publishMode: wall.publishMode === "owner" ? "owner" : "open",
    }));
}

function ensureRequiredWalls(walls, fallback) {
  const existingIds = new Set(walls.map((wall) => wall.id));
  const requiredWalls = fallback.filter((wall) => wall.siteSectionId === "space" && !existingIds.has(wall.id));
  return requiredWalls.length > 0 ? [...walls, ...requiredWalls] : walls;
}

function normalizeOptionalUrl(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("/media/")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}

function normalizeWallAccentColor(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return ["green", "yellow", "blue", "pink", "violet", "mono"].includes(trimmed) ? trimmed : undefined;
}

function normalizeMediaFocus(value) {
  if (!value || typeof value !== "object") return undefined;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;

  return {
    x: Math.max(0, Math.min(100, Math.round(x))),
    y: Math.max(0, Math.min(100, Math.round(y))),
  };
}

function normalizeWallActionButtons(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((button) => {
      const label = typeof button?.label === "string" ? button.label.trim().slice(0, 28) : "";
      const url = typeof button?.url === "string" ? button.url.trim() : "";
      if (!label || !/^https?:\/\//i.test(url)) return null;

      return {
        id: typeof button.id === "string" && button.id ? button.id : crypto.randomUUID(),
        label,
        url,
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function normalizePosts(value, fallback, wallIds, userIds) {
  const posts = Array.isArray(value) ? value : fallback;
  return posts
    .filter((post) => typeof post?.id === "string" && wallIds.has(post.wallId) && userIds.has(post.authorId))
    .map((post) => ({
      id: post.id,
      wallId: post.wallId,
      authorId: post.authorId,
      text: typeof post.text === "string" ? post.text : "",
      attachments: Array.isArray(post.attachments) ? post.attachments : [],
      reactions: Math.max(0, Number(post.reactions) || 0),
      views: normalizeViews(post.views, userIds),
      position: normalizePosition(post.position),
      repostOfId: typeof post.repostOfId === "string" ? post.repostOfId : undefined,
      editedAt: post.editedAt ? Number(post.editedAt) : undefined,
      createdAt: Number(post.createdAt) || Date.now(),
    }));
}

function normalizeComments(value, fallback, postIds, userIds) {
  const comments = Array.isArray(value) ? value : fallback;
  return comments
    .filter((comment) => typeof comment?.id === "string" && postIds.has(comment.postId) && userIds.has(comment.authorId))
    .map((comment) => ({
      id: comment.id,
      postId: comment.postId,
      parentId: typeof comment.parentId === "string" ? comment.parentId : undefined,
      authorId: comment.authorId,
      text: typeof comment.text === "string" ? comment.text : "",
      attachments: Array.isArray(comment.attachments) ? comment.attachments : [],
      reactions: Math.max(0, Number(comment.reactions) || 0),
      createdAt: Number(comment.createdAt) || Date.now(),
      editedAt: comment.editedAt ? Number(comment.editedAt) : undefined,
    }));
}

function normalizeViews(value, userIds) {
  const uniqueUserIds = Array.isArray(value?.uniqueUserIds)
    ? value.uniqueUserIds.filter((id) => typeof id === "string" && userIds.has(id))
    : [];

  return {
    total: uniqueUserIds.length,
    uniqueUserIds,
  };
}

function normalizePosition(value) {
  if (!value || typeof value !== "object") return undefined;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return {
    x: Math.max(0, Math.min(1800, Math.round(x))),
    y: Math.max(0, Math.min(2200, Math.round(y))),
  };
}

function normalizeUtilityPositions(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([id]) => typeof id === "string" && id.length > 0 && id.length <= 96)
      .map(([id, position]) => [id, normalizePosition(position)])
      .filter(([, position]) => Boolean(position)),
  );
}

function normalizeIdList(value, allowedIds) {
  if (!Array.isArray(value)) return [];
  return value.filter((id) => typeof id === "string" && allowedIds.has(id));
}

function normalizePixelCells(value, userIds) {
  const cells = Array.isArray(value) ? value : [];
  return cells
    .map((cell) => normalizePixelCell(cell, userIds))
    .filter(Boolean)
    .slice(-maxPixelCells);
}

function normalizePixelCell(cell, userIds) {
  const x = Math.round(Number(cell?.x));
  const y = Math.round(Number(cell?.y));
  const color = typeof cell?.color === "string" ? cell.color.toLowerCase() : "";
  const authorId = typeof cell?.authorId === "string" ? cell.authorId : "";
  const updatedAt = Number(cell?.updatedAt) || Date.now();

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !pixelPalette.has(color) ||
    !userIds.has(authorId)
  ) {
    return null;
  }

  return {
    x: Math.max(0, Math.min(pixelColumns - 1, x)),
    y: Math.max(0, Math.min(pixelRows - 1, y)),
    color,
    authorId,
    updatedAt,
  };
}

function normalizePixelCooldowns(value, userIds) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([userId]) => userIds.has(userId))
      .map(([userId, timestamp]) => [userId, Number(timestamp) || 0]),
  );
}

export function resolveDataPath(...segments) {
  return resolve(join(process.env.KOTLETA_DATA_DIR ?? defaultDataDir, ...segments));
}
