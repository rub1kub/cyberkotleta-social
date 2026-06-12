import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createDefaultState } from "./default-state.mjs";

const maxRequestBodyBytes = 6 * 1024 * 1024;
const defaultDataDir = ".data";
const maxStateBackups = 60;
const pixelColumns = 300;
const pixelRows = 190;
const maxPixelCells = pixelColumns * pixelRows;
const pixelCooldownMs = 1000;
const pixelPalette = new Set(["#111318", "#f6f8f7", "#21e69a", "#0f9f68", "#6c7685", "#5c6cff", "#d93862"]);
const minecraftWallId = "space:minecraft";
const minecraftDownloadPostId = "minecraft-download-post";
const minecraftDownloadObjectId = "minecraft:download-card";
const profileWallPrefix = "profile:";
const spaceSectionId = "space";
const minecraftAdminUserIds = new Set(["rub1kub", "discord:1129003754818125915", "discord:476391268671291393"]);
const postKinds = new Set(["note", "media", "sketch", "idea", "list", "question", "poll", "checklist", "link", "signal"]);
const postBackgrounds = new Set(["plain", "soft", "glass", "gradient", "paper"]);
const postShapes = new Set(["soft", "round", "sharp", "ticket"]);
const postSizes = new Set(["compact", "normal", "wide", "tall"]);
const wallAccentColors = new Set(["green", "yellow", "blue", "pink", "violet", "mono"]);
const sketchPalette = new Set(["#111318", "#f6f8f7", "#21e69a", "#0f9f68", "#6c7685", "#5c6cff", "#d93862", "#f2c94c"]);

export function createSharedStateStore({ dataDir = process.env.KOTLETA_DATA_DIR ?? defaultDataDir } = {}) {
  const stateFile = resolve(dataDir, "social-state.json");
  const subscribers = new Set();

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
    const tempFile = `${stateFile}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    await mkdir(dirname(stateFile), { recursive: true });
    await backupCurrentState(stateFile);
    await writeFile(tempFile, JSON.stringify(payload, null, 2), "utf8");
    await rename(tempFile, stateFile);
    notify(payload);
    return payload;
  }

  function notify(payload) {
    for (const subscriber of subscribers) {
      subscriber(payload);
    }
  }

  function subscribe(subscriber) {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  return {
    read,
    stateFile,
    subscribe,
    write,
  };
}

export function createSocialStateEventsHandler(store = createSharedStateStore()) {
  return async function handleSocialStateEvents(request, response) {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendText(response, 405, "Method not allowed");
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let closed = false;

    function sendSnapshot(payload) {
      if (closed || response.destroyed) return;
      response.write(`event: social-state\nid: ${payload.version}\ndata: ${JSON.stringify(payload)}\n\n`);
    }

    const unsubscribe = store.subscribe(sendSnapshot);
    const heartbeat = setInterval(() => {
      if (!closed && !response.destroyed) {
        response.write(": keepalive\n\n");
      }
    }, 25000);

    request.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    });

    sendSnapshot(await store.read());
  };
}

export function createSocialStateActionHandler(store = createSharedStateStore()) {
  return async function handleSocialStateAction(request, response) {
    try {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendText(response, 405, "Method not allowed");
        return;
      }

      const body = await readRequestBody(request, maxRequestBodyBytes);
      const action = JSON.parse(body || "{}");
      const current = await store.read();
      const nextState = applySocialStateAction(current.state, action);
      sendJson(response, await store.write(nextState));
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        sendText(response, 413, "Action payload is too large");
        return;
      }

      if (error instanceof ActionRejectedError) {
        sendText(response, error.statusCode, error.message);
        return;
      }

      console.error(error);
      sendText(response, 500, "Shared action error");
    }
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
        const incomingState = sanitizeSocialState(payload.state);
        const regression = getDangerousStateRegression(incomingState, current.state);
        if (regression) {
          sendJson(response, { ...current, conflict: true, rejected: regression });
          return;
        }

        if (Number.isFinite(payload.version) && payload.version !== current.version) {
          sendJson(response, { ...current, conflict: true });
          return;
        }

        sendJson(response, await store.write(incomingState));
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

function applySocialStateAction(state, action) {
  if (!action || typeof action !== "object" || typeof action.type !== "string") {
    throw new ActionRejectedError(400, "Missing action type");
  }

  const actorId = normalizeActionId(action.actorId);
  if (!actorId) throw new ActionRejectedError(400, "Missing actor");

  const withActor = upsertActionActor(state, action.actor, actorId);

  switch (action.type) {
    case "post.create":
      return applyCreatePostAction(withActor, action, actorId);
    case "post.move":
      return applyMovePostAction(withActor, action, actorId);
    case "post.react":
      return applyReactPostAction(withActor, action, actorId);
    case "post.view":
      return applyViewPostAction(withActor, action, actorId);
    case "pixel.paint":
      return applyPaintPixelAction(withActor, action, actorId);
    default:
      throw new ActionRejectedError(400, "Unknown action type");
  }
}

function applyCreatePostAction(state, action, actorId) {
  const incomingPost = action.post;
  if (!incomingPost || typeof incomingPost !== "object") {
    throw new ActionRejectedError(400, "Missing post");
  }

  const wallId = normalizeActionId(incomingPost.wallId);
  if (!wallId) throw new ActionRejectedError(400, "Missing wall");

  const stateWithWall = ensureActionWallExists(state, wallId, actorId);
  const wall = stateWithWall.walls.find((item) => item.id === wallId);
  if (!canPublishToWall(wall, actorId)) throw new ActionRejectedError(403, "Cannot publish to wall");

  const postId = normalizeActionId(incomingPost.id) || randomUUID();
  if (stateWithWall.posts.some((post) => post.id === postId)) return stateWithWall;

  const normalized = sanitizeSocialState({
    ...stateWithWall,
    posts: [
      {
        id: postId,
        wallId,
        authorId: actorId,
        kind: incomingPost.kind,
        text: typeof incomingPost.text === "string" ? incomingPost.text.slice(0, 8000) : "",
        attachments: Array.isArray(incomingPost.attachments) ? incomingPost.attachments : [],
        reactions: 0,
        views: { total: 0, uniqueUserIds: [] },
        position: normalizePosition(incomingPost.position),
        appearance: incomingPost.appearance,
        settings: incomingPost.settings,
        sketch: incomingPost.sketch,
        checklist: incomingPost.checklist,
        poll: incomingPost.poll,
        repostOfId: typeof incomingPost.repostOfId === "string" ? incomingPost.repostOfId : undefined,
        createdAt: Number(incomingPost.createdAt) || Date.now(),
      },
      ...stateWithWall.posts,
    ],
  });

  return {
    ...normalized,
    notifications: [
      ...buildMentionNotifications(normalized, actorId, postId, incomingPost.text ?? ""),
      ...normalized.notifications,
    ],
  };
}

function applyMovePostAction(state, action, actorId) {
  const postId = normalizeActionId(action.postId);
  const targetPost = state.posts.find((post) => post.id === postId);
  if (!targetPost) throw new ActionRejectedError(404, "Post not found");
  if (!canMovePost(targetPost, state.walls, actorId)) throw new ActionRejectedError(403, "Cannot move post");

  const position = normalizePosition({ x: action.x, y: action.y });
  if (!position) throw new ActionRejectedError(400, "Invalid position");

  return {
    ...state,
    posts: state.posts.map((post) => post.id === postId ? { ...post, position } : post),
  };
}

function applyReactPostAction(state, action, actorId) {
  const postId = normalizeActionId(action.postId);
  const amount = Math.max(1, Math.min(100, Math.floor(Number(action.amount) || 1)));
  const targetPost = state.posts.find((post) => post.id === postId);
  if (!targetPost) throw new ActionRejectedError(404, "Post not found");
  if (getPostSettings(targetPost).reactions === false) return state;

  return {
    ...state,
    posts: state.posts.map((post) =>
      post.id === postId ? { ...post, reactions: Math.max(0, Number(post.reactions) || 0) + amount } : post,
    ),
    notifications: addPostNotification(state, {
      kind: "reaction",
      actorId,
      postId,
      text: `Новый огонёк ×${amount}`,
    }),
  };
}

function applyViewPostAction(state, action, actorId) {
  const postId = normalizeActionId(action.postId);
  const targetPost = state.posts.find((post) => post.id === postId);
  if (!targetPost) throw new ActionRejectedError(404, "Post not found");
  if (getPostSettings(targetPost).views === false) return state;

  return {
    ...state,
    posts: state.posts.map((post) => {
      if (post.id !== postId) return post;
      const uniqueUserIds = Array.from(new Set([...(post.views?.uniqueUserIds ?? []), actorId]));
      return {
        ...post,
        views: {
          total: uniqueUserIds.length,
          uniqueUserIds,
        },
      };
    }),
  };
}

function applyPaintPixelAction(state, action, actorId) {
  const now = Date.now();
  const lastPixelAt = state.pixelCooldowns[actorId] ?? 0;
  if (now - lastPixelAt < pixelCooldownMs) return state;

  const cell = normalizePixelCell({
    x: action.x,
    y: action.y,
    color: action.color,
    authorId: actorId,
    updatedAt: now,
  }, new Set(state.users.map((user) => user.id)));
  if (!cell) throw new ActionRejectedError(400, "Invalid pixel");

  const cellKey = `${cell.x}:${cell.y}`;
  const nextCells = [
    ...state.pixelCells.filter((item) => `${item.x}:${item.y}` !== cellKey),
    cell,
  ].slice(-maxPixelCells);

  return {
    ...state,
    pixelCells: nextCells,
    pixelCooldowns: {
      ...state.pixelCooldowns,
      [actorId]: now,
    },
  };
}

function normalizeActionId(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 160);
}

function upsertActionActor(state, actor, actorId) {
  const normalizedActor = normalizeActionActor(actor, actorId);
  const existing = state.users.find((user) => user.id === actorId);
  const nextUser = {
    ...(existing ?? normalizedActor),
    ...normalizedActor,
    lastSeenAt: Date.now(),
  };

  return {
    ...state,
    users: existing
      ? state.users.map((user) => user.id === actorId ? nextUser : user)
      : [nextUser, ...state.users],
  };
}

function normalizeActionActor(actor, actorId) {
  const fallbackName = actorId === "guest" || actorId.startsWith("guest:") ? "Гость" : actorId;
  const candidate = actor && typeof actor === "object"
    ? {
        id: actorId,
        name: typeof actor.name === "string" && actor.name.trim() ? actor.name.trim().slice(0, 32) : fallbackName,
        handle: typeof actor.handle === "string" && actor.handle.trim()
          ? actor.handle.trim().slice(0, 40)
          : `@${actorId.replace(/[^a-z0-9_]/gi, "_").slice(0, 24)}`,
        bio: typeof actor.bio === "string" ? actor.bio.slice(0, 180) : "",
        status: typeof actor.status === "string" ? actor.status.slice(0, 40) : undefined,
        joinedAt: Number(actor.joinedAt) || Date.now(),
        lastSeenAt: Date.now(),
        timeOnSiteMinutes: Math.max(0, Number(actor.timeOnSiteMinutes) || 0),
        avatarUrl: normalizeOptionalUrl(actor.avatarUrl),
        provider: actor.provider === "discord" || actor.provider === "local" ? actor.provider : undefined,
        discordId: typeof actor.discordId === "string" ? actor.discordId : undefined,
      }
    : {
        id: actorId,
        name: fallbackName,
        handle: `@${actorId.replace(/[^a-z0-9_]/gi, "_").slice(0, 24)}`,
        bio: "",
        joinedAt: Date.now(),
        lastSeenAt: Date.now(),
        timeOnSiteMinutes: 0,
      };

  return normalizeUsers([candidate], [candidate])[0] ?? candidate;
}

function ensureActionWallExists(state, wallId, actorId) {
  if (state.walls.some((wall) => wall.id === wallId)) return state;
  if (!wallId.startsWith(profileWallPrefix)) return state;

  const userId = wallId.slice(profileWallPrefix.length);
  const user = state.users.find((item) => item.id === userId);
  if (!user && userId !== actorId) return state;

  return {
    ...state,
    walls: [
      {
        id: wallId,
        siteSectionId: wallId,
        name: user ? user.name : "Профиль",
        ownerId: userId,
        description: user?.bio ?? "",
        publishMode: "open",
      },
      ...state.walls,
    ],
  };
}

function canManageWall(wall, userId) {
  if (!wall || !userId) return false;
  if (wall.id.startsWith(profileWallPrefix)) return wall.id === `${profileWallPrefix}${userId}`;
  if (wall.id === minecraftWallId) return minecraftAdminUserIds.has(userId) || wall.ownerId === userId;
  return wall.ownerId === userId;
}

function canMovePost(post, walls, userId) {
  if (!post || !userId) return false;
  if (post.wallId.startsWith(profileWallPrefix)) return post.wallId === `${profileWallPrefix}${userId}`;
  return canManageWall(walls.find((wall) => wall.id === post.wallId), userId);
}

function canPublishToWall(wall, userId) {
  if (!wall || !userId) return false;
  if (wall.id.startsWith(profileWallPrefix)) return true;
  return wall.publishMode !== "owner" || canManageWall(wall, userId);
}

function getPostSettings(post) {
  return {
    comments: post?.settings?.comments !== false,
    reactions: post?.settings?.reactions !== false,
    reposts: post?.settings?.reposts !== false,
    saves: post?.settings?.saves !== false,
    views: post?.settings?.views !== false,
  };
}

function addPostNotification(state, { actorId, kind, postId, text }) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post || post.authorId === actorId) return state.notifications;

  return [
    {
      id: randomUUID(),
      kind,
      actorId,
      recipientId: post.authorId,
      postId,
      text,
      createdAt: Date.now(),
    },
    ...state.notifications,
  ];
}

function buildMentionNotifications(state, actorId, postId, text) {
  if (typeof text !== "string" || !text.includes("@")) return [];
  const lowerText = text.toLowerCase();

  return state.users
    .filter((user) => user.id !== actorId && typeof user.handle === "string" && lowerText.includes(user.handle.toLowerCase()))
    .map((user) => ({
      id: randomUUID(),
      kind: "mention",
      actorId,
      recipientId: user.id,
      postId,
      text: "Вас упомянули",
      createdAt: Date.now(),
    }));
}

class ActionRejectedError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function backupCurrentState(stateFile) {
  try {
    const info = await stat(stateFile);
    if (!info.isFile() || info.size === 0) return;

    const backupDir = join(dirname(stateFile), "backups");
    await mkdir(backupDir, { recursive: true });
    await copyFile(stateFile, join(backupDir, `social-state.${Date.now()}.json`));
    await pruneStateBackups(backupDir);
  } catch {
    // Missing state file on first boot is expected.
  }
}

async function pruneStateBackups(backupDir) {
  try {
    const entries = await readdir(backupDir, { withFileTypes: true });
    const backups = entries
      .filter((entry) => entry.isFile() && /^social-state\.\d+\.json$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const staleBackups = backups.slice(0, Math.max(0, backups.length - maxStateBackups));

    await Promise.all(staleBackups.map((name) => unlink(join(backupDir, name)).catch(() => undefined)));
  } catch {
    // Backups are safety net only; they must not block the main write.
  }
}

function getDangerousStateRegression(nextState, currentState) {
  const nextCounts = getStateCounts(nextState);
  const currentCounts = getStateCounts(currentState);
  const postDrop = currentCounts.posts - nextCounts.posts;
  const userDrop = currentCounts.users - nextCounts.users;
  const wallDrop = currentCounts.walls - nextCounts.walls;

  if (postDrop >= 3) return { reason: "posts-regression", current: currentCounts, next: nextCounts };
  if (userDrop >= 3) return { reason: "users-regression", current: currentCounts, next: nextCounts };
  if (wallDrop >= 2) return { reason: "walls-regression", current: currentCounts, next: nextCounts };
  return null;
}

function getStateCounts(state) {
  return {
    comments: Array.isArray(state?.comments) ? state.comments.length : 0,
    posts: Array.isArray(state?.posts) ? state.posts.length : 0,
    users: Array.isArray(state?.users) ? state.users.length : 0,
    walls: Array.isArray(state?.walls) ? state.walls.length : 0,
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
  const postConnections = normalizePostConnections(state?.postConnections, postIds, userIds);

  return {
    siteSections: fallback.siteSections,
    users,
    activeUserId: userIds.has(state?.activeUserId) ? state.activeUserId : "guest",
    walls,
    posts,
    comments,
    postConnections,
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
      status: typeof user.status === "string" && user.status.trim() && user.status.trim() !== "Онлайн"
        ? user.status.trim().slice(0, 40)
        : undefined,
      joinedAt: Number(user.joinedAt) || Date.now(),
      lastSeenAt: Number.isFinite(Number(user.lastSeenAt)) && Number(user.lastSeenAt) > 0
        ? Number(user.lastSeenAt)
        : undefined,
      timeOnSiteMinutes: Math.max(0, Number(user.timeOnSiteMinutes) || 0),
      avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : undefined,
      provider: user.provider === "discord" || user.provider === "local" ? user.provider : undefined,
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
      name: normalizeUserText(wall.name, wall.id),
      description: normalizeUserText(wall.description, ""),
      rules: normalizeUserText(wall.rules, ""),
      avatarUrl: normalizeOptionalUrl(wall.avatarUrl),
      bannerUrl: normalizeOptionalUrl(wall.bannerUrl),
      coverUrl: normalizeOptionalUrl(wall.coverUrl),
      avatarFocus: normalizeMediaFocus(wall.avatarFocus),
      bannerFocus: normalizeMediaFocus(wall.bannerFocus),
      accentColor: normalizeWallAccentColor(wall.accentColor),
      actionButtons: normalizeWallActionButtons(wall.actionButtons),
      privacyMode: normalizeWallPrivacyMode(wall.privacyMode),
      invite: normalizeWallInvite(wall.invite),
      publishMode: wall.publishMode === "owner" ? "owner" : "open",
    }));
}

function normalizeUserText(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.replace(/\uFFFD+/g, "").trim();
  return trimmed || fallback;
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
  const trimmed = value.trim().toLowerCase();
  if (wallAccentColors.has(trimmed)) return trimmed;
  return normalizeHexColor(trimmed);
}

function normalizeHexColor(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  const shortMatch = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : undefined;
}

function normalizeWallPrivacyMode(value) {
  return value === "link" || value === "invite" ? value : "public";
}

function normalizeWallInvite(value) {
  if (!value || typeof value !== "object" || typeof value.code !== "string") return undefined;

  return {
    code: value.code.trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || randomUUID().replace(/-/g, "").slice(0, 12),
    expiresAt: Number.isFinite(Number(value.expiresAt)) && Number(value.expiresAt) > 0 ? Number(value.expiresAt) : undefined,
    maxUses: Number.isFinite(Number(value.maxUses)) && Number(value.maxUses) > 0 ? Math.round(Number(value.maxUses)) : undefined,
    usedBy: Array.from(new Set(Array.isArray(value.usedBy) ? value.usedBy.filter((id) => typeof id === "string") : [])).slice(0, 200),
  };
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
      kind: postKinds.has(post.kind) ? post.kind : "note",
      text: typeof post.text === "string" ? post.text : "",
      attachments: Array.isArray(post.attachments) ? post.attachments : [],
      reactions: Math.max(0, Number(post.reactions) || 0),
      views: normalizeViews(post.views, userIds),
      position: normalizePosition(post.position),
      appearance: normalizePostAppearance(post.appearance),
      settings: normalizePostSettings(post.settings),
      sketch: normalizeSketchStrokes(post.sketch),
      checklist: normalizeChecklist(post.checklist),
      poll: normalizePostPoll(post.poll),
      repostOfId: typeof post.repostOfId === "string" ? post.repostOfId : undefined,
      editedAt: post.editedAt ? Number(post.editedAt) : undefined,
      createdAt: Number(post.createdAt) || Date.now(),
    }));
}

function normalizePostSettings(value) {
  const settings = value && typeof value === "object" ? value : {};

  return {
    comments: settings.comments !== false,
    reactions: settings.reactions !== false,
    reposts: settings.reposts !== false,
    saves: settings.saves !== false,
    views: settings.views !== false,
  };
}

function normalizePostAppearance(value) {
  const appearance = value && typeof value === "object" ? value : {};

  return {
    accentColor: normalizeWallAccentColor(appearance.accentColor),
    background: postBackgrounds.has(appearance.background) ? appearance.background : "plain",
    shape: postShapes.has(appearance.shape) ? appearance.shape : "soft",
    size: postSizes.has(appearance.size) ? appearance.size : "normal",
  };
}

function normalizeSketchStrokes(value) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((stroke) => {
    if (!stroke || typeof stroke !== "object") return [];
    const color = typeof stroke.color === "string" ? stroke.color.toLowerCase() : "";
    const width = Math.max(1, Math.min(12, Math.round(Number(stroke.width) || 3)));
    const points = Array.isArray(stroke.points)
      ? stroke.points.flatMap((point) => {
          if (!point || typeof point !== "object") return [];
          const x = Number(point.x);
          const y = Number(point.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
          return [{
            x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)),
            y: Math.max(0, Math.min(100, Math.round(y * 10) / 10)),
          }];
        })
      : [];
    if (!sketchPalette.has(color) || points.length < 2) return [];

    return [{
      id: typeof stroke.id === "string" && stroke.id ? stroke.id : randomUUID(),
      color,
      width,
      points: points.slice(0, 300),
    }];
  }).slice(0, 80);
}

function normalizeChecklist(value) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const text = typeof item.text === "string" ? item.text.trim().slice(0, 120) : "";
    if (!text) return [];

    return [{
      id: typeof item.id === "string" && item.id ? item.id : randomUUID(),
      text,
      checkedBy: Array.from(new Set(Array.isArray(item.checkedBy) ? item.checkedBy.filter((id) => typeof id === "string") : [])).slice(0, 500),
    }];
  }).slice(0, 24);
}

function normalizePostPoll(value) {
  if (!value || typeof value !== "object") return undefined;
  const options = Array.isArray(value.options)
    ? value.options.flatMap((option) => {
        if (!option || typeof option !== "object") return [];
        const text = typeof option.text === "string" ? option.text.trim().slice(0, 90) : "";
        if (!text) return [];

        return [{
          id: typeof option.id === "string" && option.id ? option.id : randomUUID(),
          text,
          voterIds: Array.from(new Set(Array.isArray(option.voterIds) ? option.voterIds.filter((id) => typeof id === "string") : [])).slice(0, 500),
        }];
      })
    : [];

  if (options.length < 2) return undefined;

  return {
    question: typeof value.question === "string" && value.question.trim()
      ? value.question.trim().slice(0, 160)
      : "Голосование",
    multi: value.multi === true,
    options: options.slice(0, 8),
  };
}

function normalizePostConnections(value, postIds, userIds) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();

  return value.flatMap((connection) => {
    if (!connection || typeof connection !== "object") return [];
    const fromPostId = typeof connection.fromPostId === "string" ? connection.fromPostId : "";
    const toPostId = typeof connection.toPostId === "string" ? connection.toPostId : "";
    if (!postIds.has(fromPostId) || !postIds.has(toPostId) || fromPostId === toPostId) return [];

    const key = `${fromPostId}:${toPostId}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      id: typeof connection.id === "string" && connection.id ? connection.id : randomUUID(),
      fromPostId,
      toPostId,
      authorId: userIds.has(connection.authorId) ? connection.authorId : "guest",
      label: typeof connection.label === "string" && connection.label.trim()
        ? connection.label.trim().slice(0, 28)
        : undefined,
      createdAt: Number(connection.createdAt) || Date.now(),
    }];
  }).slice(0, 500);
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
