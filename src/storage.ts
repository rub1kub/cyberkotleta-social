import { initialState } from "./data";
import type { Comment, Follow, NotificationItem, PixelCell, Post, Report, SocialState, Theme, UserProfile, Wall, WallActionButton } from "./types";

export const socialStateStorageKey = "kotleta.social.v6";
const stateKey = socialStateStorageKey;
const legacyStateKeys = ["kotleta.social.v5"];
const themeKey = "kotleta.theme.v1";
const pixelColumns = 300;
const pixelRows = 190;
const maxPixelCells = pixelColumns * pixelRows;

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
  const normalizedWalls = walls.length > 0 ? walls : initialState.walls;
  const wallIds = new Set(normalizedWalls.map((wall) => wall.id));
  const posts = state.posts
    .filter((post) => wallIds.has(post.wallId) && userIds.has(post.authorId))
    .map(normalizePost);
  const postIds = new Set(posts.map((post) => post.id));
  const comments = normalizeArray<Comment>(state.comments)
    .filter((comment) => postIds.has(comment.postId) && userIds.has(comment.authorId))
    .map(normalizeComment);
  const commentIds = new Set(comments.map((comment) => comment.id));
  const follows = normalizeArray<Follow>(state.follows)
    .filter((follow) => follow.targetType === "user" ? userIds.has(follow.targetId) : wallIds.has(follow.targetId))
    .map((follow) => ({ ...follow, createdAt: Number(follow.createdAt) || Date.now() }));
  const savedPostIds = normalizeStringArray(state.savedPostIds).filter((postId) => postIds.has(postId));
  const pinnedPostIds = normalizeStringArray(state.pinnedPostIds).filter((postId) => postIds.has(postId));
  const hiddenPostIds = normalizeStringArray(state.hiddenPostIds).filter((postId) => postIds.has(postId));
  const hiddenCommentIds = normalizeStringArray(state.hiddenCommentIds).filter((commentId) => commentIds.has(commentId));
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
    follows,
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
  return {
    ...user,
    bio: replaceDeprecatedDemoCopy(typeof user.bio === "string" ? user.bio : ""),
  };
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
    publishMode: wall.publishMode === "owner" ? "owner" : "open",
  };
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
    text: replaceDeprecatedDemoCopy(normalizePostText(post.text)),
    attachments: Array.isArray(post.attachments) ? post.attachments : [],
    reactions: Math.max(0, Number(post.reactions) || 0),
    views: {
      total: uniqueUserIds.length,
      uniqueUserIds,
    },
    position: normalizePostPosition(post.position),
    repostOfId: typeof post.repostOfId === "string" ? post.repostOfId : undefined,
    editedAt: post.editedAt ? Number(post.editedAt) : undefined,
    createdAt: Number(post.createdAt) || Date.now(),
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

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function normalizePostText(text: string): string {
  if (/^Space post \d+$/i.test(text.trim())) return "Заметка на доске.";
  if (/^Профильная стена\b/i.test(text.trim())) return text.replace(/^Профильная стена/i, "Профильная доска");
  return text;
}
