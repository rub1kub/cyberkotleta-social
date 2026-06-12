import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
  const dbFile = resolve(dataDir, "social-state.sqlite");
  const subscribers = new Set();
  let database;

  async function read() {
    const db = await ensureDatabase();
    return readStatePayloadFromDatabase(db);
  }

  async function write(state, version = Date.now()) {
    const db = await ensureDatabase();
    const payload = {
      state: sanitizeSocialState(state),
      version,
    };
    await backupCurrentDatabaseState(db, dataDir);
    writeStatePayloadToDatabase(db, payload);
    notify(payload);
    return payload;
  }

  async function applyAction(action) {
    const db = await ensureDatabase();
    const payload = applyDirectSocialStateAction(db, action);
    if (!payload) return null;
    notify(payload);
    return payload;
  }

  async function ensureDatabase() {
    if (database) return database;

    mkdirSync(dataDir, { recursive: true });
    database = new DatabaseSync(dbFile);
    initializeStateDatabase(database);

    if (!hasDatabaseState(database)) {
      const payload = await readLegacyStatePayload(stateFile);
      if (existsSync(stateFile)) await backupCurrentState(stateFile);
      writeStatePayloadToDatabase(database, payload);
    }

    return database;
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
    applyAction,
    dbFile,
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
      try {
        response.write(`retry: 2000\nevent: social-state\nid: ${payload.version}\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {
        closed = true;
      }
    }

    const unsubscribe = store.subscribe(sendSnapshot);
    const heartbeat = setInterval(() => {
      if (!closed && !response.destroyed) {
        try {
          response.write(": keepalive\n\n");
        } catch {
          closed = true;
        }
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
      const directPayload = typeof store.applyAction === "function" ? await store.applyAction(action) : null;
      if (directPayload) {
        sendJson(response, directPayload);
        return;
      }

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
    case "post.update":
      return applyUpdatePostAction(withActor, action, actorId);
    case "post.delete":
      return applyDeletePostAction(withActor, action, actorId);
    case "post.save.toggle":
      return applyToggleSavedPostAction(withActor, action, actorId);
    case "post.repost":
      return applyRepostAction(withActor, action, actorId);
    case "comment.create":
      return applyCreateCommentAction(withActor, action, actorId);
    case "comment.react":
      return applyReactCommentAction(withActor, action, actorId);
    case "comment.update":
      return applyUpdateCommentAction(withActor, action, actorId);
    case "comment.delete":
      return applyDeleteCommentAction(withActor, action, actorId);
    case "checklist.toggle":
      return applyToggleChecklistAction(withActor, action, actorId);
    case "poll.vote":
      return applyVotePollAction(withActor, action, actorId);
    case "follow.toggle":
      return applyToggleFollowAction(withActor, action, actorId);
    case "connection.create":
      return applyCreateConnectionAction(withActor, action, actorId);
    case "connection.delete":
      return applyDeleteConnectionAction(withActor, action, actorId);
    case "wall.create":
      return applyCreateWallAction(withActor, action, actorId);
    case "wall.update":
      return applyUpdateWallAction(withActor, action, actorId);
    case "wall.delete":
      return applyDeleteWallAction(withActor, action, actorId);
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

function applyUpdatePostAction(state, action, actorId) {
  const postId = normalizeActionId(action.postId);
  const targetPost = state.posts.find((post) => post.id === postId);
  if (!targetPost) throw new ActionRejectedError(404, "Post not found");
  if (targetPost.authorId !== actorId) throw new ActionRejectedError(403, "Cannot edit post");

  return sanitizeSocialState({
    ...state,
    posts: state.posts.map((post) =>
      post.id === postId
        ? {
            ...post,
            text: typeof action.text === "string" ? action.text.slice(0, 8000) : post.text,
            ...(action.options?.kind ? { kind: action.options.kind } : {}),
            ...(action.options?.appearance ? { appearance: action.options.appearance } : {}),
            ...(action.options?.settings ? { settings: action.options.settings } : {}),
            ...(action.options?.sketch ? { sketch: action.options.sketch } : {}),
            ...(action.options?.checklist ? { checklist: action.options.checklist } : {}),
            ...(Object.prototype.hasOwnProperty.call(action.options ?? {}, "poll") ? { poll: action.options?.poll } : {}),
            editedAt: Date.now(),
          }
        : post,
    ),
  });
}

function applyDeletePostAction(state, action, actorId) {
  const postId = normalizeActionId(action.postId);
  const targetPost = state.posts.find((post) => post.id === postId);
  if (!targetPost) throw new ActionRejectedError(404, "Post not found");
  const wall = state.walls.find((item) => item.id === targetPost.wallId);
  if (targetPost.authorId !== actorId && !canManageWall(wall, actorId)) {
    throw new ActionRejectedError(403, "Cannot delete post");
  }

  const commentIds = new Set(state.comments.filter((comment) => comment.postId === postId).map((comment) => comment.id));

  return {
    ...state,
    posts: state.posts.filter((post) => post.id !== postId),
    comments: state.comments.filter((comment) => comment.postId !== postId),
    postConnections: state.postConnections.filter(
      (connection) => connection.fromPostId !== postId && connection.toPostId !== postId,
    ),
    savedPostIds: state.savedPostIds.filter((id) => id !== postId),
    pinnedPostIds: state.pinnedPostIds.filter((id) => id !== postId),
    hiddenPostIds: state.hiddenPostIds.filter((id) => id !== postId),
    hiddenCommentIds: state.hiddenCommentIds.filter((id) => !commentIds.has(id)),
    savedPostIdsByUser: removeIdsFromUserScopedIdLists(state.savedPostIdsByUser, new Set([postId])),
    pinnedPostIdsByUser: removeIdsFromUserScopedIdLists(state.pinnedPostIdsByUser, new Set([postId])),
    hiddenPostIdsByUser: removeIdsFromUserScopedIdLists(state.hiddenPostIdsByUser, new Set([postId])),
    hiddenCommentIdsByUser: removeIdsFromUserScopedIdLists(state.hiddenCommentIdsByUser, commentIds),
    notifications: state.notifications.filter((item) => item.postId !== postId),
    reports: state.reports.filter((report) => report.postId !== postId && (!report.commentId || !commentIds.has(report.commentId))),
  };
}

function applyToggleSavedPostAction(state, action, actorId) {
  const postId = normalizeActionId(action.postId);
  const targetPost = state.posts.find((post) => post.id === postId);
  if (!targetPost) throw new ActionRejectedError(404, "Post not found");
  if (getPostSettings(targetPost).saves === false) return state;
  const savedPostIdsByUser = toggleUserScopedId(state.savedPostIdsByUser, actorId, postId);

  return {
    ...state,
    savedPostIdsByUser,
    savedPostIds: savedPostIdsByUser[actorId] ?? [],
  };
}

function applyRepostAction(state, action, actorId) {
  const sourcePost = getRepostSourcePost(state.posts, normalizeActionId(action.postId));
  if (!sourcePost) throw new ActionRejectedError(404, "Post not found");
  if (getPostSettings(sourcePost).reposts === false) return state;
  if (hasUserRepostedPost(state.posts, sourcePost.id, actorId)) return state;

  const wallId = `${profileWallPrefix}${actorId}`;
  const stateWithWall = ensureActionWallExists(state, wallId, actorId);
  const repostId = normalizeActionId(action.repostId) || randomUUID();
  const position = normalizePosition(action.position) ?? { x: 274, y: 220 };

  return {
    ...stateWithWall,
    posts: [
      {
        id: repostId,
        wallId,
        authorId: actorId,
        text: "",
        attachments: [],
        reactions: 0,
        views: { total: 0, uniqueUserIds: [] },
        position,
        repostOfId: sourcePost.id,
        createdAt: Number(action.createdAt) || Date.now(),
      },
      ...stateWithWall.posts,
    ],
    notifications: addPostNotification(stateWithWall, {
      kind: "repost",
      actorId,
      postId: sourcePost.id,
      text: "Заметка появилась на доске",
    }),
  };
}

function applyCreateCommentAction(state, action, actorId) {
  const incomingComment = action.comment;
  if (!incomingComment || typeof incomingComment !== "object") {
    throw new ActionRejectedError(400, "Missing comment");
  }

  const postId = normalizeActionId(incomingComment.postId);
  const targetPost = state.posts.find((post) => post.id === postId);
  if (!targetPost) throw new ActionRejectedError(404, "Post not found");
  if (getPostSettings(targetPost).comments === false) return state;

  const parentId = normalizeActionId(incomingComment.parentId);
  const parentComment = parentId ? state.comments.find((comment) => comment.id === parentId) : undefined;
  if (parentId && (!parentComment || parentComment.postId !== postId)) {
    throw new ActionRejectedError(400, "Invalid parent comment");
  }

  const commentId = normalizeActionId(incomingComment.id) || randomUUID();
  if (state.comments.some((comment) => comment.id === commentId)) return state;

  const normalized = sanitizeSocialState({
    ...state,
    comments: [
      ...state.comments,
      {
        id: commentId,
        postId,
        parentId: parentId || undefined,
        authorId: actorId,
        text: typeof incomingComment.text === "string" ? incomingComment.text.slice(0, 3000) : "",
        attachments: Array.isArray(incomingComment.attachments) ? incomingComment.attachments : [],
        reactions: 0,
        createdAt: Number(incomingComment.createdAt) || Date.now(),
      },
    ],
  });
  const createdComment = normalized.comments.find((comment) => comment.id === commentId);
  if (!createdComment) return normalized;

  return {
    ...normalized,
    notifications: [
      ...buildCommentNotifications(normalized, createdComment),
      ...buildMentionNotifications(normalized, actorId, postId, createdComment.text, commentId),
      ...normalized.notifications,
    ],
  };
}

function applyReactCommentAction(state, action, actorId) {
  const commentId = normalizeActionId(action.commentId);
  const amount = Math.max(1, Math.min(50, Math.floor(Number(action.amount) || 1)));
  const targetComment = state.comments.find((comment) => comment.id === commentId);
  if (!targetComment) throw new ActionRejectedError(404, "Comment not found");

  return {
    ...state,
    comments: state.comments.map((comment) =>
      comment.id === commentId ? { ...comment, reactions: Math.max(0, Number(comment.reactions) || 0) + amount } : comment,
    ),
    notifications: addCommentReactionNotification(state, actorId, commentId),
  };
}

function applyUpdateCommentAction(state, action, actorId) {
  const commentId = normalizeActionId(action.commentId);
  const targetComment = state.comments.find((comment) => comment.id === commentId);
  if (!targetComment) throw new ActionRejectedError(404, "Comment not found");
  if (targetComment.authorId !== actorId) throw new ActionRejectedError(403, "Cannot edit comment");

  const nextText = typeof action.text === "string" ? action.text.trim().slice(0, 3000) : "";
  if (!nextText) throw new ActionRejectedError(400, "Missing comment text");

  return {
    ...state,
    comments: state.comments.map((comment) =>
      comment.id === commentId
        ? { ...comment, text: nextText, editedAt: Date.now() }
        : comment,
    ),
  };
}

function applyDeleteCommentAction(state, action, actorId) {
  const commentId = normalizeActionId(action.commentId);
  const targetComment = state.comments.find((comment) => comment.id === commentId);
  if (!targetComment) throw new ActionRejectedError(404, "Comment not found");
  const targetPost = state.posts.find((post) => post.id === targetComment.postId);
  const wall = targetPost ? state.walls.find((item) => item.id === targetPost.wallId) : undefined;
  if (targetComment.authorId !== actorId && !canManageWall(wall, actorId)) {
    throw new ActionRejectedError(403, "Cannot delete comment");
  }

  const idsToDelete = new Set([commentId]);
  for (const comment of state.comments) {
    if (comment.parentId === commentId) idsToDelete.add(comment.id);
  }

  return {
    ...state,
    comments: state.comments.filter((comment) => !idsToDelete.has(comment.id)),
    hiddenCommentIds: state.hiddenCommentIds.filter((id) => !idsToDelete.has(id)),
    hiddenCommentIdsByUser: removeIdsFromUserScopedIdLists(state.hiddenCommentIdsByUser, idsToDelete),
    reports: state.reports.filter((report) => !report.commentId || !idsToDelete.has(report.commentId)),
  };
}

function applyToggleChecklistAction(state, action, actorId) {
  const postId = normalizeActionId(action.postId);
  const itemId = normalizeActionId(action.itemId);
  if (!state.posts.some((post) => post.id === postId)) throw new ActionRejectedError(404, "Post not found");

  return {
    ...state,
    posts: state.posts.map((post) => {
      if (post.id !== postId || !Array.isArray(post.checklist)) return post;

      return {
        ...post,
        checklist: post.checklist.map((item) => {
          if (item.id !== itemId) return item;
          const isChecked = item.checkedBy.includes(actorId);
          return {
            ...item,
            checkedBy: isChecked
              ? item.checkedBy.filter((id) => id !== actorId)
              : [...item.checkedBy, actorId],
          };
        }),
      };
    }),
  };
}

function applyVotePollAction(state, action, actorId) {
  const postId = normalizeActionId(action.postId);
  const optionId = normalizeActionId(action.optionId);
  if (!state.posts.some((post) => post.id === postId)) throw new ActionRejectedError(404, "Post not found");

  return {
    ...state,
    posts: state.posts.map((post) => {
      if (post.id !== postId || !post.poll) return post;
      const hasVotedOption = post.poll.options.some((option) => option.id === optionId && option.voterIds.includes(actorId));

      return {
        ...post,
        poll: {
          ...post.poll,
          options: post.poll.options.map((option) => {
            if (post.poll?.multi) {
              if (option.id !== optionId) return option;
              return {
                ...option,
                voterIds: hasVotedOption
                  ? option.voterIds.filter((id) => id !== actorId)
                  : [...option.voterIds, actorId],
              };
            }

            if (option.id === optionId) {
              return {
                ...option,
                voterIds: hasVotedOption
                  ? option.voterIds.filter((id) => id !== actorId)
                  : Array.from(new Set([...option.voterIds, actorId])),
              };
            }

            return {
              ...option,
              voterIds: option.voterIds.filter((id) => id !== actorId),
            };
          }),
        },
      };
    }),
  };
}

function applyToggleFollowAction(state, action, actorId) {
  const targetType = action.targetType === "wall" ? "wall" : "user";
  const targetId = normalizeActionId(action.targetId);
  if (!targetId) throw new ActionRejectedError(400, "Missing follow target");
  if (targetType === "wall" && !state.walls.some((wall) => wall.id === targetId)) throw new ActionRejectedError(404, "Wall not found");
  if (targetType === "user" && !state.users.some((user) => user.id === targetId)) throw new ActionRejectedError(404, "User not found");

  const existing = state.follows.find((follow) => follow.userId === actorId && follow.targetType === targetType && follow.targetId === targetId);
  if (existing) {
    return {
      ...state,
      follows: state.follows.filter((follow) => follow.id !== existing.id),
    };
  }

  return {
    ...state,
    follows: [
      {
        id: randomUUID(),
        userId: actorId,
        targetId,
        targetType,
        createdAt: Date.now(),
      },
      ...state.follows,
    ],
    notifications: addFollowNotification(state, actorId, targetType, targetId),
  };
}

function applyCreateConnectionAction(state, action, actorId) {
  const connection = action.connection;
  if (!connection || typeof connection !== "object") throw new ActionRejectedError(400, "Missing connection");
  const fromPostId = normalizeActionId(connection.fromPostId);
  const toPostId = normalizeActionId(connection.toPostId);
  if (!fromPostId || !toPostId || fromPostId === toPostId) throw new ActionRejectedError(400, "Invalid connection");
  const fromPost = state.posts.find((post) => post.id === fromPostId);
  const toPost = state.posts.find((post) => post.id === toPostId);
  if (!fromPost || !toPost) {
    throw new ActionRejectedError(404, "Post not found");
  }
  if (!canMovePost(fromPost, state.walls, actorId) || !canMovePost(toPost, state.walls, actorId)) {
    throw new ActionRejectedError(403, "Cannot create connection");
  }
  if (state.postConnections.some((item) => item.fromPostId === fromPostId && item.toPostId === toPostId)) return state;

  return sanitizeSocialState({
    ...state,
    postConnections: [
      {
        id: normalizeActionId(connection.id) || randomUUID(),
        fromPostId,
        toPostId,
        authorId: actorId,
        label: typeof connection.label === "string" ? connection.label : undefined,
        createdAt: Number(connection.createdAt) || Date.now(),
      },
      ...state.postConnections,
    ],
  });
}

function applyDeleteConnectionAction(state, action, actorId) {
  const connectionId = normalizeActionId(action.connectionId);
  const connection = state.postConnections.find((item) => item.id === connectionId);
  if (!connection) throw new ActionRejectedError(404, "Connection not found");
  const fromPost = state.posts.find((post) => post.id === connection.fromPostId);
  const wall = fromPost ? state.walls.find((item) => item.id === fromPost.wallId) : undefined;
  if (connection.authorId !== actorId && !canManageWall(wall, actorId)) {
    throw new ActionRejectedError(403, "Cannot delete connection");
  }

  return {
    ...state,
    postConnections: state.postConnections.filter((item) => item.id !== connectionId),
  };
}

function applyCreateWallAction(state, action, actorId) {
  const wall = action.wall;
  if (!wall || typeof wall !== "object") throw new ActionRejectedError(400, "Missing wall");
  const wallId = normalizeActionId(wall.id);
  if (!wallId || state.walls.some((item) => item.id === wallId)) return state;

  return sanitizeSocialState({
    ...state,
    walls: [
      {
        ...wall,
        id: wallId,
        siteSectionId: wall.siteSectionId || spaceSectionId,
        ownerId: actorId,
      },
      ...state.walls,
    ],
  });
}

function applyUpdateWallAction(state, action, actorId) {
  const wallId = normalizeActionId(action.wallId);
  const targetWall = state.walls.find((wall) => wall.id === wallId);
  if (!targetWall) throw new ActionRejectedError(404, "Wall not found");
  if (!canManageWall(targetWall, actorId)) throw new ActionRejectedError(403, "Cannot update wall");

  return sanitizeSocialState({
    ...state,
    walls: state.walls.map((wall) =>
      wall.id === wallId
        ? {
            ...wall,
            ...action.wall,
            id: wall.id,
            siteSectionId: wall.siteSectionId,
            ownerId: wall.ownerId,
          }
        : wall,
    ),
  });
}

function applyDeleteWallAction(state, action, actorId) {
  const wallId = normalizeActionId(action.wallId);
  const wall = state.walls.find((item) => item.id === wallId);
  if (!wall) throw new ActionRejectedError(404, "Wall not found");
  if (wall.id.startsWith(profileWallPrefix) || wall.id === minecraftWallId) throw new ActionRejectedError(403, "Cannot delete wall");
  if (!canManageWall(wall, actorId)) throw new ActionRejectedError(403, "Cannot delete wall");

  const postIds = new Set(state.posts.filter((post) => post.wallId === wallId).map((post) => post.id));
  const commentIds = new Set(state.comments.filter((comment) => postIds.has(comment.postId)).map((comment) => comment.id));

  return {
    ...state,
    walls: state.walls.filter((item) => item.id !== wallId),
    posts: state.posts.filter((post) => post.wallId !== wallId),
    comments: state.comments.filter((comment) => !postIds.has(comment.postId)),
    postConnections: state.postConnections.filter(
      (connection) => !postIds.has(connection.fromPostId) && !postIds.has(connection.toPostId),
    ),
    follows: state.follows.filter((follow) => follow.targetType !== "wall" || follow.targetId !== wallId),
    savedPostIds: state.savedPostIds.filter((postId) => !postIds.has(postId)),
    pinnedPostIds: state.pinnedPostIds.filter((postId) => !postIds.has(postId)),
    hiddenPostIds: state.hiddenPostIds.filter((postId) => !postIds.has(postId)),
    hiddenCommentIds: state.hiddenCommentIds.filter((commentId) => !commentIds.has(commentId)),
    savedPostIdsByUser: removeIdsFromUserScopedIdLists(state.savedPostIdsByUser, postIds),
    pinnedPostIdsByUser: removeIdsFromUserScopedIdLists(state.pinnedPostIdsByUser, postIds),
    hiddenPostIdsByUser: removeIdsFromUserScopedIdLists(state.hiddenPostIdsByUser, postIds),
    hiddenCommentIdsByUser: removeIdsFromUserScopedIdLists(state.hiddenCommentIdsByUser, commentIds),
    notifications: state.notifications.filter((item) => !item.postId || !postIds.has(item.postId)),
    reports: state.reports.filter((report) => {
      if (report.postId && postIds.has(report.postId)) return false;
      if (report.commentId && commentIds.has(report.commentId)) return false;
      return true;
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

function getRepostSourcePost(posts, postId) {
  const post = posts.find((item) => item.id === postId);
  if (!post) return null;
  return post.repostOfId ? posts.find((item) => item.id === post.repostOfId) ?? post : post;
}

function hasUserRepostedPost(posts, sourcePostId, userId) {
  return posts.some((post) => post.authorId === userId && post.repostOfId === sourcePostId);
}

function buildCommentNotifications(state, comment) {
  const post = state.posts.find((item) => item.id === comment.postId);
  if (!post) return [];

  const notifications = [];
  const parentComment = comment.parentId
    ? state.comments.find((item) => item.id === comment.parentId)
    : undefined;

  if (parentComment && parentComment.authorId !== comment.authorId) {
    notifications.push({
      id: randomUUID(),
      kind: "reply",
      actorId: comment.authorId,
      recipientId: parentComment.authorId,
      postId: comment.postId,
      commentId: comment.id,
      text: "Ответ на ваш ответ",
      createdAt: Date.now(),
    });
  }

  if (post.authorId !== comment.authorId && post.authorId !== parentComment?.authorId) {
    notifications.push({
      id: randomUUID(),
      kind: "comment",
      actorId: comment.authorId,
      recipientId: post.authorId,
      postId: comment.postId,
      commentId: comment.id,
      text: "Новый ответ",
      createdAt: Date.now(),
    });
  }

  return notifications;
}

function addCommentReactionNotification(state, actorId, commentId) {
  const comment = state.comments.find((item) => item.id === commentId);
  if (!comment || comment.authorId === actorId) return state.notifications;

  return [
    {
      id: randomUUID(),
      kind: "reaction",
      actorId,
      recipientId: comment.authorId,
      postId: comment.postId,
      commentId,
      text: "Огонёк на ваш ответ",
      createdAt: Date.now(),
    },
    ...state.notifications,
  ];
}

function addFollowNotification(state, actorId, targetType, targetId) {
  if (targetType !== "user" || targetId === actorId) return state.notifications;

  return [
    {
      id: randomUUID(),
      kind: "follow",
      actorId,
      recipientId: targetId,
      text: "Новая подписка",
      createdAt: Date.now(),
    },
    ...state.notifications,
  ];
}

function buildMentionNotifications(state, actorId, postId, text, commentId) {
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
      commentId,
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

function initializeStateDatabase(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS state_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_sections (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS walls (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      owner_id TEXT,
      site_section_id TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      wall_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_connections (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      from_post_id TEXT NOT NULL,
      to_post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      recipient_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pixel_cells (
      cell_key TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS utility_positions (
      id TEXT PRIMARY KEY,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_scoped_lists (
      kind TEXT NOT NULL,
      user_id TEXT NOT NULL,
      ids TEXT NOT NULL,
      PRIMARY KEY (kind, user_id)
    );

    CREATE TABLE IF NOT EXISTS pixel_cooldowns (
      user_id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS posts_wall_created_idx ON posts (wall_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author_id);
    CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, created_at);
    CREATE INDEX IF NOT EXISTS follows_user_idx ON follows (user_id, target_type);
    CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_id, created_at DESC);
  `);
}

function hasDatabaseState(db) {
  const row = db.prepare("SELECT value FROM state_meta WHERE key = ?").get("version");
  return Number.isFinite(Number(row?.value));
}

async function readLegacyStatePayload(stateFile) {
  try {
    const raw = await readFile(stateFile, "utf8");
    const payload = JSON.parse(raw);
    if (payload?.state && Number.isFinite(payload.version)) {
      return {
        state: sanitizeSocialState(payload.state),
        version: payload.version,
      };
    }
  } catch {
    // Missing or broken JSON state migrates to the default state.
  }

  return {
    state: createDefaultState(),
    version: Date.now(),
  };
}

function readStatePayloadFromDatabase(db) {
  const version = Number(readMetaValue(db, "version")) || Date.now();
  const state = sanitizeSocialState({
    siteSections: readJsonRows(db, "site_sections"),
    users: readJsonRows(db, "users"),
    activeUserId: readMetaValue(db, "activeUserId") ?? "guest",
    walls: readJsonRows(db, "walls"),
    posts: readJsonRows(db, "posts"),
    comments: readJsonRows(db, "comments"),
    utilityPositions: readUtilityPositions(db),
    postConnections: readJsonRows(db, "post_connections"),
    follows: readJsonRows(db, "follows"),
    savedPostIdsByUser: readScopedLists(db, "savedPostIdsByUser"),
    pinnedPostIdsByUser: readScopedLists(db, "pinnedPostIdsByUser"),
    hiddenPostIdsByUser: readScopedLists(db, "hiddenPostIdsByUser"),
    hiddenCommentIdsByUser: readScopedLists(db, "hiddenCommentIdsByUser"),
    savedPostIds: readMetaJson(db, "savedPostIds", []),
    pinnedPostIds: readMetaJson(db, "pinnedPostIds", []),
    hiddenPostIds: readMetaJson(db, "hiddenPostIds", []),
    hiddenCommentIds: readMetaJson(db, "hiddenCommentIds", []),
    notifications: readJsonRows(db, "notifications"),
    pixelCells: readJsonRows(db, "pixel_cells"),
    pixelCooldowns: readPixelCooldowns(db),
    reports: readJsonRows(db, "reports"),
  });

  return {
    state,
    version,
  };
}

function writeStatePayloadToDatabase(db, payload) {
  const state = sanitizeSocialState(payload.state);
  const version = Number(payload.version) || Date.now();

  runTransaction(db, () => {
    clearStateTables(db);
    setMetaValue(db, "version", String(version));
    setMetaValue(db, "activeUserId", state.activeUserId);
    setMetaJson(db, "savedPostIds", state.savedPostIds);
    setMetaJson(db, "pinnedPostIds", state.pinnedPostIds);
    setMetaJson(db, "hiddenPostIds", state.hiddenPostIds);
    setMetaJson(db, "hiddenCommentIds", state.hiddenCommentIds);

    insertJsonRows(db, "site_sections", state.siteSections, (section) => ({ id: section.id }));
    insertJsonRows(db, "users", state.users, (user) => ({ id: user.id }));
    insertJsonRows(db, "walls", state.walls, (wall) => ({
      id: wall.id,
      owner_id: wall.ownerId ?? null,
      site_section_id: wall.siteSectionId,
    }));
    insertJsonRows(db, "posts", state.posts, (post) => ({
      id: post.id,
      wall_id: post.wallId,
      author_id: post.authorId,
      created_at: Number(post.createdAt) || 0,
    }));
    insertJsonRows(db, "comments", state.comments, (comment) => ({
      id: comment.id,
      post_id: comment.postId,
      author_id: comment.authorId,
      created_at: Number(comment.createdAt) || 0,
    }));
    insertJsonRows(db, "post_connections", state.postConnections, (connection) => ({
      id: connection.id,
      from_post_id: connection.fromPostId,
      to_post_id: connection.toPostId,
      author_id: connection.authorId,
      created_at: Number(connection.createdAt) || 0,
    }));
    insertJsonRows(db, "follows", state.follows, (follow) => ({
      id: follow.id,
      user_id: follow.userId,
      target_id: follow.targetId,
      target_type: follow.targetType,
      created_at: Number(follow.createdAt) || 0,
    }));
    insertJsonRows(db, "notifications", state.notifications, (notification) => ({
      id: notification.id,
      recipient_id: notification.recipientId,
      actor_id: notification.actorId,
      created_at: Number(notification.createdAt) || 0,
    }));
    insertJsonRows(db, "pixel_cells", state.pixelCells, (cell) => ({
      cell_key: `${cell.x}:${cell.y}`,
      x: cell.x,
      y: cell.y,
      updated_at: Number(cell.updatedAt) || 0,
    }));
    insertJsonRows(db, "reports", state.reports, (report) => ({
      id: report.id,
      created_at: Number(report.createdAt) || 0,
    }));

    insertUtilityPositions(db, state.utilityPositions);
    insertScopedLists(db, "savedPostIdsByUser", state.savedPostIdsByUser);
    insertScopedLists(db, "pinnedPostIdsByUser", state.pinnedPostIdsByUser);
    insertScopedLists(db, "hiddenPostIdsByUser", state.hiddenPostIdsByUser);
    insertScopedLists(db, "hiddenCommentIdsByUser", state.hiddenCommentIdsByUser);
    insertPixelCooldowns(db, state.pixelCooldowns);
  });

  return {
    state,
    version,
  };
}

const directActionTypes = new Set([
  "post.create",
  "post.move",
  "post.react",
  "post.repost",
  "post.update",
  "post.view",
  "post.save.toggle",
  "comment.create",
  "comment.react",
  "comment.update",
  "checklist.toggle",
  "connection.create",
  "connection.delete",
  "poll.vote",
  "follow.toggle",
  "wall.create",
  "wall.update",
  "pixel.paint",
]);

function applyDirectSocialStateAction(db, action) {
  if (!directActionTypes.has(action?.type)) return null;

  const current = readStatePayloadFromDatabase(db);
  const nextState = applySocialStateAction(current.state, action);
  const version = Date.now();
  const actorId = normalizeActionId(action.actorId);
  const currentCommentIds = new Set(current.state.comments.map((comment) => comment.id));
  const currentConnectionIds = new Set(current.state.postConnections.map((connection) => connection.id));
  const currentNotificationIds = new Set(current.state.notifications.map((notification) => notification.id));
  const currentPostIds = new Set(current.state.posts.map((post) => post.id));
  const currentWallIds = new Set(current.state.walls.map((wall) => wall.id));

  runTransaction(db, () => {
    setMetaValue(db, "version", String(version));
    upsertActorUserRow(db, nextState, actorId);

    switch (action.type) {
      case "post.create":
      case "post.repost":
        insertNewWallRows(db, nextState, currentWallIds);
        insertNewPostRows(db, nextState, currentPostIds);
        break;
      case "post.move":
      case "post.react":
      case "post.view":
      case "post.update":
      case "checklist.toggle":
      case "poll.vote":
        upsertChangedPostRow(db, nextState, normalizeActionId(action.postId));
        break;
      case "post.save.toggle":
        upsertChangedPostRow(db, nextState, normalizeActionId(action.postId));
        upsertScopedListRow(db, "savedPostIdsByUser", actorId, nextState.savedPostIdsByUser?.[actorId] ?? []);
        setMetaJson(db, "savedPostIds", nextState.savedPostIds);
        break;
      case "comment.react":
        upsertChangedCommentRow(db, nextState, normalizeActionId(action.commentId));
        break;
      case "comment.create":
        insertNewCommentRows(db, nextState, currentCommentIds);
        break;
      case "comment.update":
        upsertChangedCommentRow(db, nextState, normalizeActionId(action.commentId));
        break;
      case "connection.create":
        insertNewConnectionRows(db, nextState, currentConnectionIds);
        break;
      case "connection.delete":
        deleteConnectionRow(db, normalizeActionId(action.connectionId));
        break;
      case "follow.toggle":
        syncFollowRowForAction(db, nextState, actorId, action);
        break;
      case "wall.create":
        insertNewWallRows(db, nextState, currentWallIds);
        break;
      case "wall.update":
        upsertChangedWallRow(db, nextState, normalizeActionId(action.wallId));
        break;
      case "pixel.paint":
        syncPixelPaintRows(db, nextState, actorId, action);
        break;
      default:
        break;
    }

    insertNewNotificationRows(db, nextState, currentNotificationIds);
  });

  return {
    state: nextState,
    version,
  };
}

function insertNewWallRows(db, state, currentWallIds) {
  const newWalls = state.walls.filter((wall) => !currentWallIds.has(wall.id));
  if (newWalls.length === 0) return;
  let sortOrder = getFrontSortOrder(db, "walls") - newWalls.length + 1;
  for (const wall of newWalls) {
    upsertWallRow(db, wall, sortOrder);
    sortOrder += 1;
  }
}

function upsertChangedWallRow(db, state, wallId) {
  if (!wallId) return;
  const wall = state.walls.find((item) => item.id === wallId);
  if (!wall) return;
  const existing = db.prepare("SELECT sort_order FROM walls WHERE id = ?").get(wall.id);
  upsertWallRow(db, wall, Number.isFinite(Number(existing?.sort_order)) ? Number(existing.sort_order) : getBackSortOrder(db, "walls"));
}

function upsertWallRow(db, wall, sortOrder) {
  upsertJsonRow(db, {
    tableName: "walls",
    idColumn: "id",
    id: wall.id,
    item: wall,
    columns: {
      owner_id: wall.ownerId ?? null,
      site_section_id: wall.siteSectionId,
    },
    fallbackSortOrder: sortOrder,
  });
}

function upsertActorUserRow(db, state, actorId) {
  const user = state.users.find((item) => item.id === actorId);
  if (!user) return;
  upsertJsonRow(db, {
    tableName: "users",
    idColumn: "id",
    id: user.id,
    item: user,
    columns: {},
    fallbackSortOrder: getFrontSortOrder(db, "users"),
  });
}

function insertNewPostRows(db, state, currentPostIds) {
  const newPosts = state.posts.filter((post) => !currentPostIds.has(post.id));
  if (newPosts.length === 0) return;
  let sortOrder = getFrontSortOrder(db, "posts") - newPosts.length + 1;
  for (const post of newPosts) {
    upsertPostRow(db, post, sortOrder);
    sortOrder += 1;
  }
}

function upsertChangedPostRow(db, state, postId) {
  if (!postId) return;
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return;
  const existing = db.prepare("SELECT sort_order FROM posts WHERE id = ?").get(post.id);
  upsertPostRow(db, post, Number.isFinite(Number(existing?.sort_order)) ? Number(existing.sort_order) : getBackSortOrder(db, "posts"));
}

function upsertPostRow(db, post, sortOrder) {
  upsertJsonRow(db, {
    tableName: "posts",
    idColumn: "id",
    id: post.id,
    item: post,
    columns: {
      wall_id: post.wallId,
      author_id: post.authorId,
      created_at: Number(post.createdAt) || 0,
    },
    fallbackSortOrder: sortOrder,
  });
}

function insertNewCommentRows(db, state, currentCommentIds) {
  const newComments = state.comments.filter((comment) => !currentCommentIds.has(comment.id));
  if (newComments.length === 0) return;
  let sortOrder = getBackSortOrder(db, "comments");
  for (const comment of newComments) {
    upsertCommentRow(db, comment, sortOrder);
    sortOrder += 1;
  }
}

function upsertChangedCommentRow(db, state, commentId) {
  if (!commentId) return;
  const comment = state.comments.find((item) => item.id === commentId);
  if (!comment) return;
  const existing = db.prepare("SELECT sort_order FROM comments WHERE id = ?").get(comment.id);
  upsertCommentRow(db, comment, Number.isFinite(Number(existing?.sort_order)) ? Number(existing.sort_order) : getBackSortOrder(db, "comments"));
}

function upsertCommentRow(db, comment, sortOrder) {
  upsertJsonRow(db, {
    tableName: "comments",
    idColumn: "id",
    id: comment.id,
    item: comment,
    columns: {
      post_id: comment.postId,
      author_id: comment.authorId,
      created_at: Number(comment.createdAt) || 0,
    },
    fallbackSortOrder: sortOrder,
  });
}

function insertNewConnectionRows(db, state, currentConnectionIds) {
  const newConnections = state.postConnections.filter((connection) => !currentConnectionIds.has(connection.id));
  if (newConnections.length === 0) return;
  let sortOrder = getFrontSortOrder(db, "post_connections") - newConnections.length + 1;
  for (const connection of newConnections) {
    upsertJsonRow(db, {
      tableName: "post_connections",
      idColumn: "id",
      id: connection.id,
      item: connection,
      columns: {
        from_post_id: connection.fromPostId,
        to_post_id: connection.toPostId,
        author_id: connection.authorId,
        created_at: Number(connection.createdAt) || 0,
      },
      fallbackSortOrder: sortOrder,
    });
    sortOrder += 1;
  }
}

function deleteConnectionRow(db, connectionId) {
  if (!connectionId) return;
  db.prepare("DELETE FROM post_connections WHERE id = ?").run(connectionId);
}

function syncFollowRowForAction(db, state, actorId, action) {
  const targetType = action.targetType === "wall" ? "wall" : "user";
  const targetId = normalizeActionId(action.targetId);
  if (!targetId) return;

  db.prepare("DELETE FROM follows WHERE user_id = ? AND target_type = ? AND target_id = ?").run(actorId, targetType, targetId);
  const follow = state.follows.find((item) => item.userId === actorId && item.targetType === targetType && item.targetId === targetId);
  if (!follow) return;

  upsertJsonRow(db, {
    tableName: "follows",
    idColumn: "id",
    id: follow.id,
    item: follow,
    columns: {
      user_id: follow.userId,
      target_id: follow.targetId,
      target_type: follow.targetType,
      created_at: Number(follow.createdAt) || 0,
    },
    fallbackSortOrder: getFrontSortOrder(db, "follows"),
  });
}

function syncPixelPaintRows(db, state, actorId, action) {
  const x = Math.round(Number(action.x));
  const y = Math.round(Number(action.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  const clampedX = Math.max(0, Math.min(pixelColumns - 1, x));
  const clampedY = Math.max(0, Math.min(pixelRows - 1, y));
  const cell = state.pixelCells.find((item) => item.x === clampedX && item.y === clampedY);
  if (cell) {
    upsertJsonRow(db, {
      tableName: "pixel_cells",
      idColumn: "cell_key",
      id: `${cell.x}:${cell.y}`,
      item: cell,
      columns: {
        x: cell.x,
        y: cell.y,
        updated_at: Number(cell.updatedAt) || 0,
      },
      fallbackSortOrder: getBackSortOrder(db, "pixel_cells"),
    });
  }

  const cooldown = Number(state.pixelCooldowns?.[actorId]) || 0;
  if (cooldown > 0) {
    db.prepare("INSERT INTO pixel_cooldowns (user_id, timestamp) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET timestamp = excluded.timestamp")
      .run(actorId, cooldown);
  }
}

function upsertScopedListRow(db, kind, userId, ids) {
  const normalizedIds = Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  if (normalizedIds.length === 0) {
    db.prepare("DELETE FROM user_scoped_lists WHERE kind = ? AND user_id = ?").run(kind, userId);
    return;
  }

  db.prepare("INSERT INTO user_scoped_lists (kind, user_id, ids) VALUES (?, ?, ?) ON CONFLICT(kind, user_id) DO UPDATE SET ids = excluded.ids")
    .run(kind, userId, JSON.stringify(normalizedIds));
}

function insertNewNotificationRows(db, state, currentNotificationIds) {
  const notifications = state.notifications.filter((notification) => !currentNotificationIds.has(notification.id));
  if (notifications.length === 0) return;

  const frontSortOrder = getFrontSortOrder(db, "notifications");
  notifications.forEach((notification, index) => {
    upsertJsonRow(db, {
      tableName: "notifications",
      idColumn: "id",
      id: notification.id,
      item: notification,
      columns: {
        recipient_id: notification.recipientId,
        actor_id: notification.actorId,
        created_at: Number(notification.createdAt) || 0,
      },
      fallbackSortOrder: frontSortOrder - notifications.length + index + 1,
    });
  });
}

function upsertJsonRow(db, { tableName, idColumn, id, item, columns, fallbackSortOrder }) {
  const existing = db.prepare(`SELECT sort_order FROM ${tableName} WHERE ${idColumn} = ?`).get(id);
  const sortOrder = Number.isFinite(Number(existing?.sort_order)) ? Number(existing.sort_order) : fallbackSortOrder;
  const columnNames = Object.keys(columns);
  const updateColumns = ["sort_order = excluded.sort_order", "data = excluded.data", ...columnNames.map((name) => `${name} = excluded.${name}`)];
  const placeholders = ["?", "?", "?", ...columnNames.map(() => "?")].join(", ");

  db.prepare(
    `INSERT INTO ${tableName} (${idColumn}, sort_order, data${columnNames.length ? `, ${columnNames.join(", ")}` : ""})
     VALUES (${placeholders})
     ON CONFLICT(${idColumn}) DO UPDATE SET ${updateColumns.join(", ")}`,
  ).run(id, sortOrder, JSON.stringify(item), ...Object.values(columns));
}

function getFrontSortOrder(db, tableName) {
  const row = db.prepare(`SELECT MIN(sort_order) AS sort_order FROM ${tableName}`).get();
  return Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) - 1 : 0;
}

function getBackSortOrder(db, tableName) {
  const row = db.prepare(`SELECT MAX(sort_order) AS sort_order FROM ${tableName}`).get();
  return Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) + 1 : 0;
}

function runTransaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Keep the original error.
    }
    throw error;
  }
}

function clearStateTables(db) {
  for (const table of [
    "site_sections",
    "users",
    "walls",
    "posts",
    "comments",
    "post_connections",
    "follows",
    "notifications",
    "pixel_cells",
    "reports",
    "utility_positions",
    "user_scoped_lists",
    "pixel_cooldowns",
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

function readJsonRows(db, tableName) {
  return db.prepare(`SELECT data FROM ${tableName} ORDER BY sort_order ASC`).all()
    .flatMap((row) => parseJsonValue(row.data, null) ?? []);
}

function insertJsonRows(db, tableName, items, getColumns) {
  if (!items.length) return;
  const columns = Object.keys(getColumns(items[0]));
  const placeholders = ["?", "?", ...columns.map(() => "?")].join(", ");
  const statement = db.prepare(
    `INSERT INTO ${tableName} (sort_order, data, ${columns.join(", ")}) VALUES (${placeholders})`,
  );

  items.forEach((item, index) => {
    const values = Object.values(getColumns(item));
    statement.run(index, JSON.stringify(item), ...values);
  });
}

function readUtilityPositions(db) {
  return Object.fromEntries(
    db.prepare("SELECT id, data FROM utility_positions").all()
      .map((row) => [row.id, parseJsonValue(row.data, null)])
      .filter(([, position]) => Boolean(position)),
  );
}

function insertUtilityPositions(db, positions) {
  const statement = db.prepare("INSERT INTO utility_positions (id, x, y, data) VALUES (?, ?, ?, ?)");
  for (const [id, position] of Object.entries(positions ?? {})) {
    statement.run(id, position.x, position.y, JSON.stringify(position));
  }
}

function readScopedLists(db, kind) {
  return Object.fromEntries(
    db.prepare("SELECT user_id, ids FROM user_scoped_lists WHERE kind = ?").all(kind)
      .map((row) => [row.user_id, parseJsonValue(row.ids, [])])
      .filter(([, ids]) => Array.isArray(ids)),
  );
}

function insertScopedLists(db, kind, scopedLists) {
  const statement = db.prepare("INSERT INTO user_scoped_lists (kind, user_id, ids) VALUES (?, ?, ?)");
  for (const [userId, ids] of Object.entries(scopedLists ?? {})) {
    if (!Array.isArray(ids)) continue;
    statement.run(kind, userId, JSON.stringify(ids));
  }
}

function readPixelCooldowns(db) {
  return Object.fromEntries(
    db.prepare("SELECT user_id, timestamp FROM pixel_cooldowns").all()
      .map((row) => [row.user_id, Number(row.timestamp) || 0]),
  );
}

function insertPixelCooldowns(db, cooldowns) {
  const statement = db.prepare("INSERT INTO pixel_cooldowns (user_id, timestamp) VALUES (?, ?)");
  for (const [userId, timestamp] of Object.entries(cooldowns ?? {})) {
    statement.run(userId, Number(timestamp) || 0);
  }
}

function readMetaValue(db, key) {
  const row = db.prepare("SELECT value FROM state_meta WHERE key = ?").get(key);
  return typeof row?.value === "string" ? row.value : undefined;
}

function setMetaValue(db, key, value) {
  db.prepare("INSERT INTO state_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

function readMetaJson(db, key, fallback) {
  return parseJsonValue(readMetaValue(db, key), fallback);
}

function setMetaJson(db, key, value) {
  setMetaValue(db, key, JSON.stringify(value));
}

function parseJsonValue(value, fallback) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function backupCurrentDatabaseState(db, dataDir) {
  if (!hasDatabaseState(db)) return;

  try {
    const backupDir = join(dataDir, "backups");
    const payload = readStatePayloadFromDatabase(db);
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, `social-state.${Date.now()}.json`), JSON.stringify(payload, null, 2), "utf8");
    await pruneStateBackups(backupDir);
  } catch {
    // Backups are safety net only; they must not block the main write.
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
  const fallbackUserId = userIds.has(state?.activeUserId) ? state.activeUserId : "guest";
  const savedPostIds = normalizeIdList(state?.savedPostIds, postIds);
  const pinnedPostIds = normalizeIdList(state?.pinnedPostIds, postIds);
  const hiddenPostIds = normalizeIdList(state?.hiddenPostIds, postIds);
  const hiddenCommentIds = normalizeIdList(state?.hiddenCommentIds, new Set(comments.map((comment) => comment.id)));

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
    follows: normalizeFollows(state?.follows, fallback.follows, userIds, wallIds, fallbackUserId),
    savedPostIdsByUser: normalizeUserScopedIdLists(state?.savedPostIdsByUser, savedPostIds, postIds, userIds, fallbackUserId),
    pinnedPostIdsByUser: normalizeUserScopedIdLists(state?.pinnedPostIdsByUser, pinnedPostIds, postIds, userIds, fallbackUserId),
    hiddenPostIdsByUser: normalizeUserScopedIdLists(state?.hiddenPostIdsByUser, hiddenPostIds, postIds, userIds, fallbackUserId),
    hiddenCommentIdsByUser: normalizeUserScopedIdLists(state?.hiddenCommentIdsByUser, hiddenCommentIds, new Set(comments.map((comment) => comment.id)), userIds, fallbackUserId),
    savedPostIds,
    pinnedPostIds,
    hiddenPostIds,
    hiddenCommentIds,
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

function normalizeFollows(value, fallback, userIds, wallIds, fallbackUserId) {
  const follows = Array.isArray(value) ? value : fallback;
  const seen = new Set();

  return follows.flatMap((follow) => {
    const targetType = follow?.targetType === "wall" ? "wall" : "user";
    const targetId = typeof follow?.targetId === "string" ? follow.targetId : "";
    if (targetType === "user" ? !userIds.has(targetId) : !wallIds.has(targetId)) return [];

    const userId = typeof follow?.userId === "string" && userIds.has(follow.userId) ? follow.userId : fallbackUserId;
    const key = `${userId}:${targetType}:${targetId}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      id: typeof follow?.id === "string" && follow.id ? follow.id : randomUUID(),
      userId,
      targetId,
      targetType,
      createdAt: Number(follow?.createdAt) || Date.now(),
    }];
  });
}

function normalizeUserScopedIdLists(value, legacyIds, allowedIds, userIds, fallbackUserId) {
  const scoped = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [userId, ids] of Object.entries(value)) {
      if (!userIds.has(userId) || !Array.isArray(ids)) continue;
      const normalizedIds = Array.from(new Set(ids.filter((id) => typeof id === "string" && allowedIds.has(id))));
      if (normalizedIds.length > 0) scoped[userId] = normalizedIds;
    }
  }

  if (Object.keys(scoped).length === 0 && legacyIds.length > 0) {
    scoped[fallbackUserId] = Array.from(new Set(legacyIds));
  }

  return scoped;
}

function toggleUserScopedId(scoped, userId, itemId) {
  const currentIds = Array.isArray(scoped?.[userId]) ? scoped[userId] : [];
  const nextIds = currentIds.includes(itemId)
    ? currentIds.filter((id) => id !== itemId)
    : [itemId, ...currentIds];

  return {
    ...(scoped && typeof scoped === "object" && !Array.isArray(scoped) ? scoped : {}),
    [userId]: nextIds,
  };
}

function removeIdsFromUserScopedIdLists(scoped, idsToRemove) {
  if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) return {};
  return Object.fromEntries(
    Object.entries(scoped)
      .map(([userId, ids]) => [
        userId,
        Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && !idsToRemove.has(id)) : [],
      ])
      .filter(([, ids]) => ids.length > 0),
  );
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
