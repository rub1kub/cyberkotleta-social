import { initialState } from "./data";
import type {
  Comment,
  ChecklistItem,
  Follow,
  NotificationItem,
  PixelCell,
  Post,
  PostAppearance,
  PostConnection,
  PostInteractionSettings,
  PostKind,
  PostPoll,
  Report,
  SketchStroke,
  SocialState,
  Theme,
  UserProfile,
  Wall,
  WallActionButton,
} from "./types";

export const socialStateStorageKey = "kotleta.social.v6";
const stateKey = socialStateStorageKey;
const legacyStateKeys = ["kotleta.social.v5"];
const themeKey = "kotleta.theme.v1";
const pixelColumns = 300;
const pixelRows = 190;
const maxPixelCells = pixelColumns * pixelRows;
const minecraftWallId = "space:minecraft";
const minecraftDownloadPostId = "minecraft-download-post";
const minecraftDownloadObjectId = "minecraft:download-card";
const postKinds = new Set<PostKind>(["note", "media", "sketch", "idea", "list", "question", "poll", "checklist", "link", "signal"]);
const postBackgrounds = new Set<PostAppearance["background"]>(["plain", "soft", "glass", "gradient", "paper"]);
const postShapes = new Set<PostAppearance["shape"]>(["soft", "round", "sharp", "ticket"]);
const postSizes = new Set<PostAppearance["size"]>(["compact", "normal", "wide", "tall"]);
const sketchPalette = new Set(["#111318", "#f6f8f7", "#21e69a", "#0f9f68", "#6c7685", "#5c6cff", "#d93862", "#f2c94c"]);

export function readSocialState(): SocialState {
  const raw = localStorage.getItem(stateKey) ?? readLegacyState();
  if (!raw) return initialState;

  try {
    const parsed = JSON.parse(raw) as SocialState;
    if (
      !Array.isArray(parsed.siteSections) ||
      !Array.isArray(parsed.users) ||
      !Array.isArray(parsed.walls) ||
      !Array.isArray(parsed.posts) ||
      typeof parsed.activeUserId !== "string"
    ) {
      return initialState;
    }
    return sanitizeSocialState(parsed);
  } catch {
    return initialState;
  }
}

export function writeSocialState(state: SocialState): void {
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
  } catch {
    // Media previews can exceed localStorage. The UI still works for the current session.
  }
}

export function readTheme(): Theme {
  return localStorage.getItem(themeKey) === "dark" ? "dark" : "light";
}

export function writeTheme(theme: Theme): void {
  localStorage.setItem(themeKey, theme);
}

export function sanitizeSocialState(state: SocialState): SocialState {
  const siteSectionIds = new Set(initialState.siteSections.map((section) => section.id));
  const users = (state.users.length > 0 ? state.users : initialState.users).map(normalizeUser);
  const userIds = new Set(users.map((user) => user.id));
  const walls = state.walls.filter(
    (wall) =>
      siteSectionIds.has(wall.siteSectionId) ||
      wall.siteSectionId === "space" ||
      wall.siteSectionId.startsWith("profile:"),
  ).map(normalizeWall);
  const normalizedWalls = ensureRequiredWalls(walls.length > 0 ? walls : initialState.walls);
  const wallIds = new Set(normalizedWalls.map((wall) => wall.id));
  const posts = ensureMinecraftDownloadPost(state.posts
    .filter((post) => wallIds.has(post.wallId) && userIds.has(post.authorId))
    .map(normalizePost), state.utilityPositions, userIds);
  const postIds = new Set(posts.map((post) => post.id));
  const comments = normalizeArray<Comment>(state.comments)
    .filter((comment) => postIds.has(comment.postId) && userIds.has(comment.authorId))
    .map(normalizeComment);
  const commentIds = new Set(comments.map((comment) => comment.id));
  const postConnections = normalizeArray<PostConnection>(state.postConnections)
    .map((connection) => normalizePostConnection(connection, postIds, userIds))
    .filter(Boolean) as PostConnection[];
  const fallbackUserId = userIds.has(state.activeUserId) ? state.activeUserId : users[0].id;
  const follows = normalizeArray<Follow>(state.follows)
    .flatMap((follow) => normalizeFollow(follow, userIds, wallIds, fallbackUserId));
  const savedPostIds = normalizeStringArray(state.savedPostIds).filter((postId) => postIds.has(postId));
  const pinnedPostIds = normalizeStringArray(state.pinnedPostIds).filter((postId) => postIds.has(postId));
  const hiddenPostIds = normalizeStringArray(state.hiddenPostIds).filter((postId) => postIds.has(postId));
  const hiddenCommentIds = normalizeStringArray(state.hiddenCommentIds).filter((commentId) => commentIds.has(commentId));
  const savedPostIdsByUser = normalizeUserScopedIdLists(state.savedPostIdsByUser, savedPostIds, postIds, userIds, fallbackUserId);
  const pinnedPostIdsByUser = normalizeUserScopedIdLists(state.pinnedPostIdsByUser, pinnedPostIds, postIds, userIds, fallbackUserId);
  const hiddenPostIdsByUser = normalizeUserScopedIdLists(state.hiddenPostIdsByUser, hiddenPostIds, postIds, userIds, fallbackUserId);
  const hiddenCommentIdsByUser = normalizeUserScopedIdLists(state.hiddenCommentIdsByUser, hiddenCommentIds, commentIds, userIds, fallbackUserId);
  const pixelCells = normalizeArray<PixelCell>(state.pixelCells)
    .map(normalizePixelCell)
    .filter(Boolean)
    .slice(-maxPixelCells) as PixelCell[];
  const pixelCooldowns = normalizePixelCooldowns(state.pixelCooldowns, userIds);
  const notifications = normalizeArray<NotificationItem>(state.notifications)
    .filter((item) => userIds.has(item.recipientId) && userIds.has(item.actorId))
    .map((item) => ({
      ...item,
      createdAt: Number(item.createdAt) || Date.now(),
      readAt: item.readAt ? Number(item.readAt) : undefined,
    }));
  const reports = normalizeArray<Report>(state.reports)
    .filter((report) => report.postId ? postIds.has(report.postId) : Boolean(report.commentId && commentIds.has(report.commentId)))
    .map((report) => ({ ...report, createdAt: Number(report.createdAt) || Date.now() }));

  return {
    ...state,
    siteSections: initialState.siteSections,
    users,
    activeUserId: userIds.has(state.activeUserId) ? state.activeUserId : users[0].id,
    walls: normalizedWalls,
    posts,
    comments,
    utilityPositions: {
      ...normalizeUtilityPositions(initialState.utilityPositions),
      ...normalizeUtilityPositions(state.utilityPositions),
    },
    postConnections,
    follows,
    savedPostIdsByUser,
    pinnedPostIdsByUser,
    hiddenPostIdsByUser,
    hiddenCommentIdsByUser,
    savedPostIds,
    pinnedPostIds,
    hiddenPostIds,
    hiddenCommentIds,
    notifications,
    pixelCells,
    pixelCooldowns,
    reports,
  };
}

function readLegacyState(): string | null {
  for (const key of legacyStateKeys) {
    const raw = localStorage.getItem(key);
    if (raw) return raw;
  }
  return null;
}

function normalizeUser(user: UserProfile): UserProfile {
  const lastSeenAt = Number(user.lastSeenAt);
  return {
    ...user,
    bio: replaceDeprecatedDemoCopy(typeof user.bio === "string" ? user.bio : ""),
    status: typeof user.status === "string" && user.status.trim() && user.status.trim() !== "Онлайн"
      ? user.status.trim().slice(0, 40)
      : undefined,
    lastSeenAt: Number.isFinite(lastSeenAt) && lastSeenAt > 0 ? lastSeenAt : undefined,
  };
}

function ensureMinecraftDownloadPost(
  posts: Post[],
  utilityPositions: SocialState["utilityPositions"],
  userIds: Set<string>,
): Post[] {
  const existing = posts.find((post) => post.id === minecraftDownloadPostId);
  const position = normalizePostPosition(utilityPositions?.[minecraftDownloadObjectId]) ?? { x: 274, y: 44 };
  const authorId = userIds.has("rub1kub") ? "rub1kub" : "guest";

  if (existing) {
    return posts.map((post) =>
      post.id === minecraftDownloadPostId
        ? normalizePost({
            ...post,
            wallId: minecraftWallId,
            authorId: userIds.has(post.authorId) ? post.authorId : authorId,
            text: "мод пак для игры на WhiteShield",
            position: post.position ?? position,
          })
        : post,
    );
  }

  return [
    normalizePost({
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
    }),
    ...posts,
  ];
}

function normalizeWall(wall: Wall): Wall {
  return {
    ...wall,
    ownerId: typeof wall.ownerId === "string" ? wall.ownerId : undefined,
    description: replaceDeprecatedDemoCopy(typeof wall.description === "string" ? wall.description : ""),
    rules: typeof wall.rules === "string" ? wall.rules : "",
    avatarUrl: normalizeOptionalUrl(wall.avatarUrl),
    bannerUrl: normalizeOptionalUrl(wall.bannerUrl),
    coverUrl: typeof wall.coverUrl === "string" ? wall.coverUrl : undefined,
    avatarFocus: normalizeMediaFocus(wall.avatarFocus),
    bannerFocus: normalizeMediaFocus(wall.bannerFocus),
    accentColor: normalizeWallAccentColor(wall.accentColor),
    actionButtons: normalizeArray<WallActionButton>(wall.actionButtons)
      .map(normalizeWallActionButton)
      .filter(Boolean)
      .slice(0, 4) as WallActionButton[],
    privacyMode: normalizeWallPrivacyMode(wall.privacyMode),
    invite: normalizeWallInvite(wall.invite),
    publishMode: wall.publishMode === "owner" ? "owner" : "open",
  };
}

function ensureRequiredWalls(walls: Wall[]): Wall[] {
  const existingIds = new Set(walls.map((wall) => wall.id));
  const requiredWalls = initialState.walls.filter((wall) => wall.siteSectionId === "space" && !existingIds.has(wall.id));
  return requiredWalls.length > 0 ? [...walls, ...requiredWalls] : walls;
}

function normalizeOptionalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("/media/")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}

function normalizeWallAccentColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return ["green", "yellow", "blue", "pink", "violet", "mono"].includes(trimmed) ? trimmed : undefined;
}

function normalizeWallPrivacyMode(value: unknown): Wall["privacyMode"] {
  return value === "link" || value === "invite" ? value : "public";
}

function normalizeWallInvite(value: unknown): Wall["invite"] {
  if (!value || typeof value !== "object") return undefined;
  const invite = value as Wall["invite"];
  if (!invite?.code || typeof invite.code !== "string") return undefined;

  return {
    code: invite.code.trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    expiresAt: Number.isFinite(Number(invite.expiresAt)) && Number(invite.expiresAt) > 0 ? Number(invite.expiresAt) : undefined,
    maxUses: Number.isFinite(Number(invite.maxUses)) && Number(invite.maxUses) > 0 ? Math.round(Number(invite.maxUses)) : undefined,
    usedBy: Array.from(new Set(Array.isArray(invite.usedBy) ? invite.usedBy.filter((id) => typeof id === "string") : [])).slice(0, 200),
  };
}

function normalizeMediaFocus(value: unknown): Wall["avatarFocus"] {
  if (!value || typeof value !== "object") return undefined;
  const focus = value as Wall["avatarFocus"];
  if (!focus) return undefined;
  const x = Number(focus.x);
  const y = Number(focus.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;

  return {
    x: Math.max(0, Math.min(100, Math.round(x))),
    y: Math.max(0, Math.min(100, Math.round(y))),
  };
}

function normalizeWallActionButton(button: WallActionButton): WallActionButton | null {
  const label = typeof button.label === "string" ? button.label.trim().slice(0, 28) : "";
  const url = typeof button.url === "string" ? button.url.trim() : "";
  if (!label || !/^https?:\/\//i.test(url)) return null;

  return {
    id: typeof button.id === "string" && button.id ? button.id : crypto.randomUUID(),
    label,
    url,
  };
}

function normalizePost(post: Post): Post {
  const uniqueUserIds = Array.isArray(post.views?.uniqueUserIds)
    ? post.views.uniqueUserIds.filter((id) => typeof id === "string")
    : [];

  return {
    ...post,
    kind: normalizePostKind(post.kind),
    text: replaceDeprecatedDemoCopy(normalizePostText(post.text)),
    attachments: Array.isArray(post.attachments) ? post.attachments : [],
    reactions: Math.max(0, Number(post.reactions) || 0),
    views: {
      total: uniqueUserIds.length,
      uniqueUserIds,
    },
    position: normalizePostPosition(post.position),
    appearance: normalizePostAppearance(post.appearance),
    settings: normalizePostSettings(post.settings),
    sketch: normalizeSketchStrokes(post.sketch),
    checklist: normalizeChecklist(post.checklist),
    poll: normalizePostPoll(post.poll),
    repostOfId: typeof post.repostOfId === "string" ? post.repostOfId : undefined,
    editedAt: post.editedAt ? Number(post.editedAt) : undefined,
    createdAt: Number(post.createdAt) || Date.now(),
  };
}

function normalizePostKind(value: unknown): PostKind {
  return typeof value === "string" && postKinds.has(value as PostKind) ? value as PostKind : "note";
}

function normalizePostSettings(value: unknown): PostInteractionSettings {
  const settings = value && typeof value === "object" ? value as Partial<PostInteractionSettings> : {};

  return {
    comments: settings.comments !== false,
    reactions: settings.reactions !== false,
    reposts: settings.reposts !== false,
    saves: settings.saves !== false,
    views: settings.views !== false,
  };
}

function normalizePostAppearance(value: unknown): PostAppearance {
  const appearance = value && typeof value === "object" ? value as Partial<PostAppearance> : {};
  const accentColor = typeof appearance.accentColor === "string"
    ? normalizeWallAccentColor(appearance.accentColor)
    : undefined;

  return {
    accentColor,
    background: postBackgrounds.has(appearance.background as PostAppearance["background"]) ? appearance.background as PostAppearance["background"] : "plain",
    shape: postShapes.has(appearance.shape as PostAppearance["shape"]) ? appearance.shape as PostAppearance["shape"] : "soft",
    size: postSizes.has(appearance.size as PostAppearance["size"]) ? appearance.size as PostAppearance["size"] : "normal",
  };
}

function normalizeSketchStrokes(value: unknown): SketchStroke[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((stroke) => {
    if (!stroke || typeof stroke !== "object") return [];
    const source = stroke as Partial<SketchStroke>;
    const color = typeof source.color === "string" ? source.color.toLowerCase() : "";
    const width = Math.max(1, Math.min(12, Math.round(Number(source.width) || 3)));
    const points = Array.isArray(source.points)
      ? source.points.flatMap((point) => {
          if (!point || typeof point !== "object") return [];
          const x = Number((point as { x?: unknown }).x);
          const y = Number((point as { y?: unknown }).y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
          return [{
            x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)),
            y: Math.max(0, Math.min(100, Math.round(y * 10) / 10)),
          }];
        })
      : [];
    if (!sketchPalette.has(color) || points.length < 2) return [];

    return [{
      id: typeof source.id === "string" && source.id ? source.id : crypto.randomUUID(),
      color,
      width,
      points: points.slice(0, 300),
    }];
  }).slice(0, 80);
}

function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<ChecklistItem>;
    const text = typeof source.text === "string" ? source.text.trim().slice(0, 120) : "";
    if (!text) return [];

    return [{
      id: typeof source.id === "string" && source.id ? source.id : crypto.randomUUID(),
      text,
      checkedBy: Array.from(new Set(Array.isArray(source.checkedBy) ? source.checkedBy.filter((id) => typeof id === "string") : [])).slice(0, 500),
    }];
  }).slice(0, 24);
}

function normalizePostPoll(value: unknown): PostPoll | undefined {
  if (!value || typeof value !== "object") return undefined;
  const poll = value as Partial<PostPoll>;
  const options = Array.isArray(poll.options)
    ? poll.options.flatMap((option) => {
        if (!option || typeof option !== "object") return [];
        const text = typeof option.text === "string" ? option.text.trim().slice(0, 90) : "";
        if (!text) return [];

        return [{
          id: typeof option.id === "string" && option.id ? option.id : crypto.randomUUID(),
          text,
          voterIds: Array.from(new Set(Array.isArray(option.voterIds) ? option.voterIds.filter((id) => typeof id === "string") : [])).slice(0, 500),
        }];
      })
    : [];

  if (options.length < 2) return undefined;

  return {
    question: typeof poll.question === "string" && poll.question.trim() ? poll.question.trim().slice(0, 160) : "Голосование",
    multi: poll.multi === true,
    options: options.slice(0, 8),
  };
}

function normalizePostConnection(
  connection: PostConnection,
  postIds: Set<string>,
  userIds: Set<string>,
): PostConnection | null {
  const fromPostId = typeof connection.fromPostId === "string" ? connection.fromPostId : "";
  const toPostId = typeof connection.toPostId === "string" ? connection.toPostId : "";
  if (!postIds.has(fromPostId) || !postIds.has(toPostId) || fromPostId === toPostId) return null;

  return {
    id: typeof connection.id === "string" && connection.id ? connection.id : crypto.randomUUID(),
    fromPostId,
    toPostId,
    authorId: userIds.has(connection.authorId) ? connection.authorId : "guest",
    label: typeof connection.label === "string" && connection.label.trim()
      ? connection.label.trim().slice(0, 28)
      : undefined,
    createdAt: Number(connection.createdAt) || Date.now(),
  };
}

function normalizePostPosition(value: unknown): Post["position"] {
  if (!value || typeof value !== "object") return undefined;
  const position = value as Post["position"];
  if (!position) return undefined;

  const x = Number(position.x);
  const y = Number(position.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;

  return {
    x: Math.max(0, Math.min(9999, Math.round(x))),
    y: Math.max(0, Math.min(9999, Math.round(y))),
  };
}

function normalizeUtilityPositions(value: unknown): Record<string, NonNullable<Post["position"]>> {
  const positions = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return Object.fromEntries(
    Object.entries(positions)
      .filter(([id]) => typeof id === "string" && id.length > 0 && id.length <= 96)
      .map(([id, position]) => [id, normalizePostPosition(position)])
      .filter((entry): entry is [string, NonNullable<Post["position"]>] => Boolean(entry[1])),
  );
}

function normalizePixelCell(cell: PixelCell): PixelCell | null {
  const x = Math.round(Number(cell.x));
  const y = Math.round(Number(cell.y));
  const color = typeof cell.color === "string" ? cell.color : "";
  if (!Number.isFinite(x) || !Number.isFinite(y) || !/^#[0-9a-f]{6}$/i.test(color)) return null;

  return {
    x: Math.max(0, Math.min(pixelColumns - 1, x)),
    y: Math.max(0, Math.min(pixelRows - 1, y)),
    color: color.toLowerCase(),
    authorId: typeof cell.authorId === "string" ? cell.authorId : "",
    updatedAt: Number(cell.updatedAt) || Date.now(),
  };
}

function normalizePixelCooldowns(value: unknown, userIds: Set<string>): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([userId]) => userIds.has(userId))
      .map(([userId, timestamp]) => [userId, Number(timestamp) || 0]),
  );
}

function replaceDeprecatedDemoCopy(text: string): string {
  if (text === "Собирает стены и короткие заметки.") return "Ведёт свою доску и делится короткими заметками.";
  if (text === "Собирает стены и сборки.") return "Ведёт свою доску и делится короткими заметками.";
  if (text === "Собирает стены и майн-паки.") return "Ведёт свою доску и делится короткими заметками.";
  if (text === "Пишет короткие посты.") return "Пишет короткие заметки.";
  if (text === "Тестирует моды и сборки.") return "Тестирует идеи и интерфейс.";
  if (text === "Общая стена для коротких постов и быстрых обсуждений.") return "Общая доска для коротких заметок и быстрых обсуждений.";
  if (text === "Тихие записи, мысли и заметки по сборкам.") return "Тихие записи, мысли и заметки.";
  if (text === "Проверил Sodium для сборки.") return "Проверил новый формат заметок.";
  if (text === "Короткий пост в общую.") return "Короткая заметка в общую.";
  if (text === "Пост на стене.") return "Заметка на доске.";
  if (text === "Заметка на стене.") return "Заметка на доске.";
  if (text === "Медиа-пост") return "Заметка";
  if (text === "Пост") return "Заметка";
  if (text === "Котлета ответил на пост") return "Котлета ответил на заметку";
  return text;
}

function normalizeComment(comment: Comment): Comment {
  return {
    ...comment,
    parentId: typeof comment.parentId === "string" ? comment.parentId : undefined,
    text: typeof comment.text === "string" ? comment.text : "",
    attachments: Array.isArray(comment.attachments) ? comment.attachments : [],
    reactions: Math.max(0, Number(comment.reactions) || 0),
    editedAt: comment.editedAt ? Number(comment.editedAt) : undefined,
    createdAt: Number(comment.createdAt) || Date.now(),
  };
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeFollow(
  follow: Follow,
  userIds: Set<string>,
  wallIds: Set<string>,
  fallbackUserId: string,
): Follow[] {
  const userId = typeof follow.userId === "string" && userIds.has(follow.userId) ? follow.userId : fallbackUserId;
  const targetType = follow.targetType === "wall" ? "wall" : "user";
  const targetId = typeof follow.targetId === "string" ? follow.targetId : "";
  if (targetType === "user" ? !userIds.has(targetId) : !wallIds.has(targetId)) return [];

  return [{
    id: typeof follow.id === "string" && follow.id ? follow.id : crypto.randomUUID(),
    userId,
    targetId,
    targetType,
    createdAt: Number(follow.createdAt) || Date.now(),
  }];
}

function normalizeUserScopedIdLists(
  value: unknown,
  legacyIds: string[],
  allowedIds: Set<string>,
  userIds: Set<string>,
  fallbackUserId: string,
): Record<string, string[]> {
  const scoped: Record<string, string[]> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [userId, ids] of Object.entries(value as Record<string, unknown>)) {
      if (!userIds.has(userId) || !Array.isArray(ids)) continue;
      const normalizedIds = Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && allowedIds.has(id))));
      if (normalizedIds.length > 0) scoped[userId] = normalizedIds;
    }
  }

  if (Object.keys(scoped).length === 0 && legacyIds.length > 0) {
    scoped[fallbackUserId] = Array.from(new Set(legacyIds));
  }

  return scoped;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function normalizePostText(text: string): string {
  if (/^Space post \d+$/i.test(text.trim())) return "Заметка на доске.";
  if (/^Профильная стена\b/i.test(text.trim())) return text.replace(/^Профильная стена/i, "Профильная доска");
  return text;
}
