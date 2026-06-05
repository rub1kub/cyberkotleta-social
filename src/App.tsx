import {
  AudioLines,
  ArrowLeft,
  Bell,
  Bookmark,
  Check,
  CirclePlus,
  CornerDownRight,
  Clock,
  Download,
  Eye,
  Flag,
  Flame,
  House,
  Image as ImageIcon,
  Loader2,
  Link2,
  LogIn,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  MoreHorizontal,
  Moon,
  PackagePlus,
  Paintbrush,
  Pencil,
  Pin,
  Repeat2,
  Search,
  Send,
  Settings,
  Sun,
  Trash2,
  Trophy,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import { flushSync } from "react-dom";
import {
  buildDiscordAuthUrl,
  clearServerDiscordSession,
  clearStoredDiscordSession,
  consumeDiscordRedirect,
  discordSessionToProfile,
  readServerDiscordSession,
  readStoredDiscordSession,
} from "./auth";
import type { DiscordSession } from "./auth";
import { createMediaAttachment } from "./mediaUpload";
import { readSharedSocialState, writeSharedSocialState } from "./sharedState";
import { readSocialState, readTheme, socialStateStorageKey, writeSocialState, writeTheme } from "./storage";
import type {
  Comment,
  MediaAttachment,
  MediaFocus,
  MediaKind,
  NotificationItem,
  PixelCell,
  Post,
  PostPosition,
  SocialState,
  Theme,
  UserProfile,
  Wall,
  WallActionButton,
} from "./types";

const timeFormatter = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
const maxFiles = 6;
const cyberKotletaModpackName = "Модпак CyberKotleta";
const cyberKotletaZipPath = "/downloads/cyberkotleta-whiteshield-modpack.zip";
const cyberKotletaMrpackPath = "/downloads/cyberkotleta-whiteshield-modpack.mrpack";
const confettiPieces = 22;
const reactionPieces = 24;
const maxReactionBursts = 2;
const reactionBurstCadenceMs = 90;
const reactionIdleMs = 1120;
const reactionParticleLifetimeMs = 1320;
const socialStateWriteDelayMs = 180;
const sharedStatePollMs = 1300;
const postViewVisibleMs = 720;
const profileWallPrefix = "profile:";
const spaceSectionId = "space";
const guestUserId = "guest";
const boardGridSize = 24;
const boardCardWidth = 318;
const boardCardHeight = 226;
const boardGap = 18;
const defaultMediaFocus: MediaFocus = { x: 50, y: 50 };
const wallAccentOptions = [
  {
    id: "green",
    label: "Зелёный",
    accent: "#21e69a",
    accent2: "#0f9f68",
    soft: "rgba(32, 238, 159, 0.14)",
  },
  {
    id: "yellow",
    label: "Жёлтый",
    accent: "#f2c94c",
    accent2: "#a87300",
    soft: "rgba(242, 201, 76, 0.2)",
  },
  {
    id: "blue",
    label: "Синий",
    accent: "#46a7ff",
    accent2: "#176fbe",
    soft: "rgba(70, 167, 255, 0.16)",
  },
  {
    id: "pink",
    label: "Розовый",
    accent: "#ff5c9a",
    accent2: "#c72d69",
    soft: "rgba(255, 92, 154, 0.16)",
  },
  {
    id: "violet",
    label: "Фиолетовый",
    accent: "#9b7cff",
    accent2: "#6848d8",
    soft: "rgba(155, 124, 255, 0.16)",
  },
  {
    id: "mono",
    label: "Серый",
    accent: "#8a939f",
    accent2: "#5d6673",
    soft: "rgba(138, 147, 159, 0.16)",
  },
] as const;
const pixelSize = 7;
const pixelColumns = 300;
const pixelRows = 190;
const maxPixelCells = pixelColumns * pixelRows;
const pixelCooldownMs = 1000;
const pixelSyncChannelName = "kotleta.pixel.v1";
const pixelPalette = ["#111318", "#f6f8f7", "#21e69a", "#0f9f68", "#6c7685", "#5c6cff", "#d93862"];

type ConfettiKind = "auth" | "wall" | "post" | "pack";

type ConfettiBurst = {
  id: string;
  kind: ConfettiKind;
};

type ReactionBurst = {
  id: string;
  seed: number;
  force: number;
};

type PixelSyncMessage = {
  cell: PixelCell;
  sourceId: string;
  type: "pixel";
};

type AppRoute =
  | { view: "feed" }
  | { view: "top" }
  | { view: "spaceHub" }
  | { view: "spaceMinecraft" }
  | { view: "spaceBoards" }
  | { view: "profile"; profileId: string }
  | { view: "space"; spaceId: string }
  | { view: "post"; postId: string };

type FeedFilter = "all" | "following" | "saved";
type ObjectKind = "note" | "branch" | "media" | "audio" | "fork";

type CreateSpacePayload = {
  name: string;
  slug: string;
  description: string;
  rules: string;
  publishMode: Wall["publishMode"];
};

type WallSettingsPayload = {
  actionButtons: WallActionButton[];
  accentColor: string;
  avatarFocus: MediaFocus;
  avatarUrl: string;
  bannerFocus: MediaFocus;
  bannerUrl: string;
  description: string;
  name: string;
  rules: string;
  publishMode: Wall["publishMode"];
};

type AppNavItem = {
  icon: React.ReactNode;
  label: string;
  route: AppRoute;
  view: AppRoute["view"];
};

function App() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [state, setState] = useState<SocialState>(() => normalizeLocalSession(readSocialState()));
  const [route, setRoute] = useState<AppRoute>(() =>
    readRouteFromPath(window.location.pathname, state.users, state.walls),
  );
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [query, setQuery] = useState("");
  const [authError, setAuthError] = useState("");
  const [confettiBursts, setConfettiBursts] = useState<ConfettiBurst[]>([]);
  const [isMobileComposerOpen, setIsMobileComposerOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [settingsWallId, setSettingsWallId] = useState<string | null>(null);
  const latestSocialStateRef = useRef(state);
  const pixelBroadcastRef = useRef<BroadcastChannel | null>(null);
  const pixelClientIdRef = useRef(crypto.randomUUID());
  const sharedStateReadyRef = useRef(false);
  const sharedStateVersionRef = useRef<number | null>(null);
  const skipNextSharedStateWriteRef = useRef(false);
  const viewedPostKeysRef = useRef(new Set<string>());
  const socialStateWriteTimerRef = useRef<number | null>(null);

  const userById = useMemo(
    () => new Map(state.users.map((user) => [user.id, user])),
    [state.users],
  );
  const postById = useMemo(
    () => new Map(state.posts.map((post) => [post.id, post])),
    [state.posts],
  );
  const commentsByPostId = useMemo(() => {
    const map = new Map<string, Comment[]>();
    const hiddenCommentIds = new Set(state.hiddenCommentIds);
    for (const comment of state.comments) {
      if (hiddenCommentIds.has(comment.id)) continue;
      const comments = map.get(comment.postId) ?? [];
      comments.push(comment);
      map.set(comment.postId, comments);
    }

    for (const comments of map.values()) {
      comments.sort((a, b) => a.createdAt - b.createdAt);
    }

    return map;
  }, [state.comments, state.hiddenCommentIds]);
  const activeUser = userById.get(state.activeUserId) ?? userById.get(guestUserId);
  const isDiscordUser = activeUser?.provider === "discord";
  const spaces = useMemo(() => state.walls.filter(isSpaceWall), [state.walls]);
  const wallById = useMemo(
    () => new Map(state.walls.map((wall) => [wall.id, wall])),
    [state.walls],
  );
  const savedPostIds = useMemo(() => new Set(state.savedPostIds), [state.savedPostIds]);
  const pinnedPostIds = useMemo(() => new Set(state.pinnedPostIds), [state.pinnedPostIds]);
  const hiddenPostIds = useMemo(() => new Set(state.hiddenPostIds), [state.hiddenPostIds]);
  const followedUserIds = useMemo(
    () => new Set(state.follows.filter((follow) => follow.targetType === "user").map((follow) => follow.targetId)),
    [state.follows],
  );
  const followedWallIds = useMemo(
    () => new Set(state.follows.filter((follow) => follow.targetType === "wall").map((follow) => follow.targetId)),
    [state.follows],
  );
  const unreadNotifications = useMemo(
    () => state.notifications.filter((item) => item.recipientId === state.activeUserId && !item.readAt),
    [state.activeUserId, state.notifications],
  );
  const activeProfile =
    route.view === "profile" ? userById.get(route.profileId) ?? activeUser : activeUser;
  const activeSpace =
    route.view === "space" ? state.walls.find((wall) => wall.id === route.spaceId) : undefined;
  const activePost = route.view === "post" ? postById.get(route.postId) : undefined;
  const settingsWall = settingsWallId ? wallById.get(settingsWallId) : undefined;
  const activeProfileWall = activeProfile ? wallById.get(getProfileWallId(activeProfile.id)) : undefined;
  const activePaletteWall =
    route.view === "space"
      ? activeSpace
      : route.view === "profile"
        ? activeProfileWall
        : route.view === "post" && activePost
          ? wallById.get(activePost.wallId)
          : undefined;
  const shellAccentStyle = getWallAccentStyle(activePaletteWall);
  const matchingUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return state.users
      .filter((user) => `${user.name} ${user.handle} ${user.bio}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 4);
  }, [query, state.users]);
  const matchingSpaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return spaces
      .filter((space) => `${space.name} ${space.description ?? ""} ${space.rules ?? ""}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 4);
  }, [query, spaces]);

  const visibleFeedPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return state.posts
      .filter((post) => {
        const author = userById.get(post.authorId);
        const wall = wallById.get(post.wallId);
        const haystack = `${post.text} ${author?.name ?? ""} ${author?.handle ?? ""} ${wall?.name ?? ""}`.toLowerCase();
        if (hiddenPostIds.has(post.id)) return false;
        if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
        if (feedFilter === "following") return followedUserIds.has(post.authorId) || followedWallIds.has(post.wallId);
        if (feedFilter === "saved") return savedPostIds.has(post.id);
        if (!normalizedQuery && !post.wallId.startsWith(profileWallPrefix)) return false;
        return `${post.text} ${author?.name ?? ""} ${author?.handle ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        const pinnedDelta = Number(pinnedPostIds.has(b.id)) - Number(pinnedPostIds.has(a.id));
        if (pinnedDelta) return pinnedDelta;
        return b.createdAt - a.createdAt;
      });
  }, [
    feedFilter,
    followedUserIds,
    followedWallIds,
    hiddenPostIds,
    pinnedPostIds,
    query,
    savedPostIds,
    state.posts,
    userById,
    wallById,
  ]);

  const composerTargetWallId = getComposerTargetWallId(route, activeUser);

  const applySharedWriteResult = useCallback((snapshot: Awaited<ReturnType<typeof writeSharedSocialState>>) => {
    if (!snapshot) return;

    sharedStateVersionRef.current = snapshot.version;
    if (snapshot.conflict) {
      skipNextSharedStateWriteRef.current = true;
      setState((current) => mergeSharedStateWithLocalSession(current, snapshot.state));
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeTheme(theme);
  }, [theme]);

  useEffect(() => {
    setState((current) => normalizeRuntimeBoardCopy(current));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applySharedSnapshot() {
      if (socialStateWriteTimerRef.current) return;

      const snapshot = await readSharedSocialState();
      if (!snapshot || cancelled || snapshot.version === sharedStateVersionRef.current) return;

      sharedStateVersionRef.current = snapshot.version;
      skipNextSharedStateWriteRef.current = true;
      setState((current) => mergeSharedStateWithLocalSession(current, snapshot.state));
    }

    async function loadSharedState() {
      const snapshot = await readSharedSocialState();
      if (cancelled) return;

      if (snapshot) {
        sharedStateReadyRef.current = true;
        sharedStateVersionRef.current = snapshot.version;
        skipNextSharedStateWriteRef.current = true;
        setState((current) => mergeSharedStateWithLocalSession(current, snapshot.state));
      }
    }

    void loadSharedState();
    const interval = window.setInterval(() => {
      void applySharedSnapshot();
    }, sharedStatePollMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function flushSocialState() {
      if (socialStateWriteTimerRef.current) {
        window.clearTimeout(socialStateWriteTimerRef.current);
        socialStateWriteTimerRef.current = null;
      }

      const stateToWrite = latestSocialStateRef.current;
      writeSocialState(stateToWrite);

      if (!sharedStateReadyRef.current || skipNextSharedStateWriteRef.current) {
        skipNextSharedStateWriteRef.current = false;
        return;
      }

      void writeSharedSocialState(
        prepareSharedStateForWrite(stateToWrite),
        sharedStateVersionRef.current,
      ).then(applySharedWriteResult);
    }

    window.addEventListener("pagehide", flushSocialState);

    return () => {
      window.removeEventListener("pagehide", flushSocialState);
      flushSocialState();
    };
  }, [applySharedWriteResult]);

  useEffect(() => {
    latestSocialStateRef.current = state;

    if (socialStateWriteTimerRef.current) {
      window.clearTimeout(socialStateWriteTimerRef.current);
    }

    socialStateWriteTimerRef.current = window.setTimeout(() => {
      const stateToWrite = latestSocialStateRef.current;
      writeSocialState(stateToWrite);
      socialStateWriteTimerRef.current = null;

      if (!sharedStateReadyRef.current || skipNextSharedStateWriteRef.current) {
        skipNextSharedStateWriteRef.current = false;
        return;
      }

      void writeSharedSocialState(
        prepareSharedStateForWrite(stateToWrite),
        sharedStateVersionRef.current,
      ).then(applySharedWriteResult);
    }, socialStateWriteDelayMs);
  }, [applySharedWriteResult, state]);

  useEffect(() => {
    const clientId = pixelClientIdRef.current;

    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(pixelSyncChannelName);
      pixelBroadcastRef.current = channel;
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data;
        if (!isPixelSyncMessage(message) || message.sourceId === clientId) return;
        setState((current) => applyPixelCellToState(current, message.cell, true));
      };
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== socialStateStorageKey || !event.newValue) return;
      const incomingState = readSocialState();
      setState((current) => mergePixelState(current, incomingState.pixelCells, incomingState.pixelCooldowns));
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      pixelBroadcastRef.current?.close();
      pixelBroadcastRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncDiscordSession() {
      try {
        const redirectedSession = await consumeDiscordRedirect();
        const session = redirectedSession ?? readStoredDiscordSession() ?? (await readServerDiscordSession());
        if (!session || cancelled) return;

        setState((current) => activateDiscordProfile(current, session));
        setAuthError("");

        if (redirectedSession) {
          celebrate("auth");
        }
      } catch {
        if (!cancelled) {
          setAuthError("Дискорд не отдал профиль");
        }
      }
    }

    void syncDiscordSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      setRoute(readRouteFromPath(window.location.pathname, latestSocialStateRef.current.users, latestSocialStateRef.current.walls));
      setIsMobileComposerOpen(false);
      setIsMobileSearchOpen(false);
      setIsCreateSpaceOpen(false);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const first = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (!first || first === "main" || first === "agents") {
      window.history.replaceState(null, "", "/feed");
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setState((current) => ({
        ...current,
        users: current.users.map((user) =>
          user.id === current.activeUserId
            ? { ...user, timeOnSiteMinutes: user.timeOnSiteMinutes + 1 }
            : user,
        ),
      }));
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  function navigate(nextRoute: AppRoute) {
    setRoute(nextRoute);
    setIsMobileComposerOpen(false);
    setIsMobileSearchOpen(false);
    setIsCreateSpaceOpen(false);
    window.history.pushState(null, "", routeToPath(nextRoute, userById, state.walls));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openProfile(profileId: string) {
    navigate({ view: "profile", profileId });
  }

  function openWallSettings(wallId: string) {
    setState((current) => ({
      ...current,
      walls: ensureWallExists(current.walls, wallId, current.users),
    }));
    setSettingsWallId(wallId);
  }

  function celebrate(kind: ConfettiKind) {
    const burst: ConfettiBurst = {
      id: crypto.randomUUID(),
      kind,
    };
    setConfettiBursts((current) => [...current, burst]);
    window.setTimeout(() => {
      setConfettiBursts((current) => current.filter((item) => item.id !== burst.id));
    }, 1100);
  }

  function startDiscordAuth() {
    const auth = buildDiscordAuthUrl();
    if (!auth.ok) {
      setAuthError(auth.message);
      return;
    }

    setAuthError("");
    window.location.assign(auth.url);
  }

  function logoutDiscord() {
    clearStoredDiscordSession();
    void clearServerDiscordSession();
    setAuthError("");
    navigate({ view: "feed" });
    setState((current) => ({
      ...current,
      users: ensureGuestUser(current.users),
      activeUserId: guestUserId,
    }));
  }

  function createSpace(payload: CreateSpacePayload) {
    const baseSlug = slugify(payload.slug || payload.name) || "доска";
    const existingIds = new Set(state.walls.map((wall) => wall.id));
    const id = makeUniqueId(`space:${baseSlug}`, existingIds);
    const wall: Wall = {
      id,
      siteSectionId: spaceSectionId,
      name: payload.name.trim(),
      ownerId: activeUser?.id,
      description: payload.description.trim(),
      rules: payload.rules.trim(),
      publishMode: payload.publishMode,
    };

    setState((current) => ({
      ...current,
      walls: [wall, ...current.walls],
    }));
    navigate({ view: "space", spaceId: wall.id });
    celebrate("wall");
  }

  function publishPostToWall(wallId: string | undefined, text: string, attachments: MediaAttachment[]) {
    if (!wallId || !activeUser || (!text.trim() && attachments.length === 0)) return;

    setState((current) => {
      const walls = ensureWallExists(current.walls, wallId, current.users);
      const targetWall = walls.find((wall) => wall.id === wallId);
      if (!canPublishToWall(targetWall, activeUser.id)) return current;

      const post: Post = {
        id: crypto.randomUUID(),
        wallId,
        authorId: activeUser.id,
        text: text.trim(),
        attachments,
        reactions: 0,
        views: {
          total: 0,
          uniqueUserIds: [],
        },
        createdAt: Date.now(),
      };

      return {
        ...current,
        walls,
        posts: [post, ...current.posts],
        notifications: [
          ...buildMentionNotifications({
            actorId: activeUser.id,
            users: current.users,
            text: post.text,
            postId: post.id,
          }),
          ...current.notifications,
        ],
      };
    });
    setIsMobileComposerOpen(false);
    celebrate("post");
  }

  function movePost(postId: string, x: number, y: number) {
    setState((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              position: clampPostPosition({
                x: Math.round(x / boardGridSize) * boardGridSize,
                y: Math.round(y / boardGridSize) * boardGridSize,
              }),
            }
          : post,
      ),
    }));
  }

  function paintPixel(x: number, y: number, color: string) {
    if (!activeUser || !pixelPalette.includes(color)) return;

    const now = Date.now();
    const currentState = latestSocialStateRef.current;
    const activeUserId = currentState.activeUserId;
    const lastPixelAt = currentState.pixelCooldowns[activeUserId] ?? 0;
    if (now - lastPixelAt < pixelCooldownMs) return;

    const nextCell: PixelCell = {
      x: Math.max(0, Math.min(pixelColumns - 1, Math.round(x))),
      y: Math.max(0, Math.min(pixelRows - 1, Math.round(y))),
      color: color.toLowerCase(),
      authorId: activeUserId,
      updatedAt: now,
    };
    const nextState = applyPixelCellToState(currentState, nextCell, true);

    latestSocialStateRef.current = nextState;
    if (socialStateWriteTimerRef.current) {
      window.clearTimeout(socialStateWriteTimerRef.current);
      socialStateWriteTimerRef.current = null;
    }

    flushSync(() => setState(nextState));
    writeSocialState(nextState);

    pixelBroadcastRef.current?.postMessage({
      type: "pixel",
      sourceId: pixelClientIdRef.current,
      cell: nextCell,
    } satisfies PixelSyncMessage);
  }

  const react = useCallback((postId: string, amount = 1) => {
    const reactionAmount = Math.max(0, Math.floor(amount));
    if (reactionAmount === 0) return;

    setState((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === postId ? { ...post, reactions: post.reactions + reactionAmount } : post,
      ),
      notifications: addPostNotification(current, {
        kind: "reaction",
        actorId: current.activeUserId,
        postId,
        text: `Новый огонёк ×${reactionAmount}`,
      }),
    }));
  }, []);

  const recordPostView = useCallback((postId: string) => {
    const current = latestSocialStateRef.current;
    const viewerId = current.activeUserId;
    const key = `${viewerId}:${postId}`;
    if (viewedPostKeysRef.current.has(key)) return;
    viewedPostKeysRef.current.add(key);

    setState((stateNow) => ({
      ...stateNow,
      posts: stateNow.posts.map((post) => {
        if (post.id !== postId) return post;
        const uniqueUserIds = post.views.uniqueUserIds.includes(viewerId)
          ? post.views.uniqueUserIds
          : [...post.views.uniqueUserIds, viewerId];
        return {
          ...post,
          views: {
            total: uniqueUserIds.length,
            uniqueUserIds,
          },
        };
      }),
    }));
  }, []);

  function addComment(postId: string, parentId: string | undefined, text: string, attachments: MediaAttachment[]) {
    if (!activeUser || (!text.trim() && attachments.length === 0)) return;
    const parentComment = parentId ? latestSocialStateRef.current.comments.find((comment) => comment.id === parentId) : undefined;
    if (!postById.has(postId)) return;
    if (parentId && (!parentComment || parentComment.postId !== postId)) return;

    const comment: Comment = {
      id: crypto.randomUUID(),
      postId,
      parentId,
      authorId: activeUser.id,
      text: text.trim(),
      attachments,
      reactions: 0,
      createdAt: Date.now(),
    };

    setState((current) => ({
      ...current,
      comments: [...current.comments, comment],
      notifications: [
        ...buildCommentNotifications(current, comment),
        ...buildMentionNotifications({
          actorId: activeUser.id,
          users: current.users,
          text: comment.text,
          postId,
          commentId: comment.id,
        }),
        ...current.notifications,
      ],
    }));
  }

  function reactToComment(commentId: string) {
    setState((current) => ({
      ...current,
      comments: current.comments.map((comment) =>
        comment.id === commentId ? { ...comment, reactions: comment.reactions + 1 } : comment,
      ),
      notifications: addCommentReactionNotification(current, current.activeUserId, commentId),
    }));
  }

  function editComment(commentId: string, text: string) {
    const nextText = text.trim();
    if (!nextText) return;

    setState((current) => ({
      ...current,
      comments: current.comments.map((comment) =>
        comment.id === commentId && comment.authorId === current.activeUserId
          ? { ...comment, text: nextText, editedAt: Date.now() }
          : comment,
      ),
    }));
  }

  function deleteComment(commentId: string) {
    setState((current) => {
      const target = current.comments.find((comment) => comment.id === commentId);
      if (!target || target.authorId !== current.activeUserId) return current;

      const idsToDelete = new Set<string>([commentId]);
      for (const comment of current.comments) {
        if (comment.parentId === commentId) idsToDelete.add(comment.id);
      }

      return {
        ...current,
        comments: current.comments.filter((comment) => !idsToDelete.has(comment.id)),
        hiddenCommentIds: current.hiddenCommentIds.filter((id) => !idsToDelete.has(id)),
        reports: current.reports.filter((report) => !report.commentId || !idsToDelete.has(report.commentId)),
      };
    });
  }

  function hideComment(commentId: string) {
    setState((current) => ({
      ...current,
      hiddenCommentIds: current.hiddenCommentIds.includes(commentId)
        ? current.hiddenCommentIds
        : [commentId, ...current.hiddenCommentIds],
    }));
  }

  function reportComment(commentId: string, reason = "Жалоба") {
    if (!activeUser) return;

    setState((current) => ({
      ...current,
      reports: [
        {
          id: crypto.randomUUID(),
          commentId,
          reporterId: activeUser.id,
          reason,
          createdAt: Date.now(),
        },
        ...current.reports,
      ],
      hiddenCommentIds: current.hiddenCommentIds.includes(commentId)
        ? current.hiddenCommentIds
        : [commentId, ...current.hiddenCommentIds],
    }));
  }

  function editPost(postId: string, text: string) {
    setState((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === postId ? { ...post, text: text.trim(), editedAt: Date.now() } : post,
      ),
    }));
  }

  function deletePost(postId: string) {
    setState((current) => ({
      ...current,
      posts: current.posts.filter((post) => post.id !== postId),
      comments: current.comments.filter((comment) => comment.postId !== postId),
      savedPostIds: current.savedPostIds.filter((id) => id !== postId),
      pinnedPostIds: current.pinnedPostIds.filter((id) => id !== postId),
      hiddenPostIds: current.hiddenPostIds.filter((id) => id !== postId),
      hiddenCommentIds: current.hiddenCommentIds.filter(
        (id) => current.comments.some((comment) => comment.id === id && comment.postId !== postId),
      ),
    }));
    if (route.view === "post" && route.postId === postId) {
      navigate({ view: "feed" });
    }
  }

  function togglePinnedPost(postId: string) {
    setState((current) => ({
      ...current,
      pinnedPostIds: current.pinnedPostIds.includes(postId)
        ? current.pinnedPostIds.filter((id) => id !== postId)
        : [postId, ...current.pinnedPostIds],
    }));
  }

  function toggleSavedPost(postId: string) {
    setState((current) => ({
      ...current,
      savedPostIds: current.savedPostIds.includes(postId)
        ? current.savedPostIds.filter((id) => id !== postId)
        : [postId, ...current.savedPostIds],
    }));
  }

  function repostPost(postId: string) {
    const sourcePost = postById.get(postId);
    if (!activeUser || !sourcePost) return;

    const repost: Post = {
      id: crypto.randomUUID(),
      wallId: getProfileWallId(activeUser.id),
      authorId: activeUser.id,
      text: "",
      attachments: [],
      reactions: 0,
      views: {
        total: 0,
        uniqueUserIds: [],
      },
      repostOfId: postId,
      createdAt: Date.now(),
    };

    setState((current) => ({
      ...current,
      walls: ensureWallExists(current.walls, repost.wallId, current.users),
      posts: [repost, ...current.posts],
    notifications: addPostNotification(current, {
        kind: "repost",
        actorId: activeUser.id,
        postId,
        text: "Заметка появилась на доске",
      }),
    }));
    celebrate("post");
  }

  function reportPost(postId: string, reason = "Жалоба") {
    if (!activeUser) return;

    setState((current) => ({
      ...current,
      reports: [
        {
          id: crypto.randomUUID(),
          postId,
          reporterId: activeUser.id,
          reason,
          createdAt: Date.now(),
        },
        ...current.reports,
      ],
      hiddenPostIds: current.hiddenPostIds.includes(postId) ? current.hiddenPostIds : [postId, ...current.hiddenPostIds],
    }));
  }

  function hidePost(postId: string) {
    setState((current) => ({
      ...current,
      hiddenPostIds: current.hiddenPostIds.includes(postId) ? current.hiddenPostIds : [postId, ...current.hiddenPostIds],
    }));
  }

  function toggleFollow(targetType: "user" | "wall", targetId: string) {
    if (!activeUser) return;

    setState((current) => {
      const existing = current.follows.find((follow) => follow.targetType === targetType && follow.targetId === targetId);
      if (existing) {
        return {
          ...current,
          follows: current.follows.filter((follow) => follow.id !== existing.id),
        };
      }

      return {
        ...current,
        follows: [
          {
            id: crypto.randomUUID(),
            targetId,
            targetType,
            createdAt: Date.now(),
          },
          ...current.follows,
        ],
        notifications: addFollowNotification(current, activeUser.id, targetType, targetId),
      };
    });
  }

  function updateWallSettings(wallId: string, payload: WallSettingsPayload) {
    setState((current) => ({
      ...current,
      walls: current.walls.map((wall) =>
        wall.id === wallId
          ? {
              ...wall,
              actionButtons: payload.actionButtons,
              avatarUrl: payload.avatarUrl.trim() || undefined,
              bannerUrl: payload.bannerUrl.trim() || undefined,
              avatarFocus: payload.avatarFocus,
              bannerFocus: payload.bannerFocus,
              accentColor: payload.accentColor || undefined,
              description: payload.description.trim(),
              name: payload.name.trim(),
              rules: payload.rules.trim(),
              publishMode: payload.publishMode,
            }
          : wall,
      ),
    }));
    setSettingsWallId(null);
  }

  function deleteWall(wallId: string) {
    setState((current) => {
      const wall = current.walls.find((item) => item.id === wallId);
      if (!wall || !canManageWall(wall, current.activeUserId) || wall.id.startsWith(profileWallPrefix)) {
        return current;
      }

      const postIds = new Set(current.posts.filter((post) => post.wallId === wallId).map((post) => post.id));
      const commentIds = new Set(current.comments.filter((comment) => postIds.has(comment.postId)).map((comment) => comment.id));

      return {
        ...current,
        walls: current.walls.filter((item) => item.id !== wallId),
        posts: current.posts.filter((post) => post.wallId !== wallId),
        comments: current.comments.filter((comment) => !postIds.has(comment.postId)),
        follows: current.follows.filter((follow) => follow.targetType !== "wall" || follow.targetId !== wallId),
        savedPostIds: current.savedPostIds.filter((postId) => !postIds.has(postId)),
        pinnedPostIds: current.pinnedPostIds.filter((postId) => !postIds.has(postId)),
        hiddenPostIds: current.hiddenPostIds.filter((postId) => !postIds.has(postId)),
        hiddenCommentIds: current.hiddenCommentIds.filter((commentId) => !commentIds.has(commentId)),
        notifications: current.notifications.filter(
          (item) => !item.postId || !postIds.has(item.postId),
        ),
        reports: current.reports.filter((report) => {
          if (report.postId && postIds.has(report.postId)) return false;
          if (report.commentId && commentIds.has(report.commentId)) return false;
          return true;
        }),
      };
    });

    if (route.view === "space" && route.spaceId === wallId) {
      navigate({ view: "feed" });
    }
    setSettingsWallId(null);
  }

  function markNotificationsRead() {
    setState((current) => ({
      ...current,
      notifications: current.notifications.map((item) =>
        item.recipientId === current.activeUserId && !item.readAt ? { ...item, readAt: Date.now() } : item,
      ),
    }));
  }

  const navItems: AppNavItem[] = [
    { icon: <House size={18} />, label: "Поле", route: { view: "feed" }, view: "feed" },
    { icon: <MapIcon size={18} />, label: "Сообщество", route: { view: "spaceHub" }, view: "spaceHub" },
    { icon: <Trophy size={18} />, label: "Пульс", route: { view: "top" }, view: "top" },
  ];

  return (
    <div className={route.view === "post" ? "shell shell--post" : "shell"} style={shellAccentStyle}>
      <PixelBattleLayer
        activeUserId={activeUser?.id}
        cells={state.pixelCells}
        cooldownStartedAt={activeUser ? state.pixelCooldowns[activeUser.id] ?? 0 : 0}
        onPaint={paintPixel}
      />

      <aside className="site-panel">
        <div className="brand-row">
          <button className="brand" onClick={() => navigate({ view: "feed" })} aria-label="В поле">
            <span className="brand-mark">К</span>
            <strong>КиберКотлета</strong>
          </button>

          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label="Переключить тему"
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>

        <nav className="site-nav" aria-label="Разделы сайта">
          {navItems.map((item) => (
            <button
              key={item.view}
              className={isNavRouteActive(route, item.view) ? "active" : ""}
              onClick={() => navigate(item.route)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <section className="space-rail" aria-label="Доски">
          <button className="space-create" onClick={() => setIsCreateSpaceOpen(true)}>
            <CirclePlus size={15} />
            Новая доска
          </button>
          {spaces.slice(0, 4).map((space) => (
            <button
              key={space.id}
              className={route.view === "space" && route.spaceId === space.id ? "active" : ""}
              onClick={() => navigate({ view: "space", spaceId: space.id })}
            >
              <ChannelName wall={space} />
            </button>
          ))}
        </section>

        {activeUser ? (
          <button className="current-user" onClick={() => openProfile(activeUser.id)}>
            <Avatar user={activeUser} />
            <span>
              <strong>{activeUser.name}</strong>
              <small>{formatMinutes(activeUser.timeOnSiteMinutes)}</small>
            </span>
          </button>
        ) : null}

        {!isDiscordUser ? (
          <AuthControls
            error={authError}
            isDiscordUser={false}
            onLogin={startDiscordAuth}
            onLogout={logoutDiscord}
          />
        ) : (
          <AuthControls
            error={authError}
            isDiscordUser
            onLogin={startDiscordAuth}
            onLogout={logoutDiscord}
          />
        )}

        {activeUser ? (
          <NotificationCenter
            activeUserId={activeUser.id}
            isOpen={isNotificationsOpen}
            notifications={state.notifications}
            unreadCount={unreadNotifications.length}
            userById={userById}
            onNavigatePost={(postId) => navigate({ view: "post", postId })}
            onToggle={() => {
              setIsNotificationsOpen((value) => !value);
              markNotificationsRead();
            }}
          />
        ) : null}
      </aside>

      <main className="main" id="top">
        {route.view === "feed" ? (
          <header className="topbar desktop-search">
            <div className="search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск"
              />
            </div>
          </header>
        ) : null}

        {route.view === "feed" && isMobileSearchOpen ? (
          <header className="topbar mobile-search">
            <div className="search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск"
                autoFocus
              />
            </div>
          </header>
        ) : null}

        {route.view === "feed" ? (
          <FeedPage
            filter={feedFilter}
            allPosts={state.posts.filter((post) => !hiddenPostIds.has(post.id))}
            posts={visibleFeedPosts}
            matchingSpaces={matchingSpaces}
            matchingUsers={matchingUsers}
            hasSearch={query.trim().length > 0}
            spaces={spaces}
            activeUserId={activeUser?.id}
            commentsByPostId={commentsByPostId}
            postById={postById}
            pinnedPostIds={pinnedPostIds}
            savedPostIds={savedPostIds}
            userById={userById}
            wallById={wallById}
            onCreateSpace={() => setIsCreateSpaceOpen(true)}
            onDeletePost={deletePost}
            onEditPost={editPost}
            onFilterChange={setFeedFilter}
            onHidePost={hidePost}
            onMovePost={movePost}
            onOpenPost={(postId) => navigate({ view: "post", postId })}
            onOpenProfile={openProfile}
            onOpenSpace={(spaceId) => navigate({ view: "space", spaceId })}
            onPinPost={togglePinnedPost}
            onPublish={(text, attachments) =>
              publishPostToWall(getProfileWallId(activeUser?.id ?? ""), text, attachments)
            }
            onReact={react}
            onRecordView={recordPostView}
            onReportPost={reportPost}
            onRepost={repostPost}
            onToggleSave={toggleSavedPost}
          />
        ) : null}

        {route.view === "top" ? (
          <Leaderboard
            commentsByPostId={commentsByPostId}
            posts={state.posts.filter((post) => !hiddenPostIds.has(post.id))}
            savedPostIds={savedPostIds}
            users={state.users}
            userById={userById}
            wallById={wallById}
            onOpenPost={(postId) => navigate({ view: "post", postId })}
            onOpenProfile={openProfile}
          />
        ) : null}

        {route.view === "spaceHub" ? (
          <CommunitySpacePage
            onOpenBoards={() => navigate({ view: "spaceBoards" })}
            onOpenMinecraft={() => navigate({ view: "spaceMinecraft" })}
          />
        ) : null}

        {route.view === "spaceMinecraft" ? (
          <MinecraftUtility onBack={() => navigate({ view: "spaceHub" })} onCelebrate={() => celebrate("pack")} />
        ) : null}

        {route.view === "spaceBoards" ? (
          <CommunityBoardsPage
            spaces={spaces}
            onCreateSpace={() => setIsCreateSpaceOpen(true)}
            onOpenFeed={() => navigate({ view: "feed" })}
            onOpenSpace={(spaceId) => navigate({ view: "space", spaceId })}
          />
        ) : null}

        {route.view === "profile" ? (
          <ProfilePage
            activeUser={activeUser}
            commentsByPostId={commentsByPostId}
            followedUserIds={followedUserIds}
            pinnedPostIds={pinnedPostIds}
            postById={postById}
            posts={state.posts.filter((post) => !hiddenPostIds.has(post.id))}
            savedPostIds={savedPostIds}
            user={activeProfile}
            userById={userById}
            profileWall={activeProfileWall}
            wallById={wallById}
            onDeletePost={deletePost}
            onEditPost={editPost}
            onFollow={(userId) => toggleFollow("user", userId)}
            onHidePost={hidePost}
            onOpenPost={(postId) => navigate({ view: "post", postId })}
            onOpenProfile={openProfile}
            onOpenSettings={() => openWallSettings(getProfileWallId(activeProfile?.id ?? ""))}
            onPinPost={togglePinnedPost}
            onPublish={(text, attachments) =>
              publishPostToWall(getProfileWallId(activeProfile?.id ?? ""), text, attachments)
            }
            onMovePost={movePost}
            onReact={react}
            onRecordView={recordPostView}
            onReportPost={reportPost}
            onRepost={repostPost}
            onToggleSave={toggleSavedPost}
          />
        ) : null}

        {route.view === "space" ? (
          <SpacePage
            activeUser={activeUser}
            commentsByPostId={commentsByPostId}
            followedWallIds={followedWallIds}
            pinnedPostIds={pinnedPostIds}
            postById={postById}
            posts={state.posts.filter((post) => post.wallId === activeSpace?.id && !hiddenPostIds.has(post.id))}
            savedPostIds={savedPostIds}
            space={activeSpace}
            userById={userById}
            wallById={wallById}
            onCreateSpace={() => setIsCreateSpaceOpen(true)}
            onDeletePost={deletePost}
            onEditPost={editPost}
            onFollow={(wallId) => toggleFollow("wall", wallId)}
            onHidePost={hidePost}
            onOpenPost={(postId) => navigate({ view: "post", postId })}
            onOpenProfile={openProfile}
            onOpenSettings={openWallSettings}
            onPinPost={togglePinnedPost}
            onPublish={(text, attachments) => publishPostToWall(activeSpace?.id, text, attachments)}
            onMovePost={movePost}
            onReact={react}
            onRecordView={recordPostView}
            onReportPost={reportPost}
            onRepost={repostPost}
            onToggleSave={toggleSavedPost}
          />
        ) : null}

        {route.view === "post" ? (
          <PostThreadPage
            activeUser={activeUser}
            comments={activePost ? commentsByPostId.get(activePost.id) ?? [] : []}
            pinnedPostIds={pinnedPostIds}
            post={activePost}
            postById={postById}
            savedPostIds={savedPostIds}
            userById={userById}
            wallById={wallById}
            onAddComment={addComment}
            onBack={() => navigate({ view: "feed" })}
            onDeletePost={deletePost}
            onDeleteComment={deleteComment}
            onEditComment={editComment}
            onEditPost={editPost}
            onHideComment={hideComment}
            onHidePost={hidePost}
            onOpenProfile={openProfile}
            onPinPost={togglePinnedPost}
            onReact={react}
            onReactComment={reactToComment}
            onRecordView={recordPostView}
            onReportComment={reportComment}
            onReportPost={reportPost}
            onRepost={repostPost}
            onToggleSave={toggleSavedPost}
          />
        ) : null}
      </main>

      <MobileBottomNav
        activeRoute={route}
        activeUser={activeUser}
        navItems={navItems}
        unreadCount={unreadNotifications.length}
        onCreateSpace={() => setIsCreateSpaceOpen(true)}
        onToggleNotifications={() => {
          setIsNotificationsOpen((value) => !value);
          markNotificationsRead();
        }}
        onToggleSearch={() => setIsMobileSearchOpen((value) => !value)}
        onOpenProfile={openProfile}
        onNavigate={navigate}
      />

      {composerTargetWallId ? (
        <button
          className="mobile-fab"
          onClick={() => setIsMobileComposerOpen(true)}
          aria-label="Новая заметка"
        >
          <CirclePlus size={26} />
        </button>
      ) : null}

      {isMobileComposerOpen ? (
        <MobileComposerSheet
          targetLabel={getComposerTargetLabel(composerTargetWallId, wallById, userById, activeUser)}
          onClose={() => setIsMobileComposerOpen(false)}
          onPublish={(text, attachments) => publishPostToWall(composerTargetWallId, text, attachments)}
        />
      ) : null}

      {isCreateSpaceOpen ? (
        <CreateSpaceDialog
          onClose={() => setIsCreateSpaceOpen(false)}
          onCreate={createSpace}
        />
      ) : null}
      {settingsWall ? (
        <WallSettingsDialog
          wall={settingsWall}
          canDelete={!settingsWall.id.startsWith(profileWallPrefix)}
          onClose={() => setSettingsWallId(null)}
          onDelete={() => deleteWall(settingsWall.id)}
          onSave={(payload) => updateWallSettings(settingsWall.id, payload)}
        />
      ) : null}
      <ConfettiLayer bursts={confettiBursts} />
    </div>
  );
}

function AuthControls({
  error,
  isDiscordUser,
  onLogin,
  onLogout,
}: {
  error: string;
  isDiscordUser: boolean;
  onLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="auth-controls">
      {isDiscordUser ? (
        <button className="discord-button secondary" onClick={onLogout}>
          <LogOut size={15} />
          Выйти
        </button>
      ) : (
        <button className="discord-button" onClick={onLogin}>
          <LogIn size={15} />
          Войти через Дискорд
        </button>
      )}
      {error ? <span className="auth-error">{error}</span> : null}
    </div>
  );
}

function NotificationCenter({
  activeUserId,
  isOpen,
  notifications,
  unreadCount,
  userById,
  onNavigatePost,
  onToggle,
}: {
  activeUserId: string;
  isOpen: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  userById: Map<string, UserProfile>;
  onNavigatePost: (postId: string) => void;
  onToggle: () => void;
}) {
  const visibleNotifications = notifications
    .filter((item) => item.recipientId === activeUserId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8);

  return (
    <section className="notifications">
      <button className={isOpen ? "notification-toggle active" : "notification-toggle"} onClick={onToggle}>
        <Bell size={16} />
        <span>События</span>
        {unreadCount > 0 ? <b>{unreadCount}</b> : null}
      </button>

      {isOpen ? (
        <div className="notification-list">
          {visibleNotifications.length === 0 ? (
            <div className="empty small">Новых событий нет</div>
          ) : (
            visibleNotifications.map((item) => {
              const actor = userById.get(item.actorId);
              return (
                <button
                  key={item.id}
                  className={item.readAt ? "notification-item" : "notification-item unread"}
                  onClick={() => item.postId ? onNavigatePost(item.postId) : undefined}
                >
                  <span>{actor?.name ?? "Пользователь"}</span>
                  <strong>{item.text}</strong>
                  <small>{formatRelativeTime(item.createdAt)}</small>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}

function PixelBattleLayer({
  activeUserId,
  cells,
  cooldownStartedAt,
  onPaint,
}: {
  activeUserId: string | undefined;
  cells: PixelCell[];
  cooldownStartedAt: number;
  onPaint: (x: number, y: number, color: string) => void;
}) {
  const [isPainting, setIsPainting] = useState(false);
  const [selectedColor, setSelectedColor] = useState(pixelPalette[2]);
  const [now, setNow] = useState(Date.now());
  const gridRef = useRef<HTMLDivElement | null>(null);
  const cooldownLeft = activeUserId
    ? Math.max(0, pixelCooldownMs - (now - cooldownStartedAt))
    : pixelCooldownMs;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 160);
    return () => window.clearInterval(timer);
  }, []);

  function paintAtClientPoint(clientX: number, clientY: number) {
    if (!isPainting || cooldownLeft > 0) return;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = Math.floor((clientX - rect.left) / pixelSize);
    const y = Math.floor((clientY - rect.top) / pixelSize);
    if (x < 0 || x >= pixelColumns || y < 0 || y >= pixelRows) return;
    onPaint(x, y, selectedColor);
    setNow(Date.now());
  }

  function paintFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    paintAtClientPoint(event.clientX, event.clientY);
  }

  return (
    <>
      <div
        ref={gridRef}
        className={isPainting ? "pixel-battle-layer painting" : "pixel-battle-layer"}
        style={
          {
            "--pixel-columns": pixelColumns,
            "--pixel-rows": pixelRows,
            "--pixel-size": `${pixelSize}px`,
          } as CSSProperties
        }
        aria-hidden={!isPainting}
      >
        {cells.map((cell) => (
          <span
            key={`${cell.x}:${cell.y}`}
            style={
              {
                "--px": cell.x + 1,
                "--py": cell.y + 1,
                "--pixel-color": cell.color,
              } as CSSProperties
            }
          />
        ))}
      </div>
      {isPainting ? (
        <div
          className="pixel-paint-catcher"
          onClick={(event) => paintAtClientPoint(event.clientX, event.clientY)}
          onPointerDown={paintFromPointer}
          aria-label="Поле пикселей"
          role="presentation"
        />
      ) : null}

      <div className={isPainting ? "pixel-toolbar active" : "pixel-toolbar"}>
        <button
          className="pixel-toggle"
          onClick={() => setIsPainting((value) => !value)}
          aria-label={isPainting ? "Закрыть пиксели" : "Рисовать пиксели"}
          title={isPainting ? "Закрыть пиксели" : "Рисовать пиксели"}
        >
          <Paintbrush size={17} />
        </button>
        {isPainting ? (
          <div className="pixel-popover">
            <div className="pixel-palette" aria-label="Цвета пикселей">
              {pixelPalette.map((color) => (
                <button
                  key={color}
                  className={selectedColor === color ? "active" : ""}
                  onClick={() => setSelectedColor(color)}
                  style={{ "--swatch": color } as CSSProperties}
                  aria-label={`Цвет ${color}`}
                />
              ))}
            </div>
            <span className={cooldownLeft > 0 ? "pixel-cooldown locked" : "pixel-cooldown"}>
              {cooldownLeft > 0 ? `${Math.ceil(cooldownLeft / 1000)}с` : "готово"}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}

function MobileBottomNav({
  activeRoute,
  activeUser,
  navItems,
  unreadCount,
  onCreateSpace,
  onToggleNotifications,
  onToggleSearch,
  onOpenProfile,
  onNavigate,
}: {
  activeRoute: AppRoute;
  activeUser: UserProfile | undefined;
  navItems: AppNavItem[];
  unreadCount: number;
  onCreateSpace: () => void;
  onToggleNotifications: () => void;
  onToggleSearch: () => void;
  onOpenProfile: (profileId: string) => void;
  onNavigate: (route: AppRoute) => void;
}) {
  return (
    <nav className="mobile-tabbar" aria-label="Мобильная навигация">
      {navItems.map((item) => (
        <button
          key={item.view}
          className={activeRoute.view === item.view ? "active" : ""}
          onClick={() => onNavigate(item.route)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}

      {activeRoute.view === "feed" ? (
        <button onClick={onToggleSearch}>
          <Search size={20} />
          <span>Поиск</span>
        </button>
      ) : null}

      <button onClick={onCreateSpace}>
        <CirclePlus size={20} />
        <span>Доска</span>
      </button>

      {activeUser ? (
        <button className="mobile-bell-button" onClick={onToggleNotifications}>
          <Bell size={20} />
          <span>События</span>
          {unreadCount > 0 ? <b>{unreadCount}</b> : null}
        </button>
      ) : null}

      {activeUser ? (
        <button
          className={activeRoute.view === "profile" && activeRoute.profileId === activeUser.id ? "active" : ""}
          onClick={() => onOpenProfile(activeUser.id)}
        >
          <UserRound size={20} />
          <span>Я</span>
        </button>
      ) : null}
    </nav>
  );
}

function FeedPage({
  filter,
  activeUserId,
  allPosts,
  commentsByPostId,
  matchingSpaces,
  matchingUsers,
  hasSearch,
  pinnedPostIds,
  postById,
  posts,
  savedPostIds,
  spaces,
  userById,
  wallById,
  onCreateSpace,
  onDeletePost,
  onEditPost,
  onFilterChange,
  onHidePost,
  onMovePost,
  onOpenPost,
  onOpenProfile,
  onOpenSpace,
  onPinPost,
  onPublish,
  onReact,
  onRecordView,
  onReportPost,
  onRepost,
  onToggleSave,
}: {
  filter: FeedFilter;
  activeUserId: string | undefined;
  allPosts: Post[];
  commentsByPostId: Map<string, Comment[]>;
  matchingSpaces: Wall[];
  matchingUsers: UserProfile[];
  hasSearch: boolean;
  pinnedPostIds: Set<string>;
  postById: Map<string, Post>;
  posts: Post[];
  savedPostIds: Set<string>;
  spaces: Wall[];
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onCreateSpace: () => void;
  onDeletePost: (postId: string) => void;
  onEditPost: (postId: string, text: string) => void;
  onFilterChange: (filter: FeedFilter) => void;
  onHidePost: (postId: string) => void;
  onMovePost: (postId: string, x: number, y: number) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onOpenSpace: (spaceId: string) => void;
  onPinPost: (postId: string) => void;
  onPublish: (text: string, attachments: MediaAttachment[]) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReportPost: (postId: string) => void;
  onRepost: (postId: string) => void;
  onToggleSave: (postId: string) => void;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const filters: Array<{ id: FeedFilter; label: string }> = [
    { id: "all", label: "Все" },
    { id: "following", label: "Подписки" },
    { id: "saved", label: "Сохранено" },
  ];
  const emptyText = hasSearch
    ? "Ничего"
    : filter === "saved"
      ? "Пока пусто"
      : filter === "following"
        ? "Пока пусто"
        : "Пока пусто";
  const fieldBoardHeight = getBoardCanvasHeight(posts);

  return (
    <section
      className={isCreateOpen ? "feed-page field-page field-page--creating" : "feed-page field-page"}
      style={{ "--field-board-height": `${fieldBoardHeight}px` } as CSSProperties}
    >
      <div className="field-command">
        <div className="field-title">
          <h1>Поле</h1>
        </div>
      </div>

      <div className="field-filterbar">
        <div className="wall-tabs feed-tabs">
          {filters.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => onFilterChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field-toolbelt" aria-label="Инструменты поля">
        <button className={isCreateOpen ? "active" : ""} onClick={() => setIsCreateOpen((value) => !value)}>
          <CirclePlus size={16} />
          Заметка
        </button>
        <button onClick={onCreateSpace}>
          <MapIcon size={16} />
          Доска
        </button>
        <span>{formatNoteCount(posts.length)}</span>
      </div>

      {matchingUsers.length > 0 || matchingSpaces.length > 0 ? (
        <SearchRail
          spaces={matchingSpaces}
          users={matchingUsers}
          onOpenProfile={onOpenProfile}
          onOpenSpace={onOpenSpace}
        />
      ) : null}

      {isCreateOpen ? (
        <div className="field-create-popover">
          <Composer
            className="desktop-composer field-composer"
            placeholder="Новая заметка"
            targetLabel="Моя доска"
            onPublish={(text, attachments) => {
              onPublish(text, attachments);
              setIsCreateOpen(false);
            }}
          />
        </div>
      ) : null}

      <section className="board-directory" aria-label="Доски">
        {spaces.slice(0, 5).map((space) => {
          const spacePosts = allPosts.filter((post) => post.wallId === space.id);
          const answerCount = spacePosts.reduce(
            (sum, post) => sum + (commentsByPostId.get(post.id)?.length ?? 0),
            0,
          );
          const viewCount = spacePosts.reduce((sum, post) => sum + getPostViewCount(post), 0);

          return (
            <FieldSpaceObject
              key={space.id}
              answerCount={answerCount}
              postCount={spacePosts.length}
              space={space}
              viewCount={viewCount}
              onOpenSpace={onOpenSpace}
            />
          );
        })}
      </section>

      <WallBoard
        activeUserId={activeUserId}
        className="field-board"
        commentsByPostId={commentsByPostId}
        emptyText={emptyText}
        hint="перетащи карточки по странице"
        pinnedPostIds={pinnedPostIds}
        postById={postById}
        posts={posts}
        savedPostIds={savedPostIds}
        title="Доска"
        userById={userById}
        wallById={wallById}
        onDeletePost={onDeletePost}
        onEditPost={onEditPost}
        onHidePost={onHidePost}
        onMovePost={onMovePost}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onPinPost={onPinPost}
        onReact={onReact}
        onRecordView={onRecordView}
        onReportPost={onReportPost}
        onRepost={onRepost}
        onToggleSave={onToggleSave}
      />

      <FieldMiniMap posts={posts} />
    </section>
  );
}

function FieldMiniMap({ posts }: { posts: Post[] }) {
  const postLayout = resolveBoardPostLayout(posts);
  const maxX = Math.max(1, ...postLayout.map(({ position }) => position.x + boardCardWidth));
  const maxY = Math.max(1, ...postLayout.map(({ position }) => position.y + boardCardHeight));

  return (
    <aside className="field-minimap" aria-label="Карта поля">
      <span>Карта</span>
      <div>
        {postLayout.map(({ post, position }) => (
          <i
            key={post.id}
            style={
              {
                "--map-x": `${Math.min(92, Math.max(4, (position.x / maxX) * 100))}%`,
                "--map-y": `${Math.min(86, Math.max(8, (position.y / maxY) * 100))}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </aside>
  );
}

function SearchRail({
  spaces,
  users,
  onOpenProfile,
  onOpenSpace,
}: {
  spaces: Wall[];
  users: UserProfile[];
  onOpenProfile: (profileId: string) => void;
  onOpenSpace: (spaceId: string) => void;
}) {
  return (
    <section className="search-rail" aria-label="Быстрые результаты">
      {users.map((user) => (
        <button key={user.id} onClick={() => onOpenProfile(user.id)}>
          <Avatar user={user} />
          <span>
            <strong>{user.name}</strong>
            <small>{user.handle}</small>
          </span>
        </button>
      ))}
      {spaces.map((space) => (
        <button key={space.id} onClick={() => onOpenSpace(space.id)}>
          <span className="space-dot" />
          <span>
            <strong>
              <ChannelName wall={space} />
            </strong>
            <small>Доска</small>
          </span>
        </button>
      ))}
    </section>
  );
}

function FieldSpaceObject({
  answerCount,
  postCount,
  space,
  viewCount,
  onOpenSpace,
}: {
  answerCount: number;
  postCount: number;
  space: Wall;
  viewCount: number;
  onOpenSpace: (spaceId: string) => void;
}) {
  return (
    <button className="space-object field-object object-space" onClick={() => onOpenSpace(space.id)}>
      <span className="object-topline">
        <span>доска</span>
        <i>{space.publishMode === "open" ? "свободно" : "закрыто"}</i>
      </span>
      <span className="space-object-title">
        <WallAvatar fallback={space.name} wall={space} />
        <strong>
          <ChannelName wall={space} />
        </strong>
      </span>
      {space.description ? <p>{space.description}</p> : null}
      <span className="space-object-law">{space.rules || "без правил"}</span>
      <span className="object-metrics">
        <span>
          <b>{postCount}</b>
          <small>объекты</small>
        </span>
        <span>
          <b>{answerCount}</b>
          <small>ответы</small>
        </span>
        <span>
          <b>{formatCompactNumber(viewCount)}</b>
          <small>просм.</small>
        </span>
      </span>
    </button>
  );
}

function WallBoard({
  activeUserId,
  className,
  commentsByPostId,
  emptyText,
  hint = "перетащи заметку",
  pinnedPostIds,
  postById,
  posts,
  savedPostIds,
  title = "Доска",
  userById,
  wallById,
  onDeletePost,
  onEditPost,
  onHidePost,
  onMovePost,
  onOpenPost,
  onOpenProfile,
  onPinPost,
  onReact,
  onRecordView,
  onReportPost,
  onRepost,
  onToggleSave,
}: {
  activeUserId: string | undefined;
  className?: string;
  commentsByPostId: Map<string, Comment[]>;
  emptyText: string;
  hint?: string;
  pinnedPostIds: Set<string>;
  postById: Map<string, Post>;
  posts: Post[];
  savedPostIds: Set<string>;
  title?: string;
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onDeletePost: (postId: string) => void;
  onEditPost: (postId: string, text: string) => void;
  onHidePost: (postId: string) => void;
  onMovePost: (postId: string, x: number, y: number) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onPinPost: (postId: string) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReportPost: (postId: string) => void;
  onRepost: (postId: string) => void;
  onToggleSave: (postId: string) => void;
}) {
  const [drag, setDrag] = useState<{
    origin: PostPosition;
    pointerX: number;
    pointerY: number;
    postId: string;
  } | null>(null);
  const boardRef = useRef<HTMLElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const [boardDefaultX, setBoardDefaultX] = useState(0);
  const [previewPosition, setPreviewPosition] = useState<PostPosition | null>(null);
  const previewPositionRef = useRef<PostPosition | null>(null);
  const boardClassNames = className?.split(" ") ?? [];
  const isFieldBoard = boardClassNames.includes("field-board");
  const hasFloatingMiniMap = boardClassNames.includes("space-field-board");
  const boardRightReserve = hasFloatingMiniMap ? 230 : isFieldBoard ? 96 : 0;
  const boardMaxX = isFieldBoard && boardWidth > 0
    ? Math.max(0, boardWidth - boardCardWidth - boardGap - boardRightReserve)
    : 1800;
  const postLayout = useMemo(
    () => resolveBoardPostLayout(posts, boardMaxX, boardDefaultX),
    [boardDefaultX, boardMaxX, posts],
  );
  const boardHeight = Math.max(
    720,
    ...postLayout.map(({ position }) => position.y + boardCardHeight + boardGap),
  );

  useEffect(() => {
    const node = boardRef.current;
    if (!node || !isFieldBoard) return;

    const updateWidth = () => {
      const boardRect = node.getBoundingClientRect();
      const mainRect = node.closest(".main")?.getBoundingClientRect();
      const searchRect = document.querySelector(".topbar.desktop-search .search")?.getBoundingClientRect();
      const nextBoardWidth = Math.round(boardRect.width);
      const defaultStartX = Math.max(0, Math.round((mainRect?.left ?? boardRect.left) - boardRect.left));
      const searchReserve = searchRect
        ? Math.max(0, Math.round(searchRect.right - (mainRect?.left ?? boardRect.left) + boardGap))
        : 0;
      const topChromeReserve = isFieldBoard ? Math.max(420, searchReserve) : 0;
      const maxDefaultX = Math.max(0, nextBoardWidth - boardCardWidth - boardGap - boardRightReserve);
      setBoardWidth(Math.round(boardRect.width));
      setBoardDefaultX(Math.min(maxDefaultX, defaultStartX + topChromeReserve));
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isFieldBoard]);

  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;

    function handlePointerMove(event: PointerEvent) {
      const nextPosition = clampPostPosition({
        x: activeDrag.origin.x + event.clientX - activeDrag.pointerX,
        y: activeDrag.origin.y + event.clientY - activeDrag.pointerY,
      }, boardMaxX);
      previewPositionRef.current = nextPosition;
      setPreviewPosition(nextPosition);
    }

    function handlePointerUp() {
      const finalPosition = previewPositionRef.current;
      if (finalPosition) {
        onMovePost(activeDrag.postId, finalPosition.x, finalPosition.y);
      }
      setDrag(null);
      previewPositionRef.current = null;
      setPreviewPosition(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [boardMaxX, drag, onMovePost]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>, postId: string, position: PostPosition) {
    if (event.button !== 0 || isDragIgnored(event.target)) return;
    if (window.innerWidth < 760) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({
      origin: position,
      pointerX: event.clientX,
      pointerY: event.clientY,
      postId,
    });
    previewPositionRef.current = position;
    setPreviewPosition(position);
  }

  if (posts.length === 0) {
    return <div className="empty wall-board-empty">{emptyText}</div>;
  }

  return (
    <section ref={boardRef} className={className ? `wall-board ${className}` : "wall-board"} aria-label={title}>
      <div className="wall-board-head">
        <span>{title}</span>
        <small>{hint}</small>
      </div>
      <div className="wall-board-canvas" style={{ "--board-content-height": `${boardHeight}px` } as CSSProperties}>
        {postLayout.map(({ post, position }) => {
          const commentCount = commentsByPostId.get(post.id)?.length ?? 0;
          const currentPosition = drag?.postId === post.id && previewPosition ? previewPosition : position;

          return (
            <div
              key={post.id}
              className={drag?.postId === post.id ? "wall-board-item dragging" : "wall-board-item"}
              onPointerDown={(event) => startDrag(event, post.id, currentPosition)}
              style={
                {
                  "--board-x": `${currentPosition.x}px`,
                  "--board-y": `${currentPosition.y}px`,
                } as CSSProperties
              }
            >
              <span className="board-drag-handle" data-drag-handle title="Перетащить карточку" aria-hidden="true" />
              <PostCard
                activeUserId={activeUserId}
                commentCount={commentCount}
                isPinned={pinnedPostIds.has(post.id)}
                isSaved={savedPostIds.has(post.id)}
                post={post}
                repostedPost={post.repostOfId ? postById.get(post.repostOfId) : undefined}
                surface="board"
                user={userById.get(post.authorId)}
                userById={userById}
                wall={wallById.get(post.wallId)}
                onDelete={onDeletePost}
                onEdit={onEditPost}
                onHide={onHidePost}
                onOpenPost={onOpenPost}
                onOpenProfile={onOpenProfile}
                onPin={onPinPost}
                onReact={onReact}
                onRecordView={onRecordView}
                onReport={onReportPost}
                onRepost={onRepost}
                onToggleSave={onToggleSave}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WallAvatar({
  fallback,
  large = false,
  wall,
}: {
  fallback: string;
  large?: boolean;
  wall: Wall;
}) {
  return (
    <span className={large ? "wall-avatar large" : "wall-avatar"}>
      {wall.avatarUrl ? (
        <img src={wall.avatarUrl} alt="" draggable={false} style={getMediaFocusStyle(wall.avatarFocus)} />
      ) : (
        formatWallInitial(fallback)
      )}
    </span>
  );
}

function ChannelName({
  size = "default",
  wall,
}: {
  size?: "default" | "hero";
  wall: Wall;
}) {
  return (
    <span className={size === "hero" ? "channel-name hero" : "channel-name"}>
      <span className="channel-hash" aria-hidden="true">#</span>
      <span className="channel-text">{formatWallChannelName(wall)}</span>
    </span>
  );
}

function WallActionLinks({ buttons }: { buttons: WallActionButton[] }) {
  if (buttons.length === 0) return null;

  return (
    <div className="wall-action-links">
      {buttons.map((button) => (
        <a key={button.id} href={button.url} target="_blank" rel="noreferrer">
          {button.label}
        </a>
      ))}
    </div>
  );
}

function SpacePage({
  activeUser,
  commentsByPostId,
  followedWallIds,
  pinnedPostIds,
  postById,
  posts,
  savedPostIds,
  space,
  userById,
  wallById,
  onCreateSpace,
  onDeletePost,
  onEditPost,
  onFollow,
  onHidePost,
  onOpenPost,
  onOpenProfile,
  onOpenSettings,
  onPinPost,
  onPublish,
  onMovePost,
  onReact,
  onRecordView,
  onReportPost,
  onRepost,
  onToggleSave,
}: {
  activeUser: UserProfile | undefined;
  commentsByPostId: Map<string, Comment[]>;
  followedWallIds: Set<string>;
  pinnedPostIds: Set<string>;
  postById: Map<string, Post>;
  posts: Post[];
  savedPostIds: Set<string>;
  space: Wall | undefined;
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onCreateSpace: () => void;
  onDeletePost: (postId: string) => void;
  onEditPost: (postId: string, text: string) => void;
  onFollow: (wallId: string) => void;
  onHidePost: (postId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onOpenSettings: (wallId: string) => void;
  onPinPost: (postId: string) => void;
  onPublish: (text: string, attachments: MediaAttachment[]) => void;
  onMovePost: (postId: string, x: number, y: number) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReportPost: (postId: string) => void;
  onRepost: (postId: string) => void;
  onToggleSave: (postId: string) => void;
}) {
  if (!space) {
    return (
      <section className="utility-page">
        <div className="empty">Доска не найдена</div>
        <button className="solid-button" onClick={onCreateSpace}>
          <CirclePlus size={16} />
          Новая доска
        </button>
      </section>
    );
  }

  const discussionCount = posts.reduce((sum, post) => sum + (commentsByPostId.get(post.id)?.length ?? 0), 0);
  const viewCount = posts.reduce((sum, post) => sum + getPostViewCount(post), 0);
  const isFollowing = followedWallIds.has(space.id);
  const canPublish = activeUser ? canPublishToWall(space, activeUser.id) : false;
  const canManage = activeUser ? canManageWall(space, activeUser.id) : false;
  const fieldBoardHeight = getBoardCanvasHeight(posts);

  return (
    <section
      className="space-page field-page board-space-page"
      style={{ "--field-board-height": `${fieldBoardHeight}px` } as CSSProperties}
    >
      <div
        className="profile-cover space-cover wall-cover field-wall-cover"
        style={getWallCoverStyle(space)}
      >
        <div className="space-copy">
          <div className="wall-title-row">
            <WallAvatar fallback={space.name} wall={space} />
            <div>
              <span className="space-kicker">Доска</span>
              <h1>
                <ChannelName wall={space} size="hero" />
              </h1>
            </div>
          </div>
          {space.description ? <p>{space.description}</p> : null}
          <WallActionLinks buttons={space.actionButtons ?? []} />
        </div>
        <div className="space-actions">
          <div className="space-stat-row">
            <MiniMetric label="Заметки" value={`${posts.length}`} />
            <MiniMetric label="Ответы" value={`${discussionCount}`} />
            <MiniMetric label="Прочитали" value={formatCompactNumber(viewCount)} />
          </div>
          <div className={canManage ? "space-action-row" : "space-action-row single"}>
            <button className={isFollowing ? "follow-button active" : "follow-button"} onClick={() => onFollow(space.id)}>
              {isFollowing ? <Check size={15} /> : <CirclePlus size={15} />}
              {isFollowing ? "Подписка" : "Подписаться"}
            </button>
            {canManage ? (
              <button className="wall-settings-button" onClick={() => onOpenSettings(space.id)} aria-label="Настройки доски">
                <Settings size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {space.rules ? <p className="profile-bio">{space.rules}</p> : null}

      {canPublish ? (
        <Composer className="desktop-composer field-composer board-composer" targetLabel={`Доска ${formatWallTextName(space)}`} onPublish={onPublish} />
      ) : null}

      <WallBoard
        activeUserId={activeUser?.id}
        className="field-board space-field-board"
        commentsByPostId={commentsByPostId}
        emptyText="На этой доске пока нет заметок"
        hint="перетащи карточки по доске"
        pinnedPostIds={pinnedPostIds}
        postById={postById}
        posts={posts}
        savedPostIds={savedPostIds}
        userById={userById}
        wallById={wallById}
        onDeletePost={onDeletePost}
        onEditPost={onEditPost}
        onHidePost={onHidePost}
        onMovePost={onMovePost}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onPinPost={onPinPost}
        onReact={onReact}
        onRecordView={onRecordView}
        onReportPost={onReportPost}
        onRepost={onRepost}
        onToggleSave={onToggleSave}
      />
      <FieldMiniMap posts={posts} />
    </section>
  );
}

function Composer({
  className = "",
  placeholder = "Новая заметка",
  targetLabel,
  onPublish,
}: {
  className?: string;
  placeholder?: string;
  targetLabel?: string;
  onPublish: (text: string, attachments: MediaAttachment[]) => void;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const [isReading, setIsReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function attachFiles(files: FileList | null) {
    if (!files?.length) return;

    setIsReading(true);
    const next: MediaAttachment[] = [];

    try {
      for (const file of Array.from(files).slice(0, maxFiles - attachments.length)) {
        const type = getMediaKind(file);
        if (!type) continue;

        next.push(await createMediaAttachment(file, type));
      }

      setAttachments((current) => [...current, ...next].slice(0, maxFiles));
    } finally {
      setIsReading(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function submit() {
    if (!text.trim() && attachments.length === 0) return;
    onPublish(text, attachments);
    setText("");
    setAttachments([]);
  }

  return (
    <section className={`composer-card ${className}`.trim()}>
      {targetLabel ? (
        <div className="composer-target">
          <span>Публикация</span>
          <strong>{targetLabel}</strong>
        </div>
      ) : null}

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
      />

      {attachments.length > 0 ? (
        <div className="attachment-preview">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="preview-item">
              <MediaPreview attachment={attachment} compact />
              <button onClick={() => removeAttachment(attachment.id)} aria-label="Удалить медиа">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="composer-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          onChange={(event) => attachFiles(event.target.files)}
        />
        <IconButton label="Добавить изображение" onClick={() => fileInputRef.current?.click()}>
          <ImageIcon size={16} />
        </IconButton>
        <IconButton label="Добавить видео" onClick={() => fileInputRef.current?.click()}>
          <Video size={16} />
        </IconButton>
        <IconButton label="Добавить аудио" onClick={() => fileInputRef.current?.click()}>
          <AudioLines size={16} />
        </IconButton>
        <button
          className="publish"
          disabled={isReading || (!text.trim() && attachments.length === 0)}
          onClick={submit}
          aria-label="Опубликовать"
          title="Опубликовать"
        >
          <Send size={16} />
        </button>
      </div>
    </section>
  );
}

function CreateSpaceDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: CreateSpacePayload) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [publishMode, setPublishMode] = useState<Wall["publishMode"]>("open");
  const [error, setError] = useState("");
  const closeTimerRef = useRef<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  function requestClose() {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 180);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    const nextSlug = slugify(slug || name);
    if (nextName.length < 2) {
      setError("Название слишком короткое");
      return;
    }
    if (!nextSlug) {
      setError("Адрес не получится собрать");
      return;
    }
    onCreate({
      name: nextName,
      slug: nextSlug,
      description: description.trim(),
      rules: rules.trim(),
      publishMode,
    });
  }

  return (
    <div
      className={isClosing ? "create-space-layer closing" : "create-space-layer"}
      onMouseDown={requestClose}
      role="presentation"
    >
      <form className="create-space-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="sheet-title">
          <h2>Новая доска</h2>
          <button type="button" onClick={requestClose} aria-label="Закрыть создание доски">
            <X size={16} />
          </button>
        </div>
        <label>
          <span>Название</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <label>
          <span>Адрес</span>
          <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder={slugify(name) || "доска"} />
        </label>
        <label>
          <span>Описание</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </label>
        <label>
          <span>Правила</span>
          <textarea value={rules} onChange={(event) => setRules(event.target.value)} rows={3} />
        </label>
        <label>
          <span>Кто пишет</span>
          <select value={publishMode} onChange={(event) => setPublishMode(event.target.value as Wall["publishMode"])}>
            <option value="open">Все</option>
            <option value="owner">Только владелец</option>
          </select>
        </label>
        {error ? <div className="inline-error compact">{error}</div> : null}
        <button className="solid-button" disabled={name.trim().length < 2}>
          <CirclePlus size={16} />
          Создать
        </button>
      </form>
    </div>
  );
}

function WallSettingsDialog({
  canDelete,
  wall,
  onClose,
  onDelete,
  onSave,
}: {
  canDelete: boolean;
  wall: Wall;
  onClose: () => void;
  onDelete: () => void;
  onSave: (payload: WallSettingsPayload) => void;
}) {
  const [actionButtons, setActionButtons] = useState<WallActionButton[]>(wall.actionButtons ?? []);
  const [avatarUrl, setAvatarUrl] = useState(wall.avatarUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(wall.bannerUrl ?? "");
  const [name, setName] = useState(wall.name);
  const [avatarFocus, setAvatarFocus] = useState<MediaFocus>(() => getMediaFocus(wall.avatarFocus));
  const [bannerFocus, setBannerFocus] = useState<MediaFocus>(() => getMediaFocus(wall.bannerFocus));
  const [accentColor, setAccentColor] = useState(wall.accentColor ?? wallAccentOptions[0].id);
  const [description, setDescription] = useState(wall.description ?? "");
  const [rules, setRules] = useState(wall.rules ?? "");
  const [publishMode, setPublishMode] = useState<Wall["publishMode"]>(wall.publishMode ?? "open");
  const [mediaError, setMediaError] = useState("");
  const [uploadingTarget, setUploadingTarget] = useState<"avatar" | "banner" | null>(null);
  const [isDeleteArmed, setIsDeleteArmed] = useState(false);
  const accentOption = getWallAccentOption(accentColor);
  const previewStyle = {
    ...getWallAccentCssVars(accentOption),
    ...(bannerUrl ? { "--banner-image": `url(${bannerUrl})` } : {}),
    "--banner-position": formatMediaFocus(bannerFocus),
  } as CSSProperties;
  const previewWall = {
    ...wall,
    avatarUrl: avatarUrl || undefined,
    bannerUrl: bannerUrl || undefined,
    avatarFocus,
    bannerFocus,
    accentColor,
    name: name.trim() || wall.name,
  };
  const canSave = name.trim().length >= 2;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    onSave({
      actionButtons: actionButtons
        .map((button) => ({
          ...button,
          label: button.label.trim().slice(0, 28),
          url: button.url.trim(),
        }))
        .filter((button) => button.label && /^https?:\/\//i.test(button.url))
        .slice(0, 4),
      accentColor,
      avatarFocus,
      avatarUrl,
      bannerFocus,
      bannerUrl,
      description,
      name,
      rules,
      publishMode,
    });
  }

  function updateActionButton(id: string, patch: Partial<WallActionButton>) {
    setActionButtons((current) =>
      current.map((button) => (button.id === id ? { ...button, ...patch } : button)),
    );
  }

  async function uploadWallImage(event: ChangeEvent<HTMLInputElement>, target: "avatar" | "banner") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMediaError("Нужна картинка.");
      return;
    }

    setMediaError("");
    setUploadingTarget(target);

    try {
      const attachment = await createMediaAttachment(file, "image");
      if (target === "avatar") {
        setAvatarUrl(attachment.url);
        setAvatarFocus(defaultMediaFocus);
      } else {
        setBannerUrl(attachment.url);
        setBannerFocus(defaultMediaFocus);
      }
    } catch {
      setMediaError("Не удалось загрузить изображение.");
    } finally {
      setUploadingTarget(null);
    }
  }

  function pickMediaFocus(event: React.PointerEvent<HTMLElement>, target: "avatar" | "banner") {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextFocus = {
      x: Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100))),
      y: Math.max(0, Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100))),
    };
    if (target === "avatar") {
      setAvatarFocus(nextFocus);
    } else {
      setBannerFocus(nextFocus);
    }
  }

  function updateMediaFocus(target: "avatar" | "banner", patch: Partial<MediaFocus>) {
    const setter = target === "avatar" ? setAvatarFocus : setBannerFocus;
    setter((current) => ({
      x: Math.max(0, Math.min(100, Math.round(patch.x ?? current.x))),
      y: Math.max(0, Math.min(100, Math.round(patch.y ?? current.y))),
    }));
  }

  return (
    <div className="mobile-composer-layer" onMouseDown={onClose} role="presentation">
      <form className="space-dialog wall-settings-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <span className="sheet-handle" />
        <div className="sheet-title">
          <h2>Настройки доски</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть настройки доски">
            <X size={16} />
          </button>
        </div>
        <div className="wall-settings-scroll">
        <div className="wall-settings-preview" style={previewStyle}>
          <div className="wall-settings-preview-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="" draggable={false} style={getMediaFocusStyle(avatarFocus)} /> : formatWallInitial(previewWall.name)}
          </div>
          <div>
            <strong>{formatWallChannelName(previewWall)}</strong>
            <span>{description.trim() || "Описание появится здесь."}</span>
          </div>
        </div>
        <label>
          <span>Название</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="Название доски"
          />
        </label>
        <div className="wall-media-editors">
          <section className="wall-media-editor">
            <div className="wall-media-editor-head">
              <span>Аватар</span>
              <small>Значок доски</small>
            </div>
            <div
              className={avatarUrl ? "wall-avatar-preview editable" : "wall-avatar-preview"}
              onPointerDown={(event) => avatarUrl ? pickMediaFocus(event, "avatar") : undefined}
              onPointerMove={(event) => avatarUrl && event.buttons === 1 ? pickMediaFocus(event, "avatar") : undefined}
              style={getMediaFocusVars(avatarFocus)}
              title={avatarUrl ? "Перетащи фокус кадра" : undefined}
            >
              {avatarUrl ? <img src={avatarUrl} alt="" draggable={false} style={getMediaFocusStyle(avatarFocus)} /> : formatWallInitial(previewWall.name)}
              {avatarUrl ? <span className="wall-media-focus-dot" aria-hidden="true" /> : null}
            </div>
            <div className="wall-media-actions">
              <label className="wall-media-upload">
                {uploadingTarget === "avatar" ? <Loader2 size={15} className="spin" /> : <ImageIcon size={15} />}
                <span>Загрузить</span>
                <input type="file" accept="image/*" onChange={(event) => uploadWallImage(event, "avatar")} />
              </label>
              {avatarUrl ? (
                <button type="button" className="wall-media-clear" onClick={() => {
                  setAvatarUrl("");
                  setAvatarFocus(defaultMediaFocus);
                }}>
                  Убрать
                </button>
              ) : null}
            </div>
            {avatarUrl ? (
              <MediaFocusControls focus={avatarFocus} onChange={(patch) => updateMediaFocus("avatar", patch)} />
            ) : null}
          </section>
          <section className="wall-media-editor wide">
            <div className="wall-media-editor-head">
              <span>Баннер</span>
              <small>Шапка доски</small>
            </div>
            <div
              className={bannerUrl ? "wall-banner-preview editable" : "wall-banner-preview"}
              onPointerDown={(event) => bannerUrl ? pickMediaFocus(event, "banner") : undefined}
              onPointerMove={(event) => bannerUrl && event.buttons === 1 ? pickMediaFocus(event, "banner") : undefined}
              style={
                bannerUrl
                  ? { backgroundImage: `url(${bannerUrl})`, backgroundPosition: formatMediaFocus(bannerFocus), ...getMediaFocusVars(bannerFocus) }
                  : undefined
              }
              title={bannerUrl ? "Перетащи фокус кадра" : undefined}
            >
              {bannerUrl ? null : "Баннер"}
              {bannerUrl ? <span className="wall-media-focus-dot" aria-hidden="true" /> : null}
            </div>
            <div className="wall-media-actions">
              <label className="wall-media-upload">
                {uploadingTarget === "banner" ? <Loader2 size={15} className="spin" /> : <ImageIcon size={15} />}
                <span>Загрузить</span>
                <input type="file" accept="image/*" onChange={(event) => uploadWallImage(event, "banner")} />
              </label>
              {bannerUrl ? (
                <button type="button" className="wall-media-clear" onClick={() => {
                  setBannerUrl("");
                  setBannerFocus(defaultMediaFocus);
                }}>
                  Убрать
                </button>
              ) : null}
            </div>
            {bannerUrl ? (
              <MediaFocusControls focus={bannerFocus} onChange={(patch) => updateMediaFocus("banner", patch)} />
            ) : null}
          </section>
        </div>
        {mediaError ? <div className="inline-error compact">{mediaError}</div> : null}
        <div className="wall-color-editor">
          <span>Цвет доски</span>
          <div className="wall-color-options" role="radiogroup" aria-label="Цвет доски">
            {wallAccentOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={accentColor === option.id ? "active" : ""}
                onClick={() => setAccentColor(option.id)}
                role="radio"
                aria-checked={accentColor === option.id}
                style={{ "--wall-swatch": option.accent } as CSSProperties}
              >
                <i />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        <label>
          <span>Описание</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label>
          <span>Правила</span>
          <textarea value={rules} onChange={(event) => setRules(event.target.value)} />
        </label>
        <label>
          <span>Публикация</span>
          <select value={publishMode} onChange={(event) => setPublishMode(event.target.value as Wall["publishMode"])}>
            <option value="open">Все</option>
            <option value="owner">Только владелец</option>
          </select>
        </label>
        <div className="wall-button-editor">
          <div className="wall-button-editor-head">
            <span>Кнопки</span>
            <button
              type="button"
              disabled={actionButtons.length >= 4}
              onClick={() =>
                setActionButtons((current) => [
                  ...current,
                  { id: crypto.randomUUID(), label: "", url: "" },
                ])
              }
            >
              <CirclePlus size={14} />
              Добавить
            </button>
          </div>
          {actionButtons.length === 0 ? <small>Можно добавить ссылки доски.</small> : null}
          {actionButtons.map((button) => (
            <div className="wall-button-row" key={button.id}>
              <input
                value={button.label}
                onChange={(event) => updateActionButton(button.id, { label: event.target.value })}
                placeholder="Название"
              />
              <input
                value={button.url}
                onChange={(event) => updateActionButton(button.id, { url: event.target.value })}
                placeholder="https://..."
              />
              <button
                type="button"
                onClick={() => setActionButtons((current) => current.filter((item) => item.id !== button.id))}
                aria-label="Удалить кнопку"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        </div>
        <div className="wall-settings-actions">
          <button className="solid-button" disabled={!canSave}>
            <Check size={16} />
            Сохранить
          </button>
          {canDelete ? (
            <button
              className={isDeleteArmed ? "danger-button armed" : "danger-button"}
              type="button"
              onClick={() => {
                if (isDeleteArmed) {
                  onDelete();
                  return;
                }
                setIsDeleteArmed(true);
              }}
            >
              <Trash2 size={16} />
              {isDeleteArmed ? "Точно удалить" : "Удалить доску"}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function MediaFocusControls({
  focus,
  onChange,
}: {
  focus: MediaFocus;
  onChange: (patch: Partial<MediaFocus>) => void;
}) {
  return (
    <div className="wall-focus-controls" aria-label="Кадр">
      <div>
        <span>Кадр</span>
        <button type="button" onClick={() => onChange(defaultMediaFocus)}>
          Центр
        </button>
      </div>
      <label>
        <span>X</span>
        <input
          type="range"
          min={0}
          max={100}
          value={focus.x}
          onChange={(event) => onChange({ x: Number(event.target.value) })}
        />
      </label>
      <label>
        <span>Y</span>
        <input
          type="range"
          min={0}
          max={100}
          value={focus.y}
          onChange={(event) => onChange({ y: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}

function MobileComposerSheet({
  targetLabel,
  onClose,
  onPublish,
}: {
  targetLabel?: string;
  onClose: () => void;
  onPublish: (text: string, attachments: MediaAttachment[]) => void;
}) {
  const closeTimerRef = useRef<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  function requestClose() {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 180);
  }

  return (
    <div
      className={isClosing ? "mobile-composer-layer closing" : "mobile-composer-layer"}
      onMouseDown={requestClose}
      role="presentation"
    >
      <div className="mobile-composer-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <span className="sheet-handle" />
        <div className="sheet-title">
          <h2>Новая заметка</h2>
          <button onClick={requestClose} aria-label="Закрыть создание заметки">
            <X size={16} />
          </button>
        </div>
        <Composer className="sheet-composer" targetLabel={targetLabel} onPublish={onPublish} />
      </div>
    </div>
  );
}

function PostCard({
  activeUserId,
  commentCount,
  isPinned,
  isSaved,
  objectKind,
  post,
  repostedPost,
  surface = "stream",
  user,
  userById,
  wall,
  onDelete,
  onEdit,
  onHide,
  onOpenPost,
  onOpenProfile,
  onPin,
  onReact,
  onRecordView,
  onReport,
  onRepost,
  onToggleSave,
}: {
  activeUserId: string | undefined;
  commentCount: number;
  isPinned: boolean;
  isSaved: boolean;
  objectKind?: ObjectKind;
  post: Post;
  repostedPost?: Post;
  surface?: "stream" | "field" | "board";
  user: UserProfile | undefined;
  userById: Map<string, UserProfile>;
  wall: Wall | undefined;
  onDelete: (postId: string) => void;
  onEdit: (postId: string, text: string) => void;
  onHide: (postId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onPin: (postId: string) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReport: (postId: string) => void;
  onRepost: (postId: string) => void;
  onToggleSave: (postId: string) => void;
}) {
  const [reacting, setReacting] = useState(false);
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);
  const [displayReactions, setDisplayReactions] = useState(post.reactions);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(post.text);
  const articleRef = useRef<HTMLElement | null>(null);
  const reactionTimerRef = useRef<number | null>(null);
  const reactionBurstTimersRef = useRef<number[]>([]);
  const displayReactionsRef = useRef(post.reactions);
  const flushFrameRef = useRef<number | null>(null);
  const lastBurstAtRef = useRef(0);
  const pendingReactionsRef = useRef(0);
  const queuedBurstTimerRef = useRef<number | null>(null);
  const reactingRef = useRef(false);
  const author = user ?? {
    id: post.authorId,
    name: "пользователь",
    handle: "@user",
    bio: "",
    joinedAt: Date.now(),
    timeOnSiteMinutes: 0,
  };
  const isOwnPost = activeUserId === post.authorId;
  const repostAuthor = repostedPost ? userById.get(repostedPost.authorId) : undefined;
  const placeLabel = getWallDisplayName(wall, userById);
  const fieldObjectKind = objectKind ?? getPostObjectKind(post, commentCount);

  useEffect(() => {
    return () => {
      if (flushFrameRef.current) {
        window.cancelAnimationFrame(flushFrameRef.current);
        flushFrameRef.current = null;
      }
      if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
      if (queuedBurstTimerRef.current) window.clearTimeout(queuedBurstTimerRef.current);
      reactionBurstTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      commitPendingReactions();
    };
  }, []);

  useEffect(() => {
    setDraftText(post.text);
  }, [post.text]);

  useEffect(() => {
    const nextReactions = post.reactions + pendingReactionsRef.current;
    displayReactionsRef.current = nextReactions;
    setDisplayReactions(nextReactions);
  }, [post.reactions]);

  useEffect(() => {
    const element = articleRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    let viewTimer: number | null = null;
    let didRecord = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (didRecord) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          if (viewTimer) return;
          viewTimer = window.setTimeout(() => {
            didRecord = true;
            onRecordView(post.id);
            observer.disconnect();
          }, postViewVisibleMs);
          return;
        }

        if (viewTimer) {
          window.clearTimeout(viewTimer);
          viewTimer = null;
        }
      },
      { threshold: [0, 0.55, 0.8] },
    );

    observer.observe(element);

    return () => {
      if (viewTimer) window.clearTimeout(viewTimer);
      observer.disconnect();
    };
  }, [onRecordView, post.id]);

  function commitPendingReactions() {
    const reactionAmount = pendingReactionsRef.current;
    if (reactionAmount === 0) return;

    pendingReactionsRef.current = 0;
    onReact(post.id, reactionAmount);
  }

  function queueReactionFrame() {
    if (flushFrameRef.current) return;

    flushFrameRef.current = window.requestAnimationFrame(() => {
      flushFrameRef.current = null;
      setDisplayReactions(displayReactionsRef.current);
      commitPendingReactions();
    });
  }

  function spawnReactionBurst(force: number) {
    lastBurstAtRef.current = performance.now();

    const burst: ReactionBurst = {
      id: crypto.randomUUID(),
      seed: Math.random() * Math.PI * 2,
      force,
    };

    setReactionBursts((current) => [...current.slice(-(maxReactionBursts - 1)), burst]);

    const burstTimer = window.setTimeout(() => {
      setReactionBursts((current) => current.filter((item) => item.id !== burst.id));
      reactionBurstTimersRef.current = reactionBurstTimersRef.current.filter(
        (timer) => timer !== burstTimer,
      );
    }, reactionParticleLifetimeMs);

    reactionBurstTimersRef.current.push(burstTimer);
  }

  function queueReactionBurst(force: number) {
    const elapsed = performance.now() - lastBurstAtRef.current;

    if (elapsed >= reactionBurstCadenceMs) {
      spawnReactionBurst(force);
      return;
    }

    if (queuedBurstTimerRef.current) return;

    queuedBurstTimerRef.current = window.setTimeout(() => {
      queuedBurstTimerRef.current = null;
      spawnReactionBurst(displayReactionsRef.current);
    }, reactionBurstCadenceMs - elapsed);
  }

  function keepReactionShellAlive() {
    if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);

    if (!reactingRef.current) {
      reactingRef.current = true;
      setReacting(true);
    }

    reactionTimerRef.current = window.setTimeout(() => {
      reactingRef.current = false;
      setReacting(false);
      reactionTimerRef.current = null;
    }, reactionIdleMs);
  }

  function handleReact() {
    const nextReactions = displayReactionsRef.current + 1;

    displayReactionsRef.current = nextReactions;
    pendingReactionsRef.current += 1;
    queueReactionFrame();
    queueReactionBurst(nextReactions);
    keepReactionShellAlive();
  }

  function saveEdit() {
    if (!draftText.trim()) return;
    onEdit(post.id, draftText);
    setIsEditing(false);
    setIsMenuOpen(false);
  }

  function copyPostLink() {
    const url = `${window.location.origin}/post/${post.id}`;
    void navigator.clipboard?.writeText(url);
    setIsMenuOpen(false);
  }

  const cardClassName = [
    "post-card",
    surface === "field" ? "field-object" : "",
    surface === "board" ? "board-card" : "",
    surface === "field" ? `object-${fieldObjectKind}` : "",
    post.attachments.length > 0 ? "has-media" : "",
    post.repostOfId ? "is-repost" : "",
    isPinned ? "is-pinned" : "",
    reacting ? "reaction-wake" : "",
    isMenuOpen ? "menu-open" : "",
  ].filter(Boolean).join(" ");

  return (
    <article ref={articleRef} className={cardClassName}>
      {surface === "field" ? (
        <div className="object-topline">
          <span>{getObjectKindLabel(fieldObjectKind)}</span>
          <i>{getObjectSignal(post, commentCount)}</i>
        </div>
      ) : null}

      <header className="post-header">
        <button className="avatar-button" onClick={() => onOpenProfile(author.id)}>
          <Avatar user={author} />
        </button>
        <button className="author-button" onClick={() => onOpenProfile(author.id)}>
          <strong>{author.name}</strong>
          <span className="post-meta">
            {isPinned ? "Закреплено · " : ""}
            {placeLabel} ·{" "}
            {formatRelativeTime(post.createdAt)}
            {post.editedAt ? " · изменено" : ""}
          </span>
        </button>
        <button
          className="post-menu-trigger"
          onClick={() => setIsMenuOpen((value) => !value)}
          aria-label="Действия с заметкой"
        >
          <MoreHorizontal size={17} />
        </button>
        {isMenuOpen ? (
          <div className="post-menu">
            <button onClick={() => onOpenPost(post.id)}>
              <MessageCircle size={15} />
              Открыть ответы
            </button>
            <button onClick={() => onToggleSave(post.id)}>
              <Bookmark size={15} />
              {isSaved ? "Из сохранённого" : "В сохранённое"}
            </button>
            <button onClick={() => onRepost(post.id)}>
              <Repeat2 size={15} />
              Поделиться на доске
            </button>
            <button onClick={() => onPin(post.id)}>
              <Pin size={15} />
              {isPinned ? "Открепить" : "Закрепить"}
            </button>
            <button onClick={copyPostLink}>
              <ShareLinkIcon />
              Скопировать ссылку
            </button>
            {isOwnPost ? (
              <button onClick={() => setIsEditing(true)}>
                <Pencil size={15} />
                Править
              </button>
            ) : null}
            {isOwnPost ? (
              <button className="danger-action" onClick={() => onDelete(post.id)}>
                <Trash2 size={15} />
                Удалить
              </button>
            ) : (
              <>
                <button onClick={() => onHide(post.id)}>
                  <X size={15} />
                  Скрыть
                </button>
                <button className="danger-action" onClick={() => onReport(post.id)}>
                  <Flag size={15} />
                  Жалоба
                </button>
              </>
            )}
          </div>
        ) : null}
      </header>

      {isEditing ? (
        <div className="post-edit">
          <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} autoFocus />
          <div>
            <button className="solid-button" onClick={saveEdit}>
              <Check size={16} />
              Сохранить
            </button>
            <button className="ghost-button" onClick={() => setIsEditing(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : post.text ? (
        <p className="post-text">{post.text}</p>
      ) : null}

      {post.attachments.length > 0 ? (
        <div className={`media-grid count-${Math.min(post.attachments.length, 3)}`}>
          {post.attachments.map((attachment) => (
            <MediaPreview key={attachment.id} attachment={attachment} />
          ))}
        </div>
      ) : null}

      {repostedPost ? (
        <button className="repost-card" onClick={() => onOpenPost(repostedPost.id)}>
          <Repeat2 size={15} />
          <span>
            <strong>{repostAuthor?.name ?? "Пользователь"}</strong>
            <small>{repostedPost.text || "Заметка"}</small>
          </span>
        </button>
      ) : null}

      <footer className="post-footer">
        <button
          className={reacting ? "react-button reacting" : "react-button"}
          onClick={handleReact}
          aria-label={`Добавить огонёк. Сейчас ${displayReactions}`}
        >
          <span className="react-icon">
            <Flame size={16} />
          </span>
          <span className="react-count">{displayReactions}</span>
          <ReactionParticles bursts={reactionBursts} />
        </button>
        <button className="post-stat comments-stat" onClick={() => onOpenPost(post.id)} aria-label={`Ответы ${commentCount}`}>
          <MessageCircle size={16} />
          <span className="stat-label">Ответы</span>
          {commentCount > 0 ? <span className="stat-count">{commentCount}</span> : null}
        </button>
        <span
          className="post-stat passive views-stat"
          title="Прочитали"
          aria-label={`Прочитали ${getPostViewCount(post)}`}
        >
          <Eye size={16} />
          <span className="views-copy">
            <strong>{formatCompactNumber(getPostViewCount(post))}</strong>
          </span>
        </span>
        <button
          className={isSaved ? "post-stat active" : "post-stat"}
          onClick={() => onToggleSave(post.id)}
          aria-label={isSaved ? "Убрать из сохранённого" : "В сохранённое"}
        >
          <Bookmark size={16} />
        </button>
        <button className="post-stat" onClick={() => onRepost(post.id)} aria-label="Поделиться на доске">
          <Repeat2 size={16} />
        </button>
      </footer>
    </article>
  );
}

function ShareLinkIcon() {
  return <Link2 size={15} />;
}

function PostThreadPage({
  activeUser,
  comments,
  pinnedPostIds,
  post,
  postById,
  savedPostIds,
  userById,
  wallById,
  onAddComment,
  onBack,
  onDeleteComment,
  onDeletePost,
  onEditComment,
  onEditPost,
  onHideComment,
  onHidePost,
  onOpenProfile,
  onPinPost,
  onReact,
  onReactComment,
  onRecordView,
  onReportComment,
  onReportPost,
  onRepost,
  onToggleSave,
}: {
  activeUser: UserProfile | undefined;
  comments: Comment[];
  pinnedPostIds: Set<string>;
  post: Post | undefined;
  postById: Map<string, Post>;
  savedPostIds: Set<string>;
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onAddComment: (postId: string, parentId: string | undefined, text: string, attachments: MediaAttachment[]) => void;
  onBack: () => void;
  onDeleteComment: (commentId: string) => void;
  onDeletePost: (postId: string) => void;
  onEditComment: (commentId: string, text: string) => void;
  onEditPost: (postId: string, text: string) => void;
  onHideComment: (commentId: string) => void;
  onHidePost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onPinPost: (postId: string) => void;
  onReact: (postId: string, amount?: number) => void;
  onReactComment: (commentId: string) => void;
  onRecordView: (postId: string) => void;
  onReportComment: (commentId: string) => void;
  onReportPost: (postId: string) => void;
  onRepost: (postId: string) => void;
  onToggleSave: (postId: string) => void;
}) {
  if (!post) return <div className="empty">Заметка не найдена</div>;

  const rootComments = comments.filter((comment) => !comment.parentId);
  const repliesByParentId = new Map<string, Comment[]>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    const replies = repliesByParentId.get(comment.parentId) ?? [];
    replies.push(comment);
    repliesByParentId.set(comment.parentId, replies);
  }

  return (
    <section className="post-thread-page">
      <div className="page-head compact thread-head">
        <button className="thread-back" onClick={onBack}>
          <ArrowLeft size={17} />
          Поле
        </button>
        <h1>Заметка</h1>
      </div>

      <PostCard
        activeUserId={activeUser?.id}
        commentCount={comments.length}
        isPinned={pinnedPostIds.has(post.id)}
        isSaved={savedPostIds.has(post.id)}
        post={post}
        repostedPost={post.repostOfId ? postById.get(post.repostOfId) : undefined}
        user={userById.get(post.authorId)}
        userById={userById}
        wall={wallById.get(post.wallId)}
        onDelete={onDeletePost}
        onEdit={onEditPost}
        onHide={onHidePost}
        onOpenPost={() => undefined}
        onOpenProfile={onOpenProfile}
        onPin={onPinPost}
        onReact={onReact}
        onRecordView={onRecordView}
        onReport={onReportPost}
        onRepost={onRepost}
        onToggleSave={onToggleSave}
      />

      <section className="comments-panel">
        <div className="panel-title">
          <MessageCircle size={17} />
          <h2>Ответы</h2>
          <span>{comments.length}</span>
        </div>

        {activeUser ? (
          <Composer
            className="comment-composer"
            placeholder="Ответ"
            onPublish={(text, attachments) => onAddComment(post.id, undefined, text, attachments)}
          />
        ) : null}

        <div className="comment-list">
          {rootComments.length === 0 ? (
            <div className="empty small">Ответов пока нет</div>
          ) : (
            rootComments.map((comment) => (
              <CommentCard
                key={comment.id}
                activeUser={activeUser}
                comment={comment}
                replies={repliesByParentId.get(comment.id) ?? []}
                userById={userById}
                onDelete={onDeleteComment}
                onEdit={onEditComment}
                onHide={onHideComment}
                onOpenProfile={onOpenProfile}
                onReact={onReactComment}
                onReport={onReportComment}
                onReply={(text, attachments) => onAddComment(post.id, comment.id, text, attachments)}
              />
            ))
          )}
        </div>
      </section>
    </section>
  );
}

function CommentCard({
  activeUser,
  comment,
  replies,
  userById,
  onDelete,
  onEdit,
  onHide,
  onOpenProfile,
  onReact,
  onReport,
  onReply,
}: {
  activeUser: UserProfile | undefined;
  comment: Comment;
  replies: Comment[];
  userById: Map<string, UserProfile>;
  onDelete: (commentId: string) => void;
  onEdit: (commentId: string, text: string) => void;
  onHide: (commentId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onReact: (commentId: string) => void;
  onReport: (commentId: string) => void;
  onReply: (text: string, attachments: MediaAttachment[]) => void;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(comment.text);
  const author = userById.get(comment.authorId) ?? {
    id: comment.authorId,
    name: "пользователь",
    handle: "@user",
    bio: "",
    joinedAt: Date.now(),
    timeOnSiteMinutes: 0,
  };
  const isOwn = activeUser?.id === comment.authorId;

  useEffect(() => {
    setDraftText(comment.text);
  }, [comment.text]);

  function saveEdit() {
    if (!draftText.trim()) return;
    onEdit(comment.id, draftText);
    setIsEditing(false);
    setIsMenuOpen(false);
  }

  function copyCommentLink() {
    const url = `${window.location.origin}/post/${comment.postId}#comment-${comment.id}`;
    void navigator.clipboard?.writeText(url);
    setIsMenuOpen(false);
  }

  return (
    <article className="comment-card" id={`comment-${comment.id}`}>
      <header>
        <button className="avatar-button" onClick={() => onOpenProfile(author.id)}>
          <Avatar user={author} />
        </button>
        <button className="author-button" onClick={() => onOpenProfile(author.id)}>
          <strong>{author.name}</strong>
          <span>
            {formatRelativeTime(comment.createdAt)}
            {comment.editedAt ? " · изменено" : ""}
          </span>
        </button>
        <button
          className="comment-menu-trigger"
          onClick={() => setIsMenuOpen((value) => !value)}
          aria-label="Действия с ответом"
        >
          <MoreHorizontal size={16} />
        </button>
        {isMenuOpen ? (
          <div className="comment-menu">
            <button onClick={copyCommentLink}>
              <Link2 size={14} />
              Ссылка
            </button>
            {isOwn ? (
              <button onClick={() => setIsEditing(true)}>
                <Pencil size={14} />
                Править
              </button>
            ) : null}
            {isOwn ? (
              <button className="danger-action" onClick={() => onDelete(comment.id)}>
                <Trash2 size={14} />
                Удалить
              </button>
            ) : (
              <>
                <button onClick={() => onHide(comment.id)}>
                  <X size={14} />
                  Скрыть
                </button>
                <button className="danger-action" onClick={() => onReport(comment.id)}>
                  <Flag size={14} />
                  Жалоба
                </button>
              </>
            )}
          </div>
        ) : null}
      </header>

      {isEditing ? (
        <div className="comment-edit">
          <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} autoFocus />
          <div>
            <button className="solid-button" onClick={saveEdit}>
              <Check size={15} />
              Сохранить
            </button>
            <button className="ghost-button" onClick={() => setIsEditing(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : comment.text ? (
        <p>{comment.text}</p>
      ) : null}

      {comment.attachments.length > 0 ? (
        <div className={`media-grid count-${Math.min(comment.attachments.length, 3)}`}>
          {comment.attachments.map((attachment) => (
            <MediaPreview key={attachment.id} attachment={attachment} />
          ))}
        </div>
      ) : null}

      <footer>
        <button onClick={() => onReact(comment.id)}>
          <Flame size={15} />
          {comment.reactions}
        </button>
        {activeUser ? (
          <button onClick={() => setIsReplying((value) => !value)}>
            <CornerDownRight size={15} />
            Ответить
          </button>
        ) : null}
      </footer>

      {isReplying ? (
        <Composer
          className="comment-composer reply-composer"
          placeholder="Ответ"
          onPublish={(text, attachments) => {
            onReply(text, attachments);
            setIsReplying(false);
          }}
        />
      ) : null}

      {replies.length > 0 ? (
        <div className="reply-list">
          {replies.map((reply) => (
            <CommentReply
              key={reply.id}
              activeUser={activeUser}
              comment={reply}
              user={userById.get(reply.authorId)}
              onDelete={onDelete}
              onEdit={onEdit}
              onHide={onHide}
              onOpenProfile={onOpenProfile}
              onReact={onReact}
              onReport={onReport}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CommentReply({
  activeUser,
  comment,
  user,
  onDelete,
  onEdit,
  onHide,
  onOpenProfile,
  onReact,
  onReport,
}: {
  activeUser: UserProfile | undefined;
  comment: Comment;
  user: UserProfile | undefined;
  onDelete: (commentId: string) => void;
  onEdit: (commentId: string, text: string) => void;
  onHide: (commentId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onReact: (commentId: string) => void;
  onReport: (commentId: string) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(comment.text);
  const author = user ?? {
    id: comment.authorId,
    name: "пользователь",
    handle: "@user",
    bio: "",
    joinedAt: Date.now(),
    timeOnSiteMinutes: 0,
  };
  const isOwn = activeUser?.id === comment.authorId;

  useEffect(() => {
    setDraftText(comment.text);
  }, [comment.text]);

  function saveEdit() {
    if (!draftText.trim()) return;
    onEdit(comment.id, draftText);
    setIsEditing(false);
    setIsMenuOpen(false);
  }

  function copyCommentLink() {
    const url = `${window.location.origin}/post/${comment.postId}#comment-${comment.id}`;
    void navigator.clipboard?.writeText(url);
    setIsMenuOpen(false);
  }

  return (
    <article className="comment-card reply" id={`comment-${comment.id}`}>
      <header>
        <button className="avatar-button" onClick={() => onOpenProfile(author.id)}>
          <Avatar user={author} />
        </button>
        <button className="author-button" onClick={() => onOpenProfile(author.id)}>
          <strong>{author.name}</strong>
          <span>
            {formatRelativeTime(comment.createdAt)}
            {comment.editedAt ? " · изменено" : ""}
          </span>
        </button>
        <button
          className="comment-menu-trigger"
          onClick={() => setIsMenuOpen((value) => !value)}
          aria-label="Действия с ответом"
        >
          <MoreHorizontal size={16} />
        </button>
        {isMenuOpen ? (
          <div className="comment-menu">
            <button onClick={copyCommentLink}>
              <Link2 size={14} />
              Ссылка
            </button>
            {isOwn ? (
              <button onClick={() => setIsEditing(true)}>
                <Pencil size={14} />
                Править
              </button>
            ) : null}
            {isOwn ? (
              <button className="danger-action" onClick={() => onDelete(comment.id)}>
                <Trash2 size={14} />
                Удалить
              </button>
            ) : (
              <>
                <button onClick={() => onHide(comment.id)}>
                  <X size={14} />
                  Скрыть
                </button>
                <button className="danger-action" onClick={() => onReport(comment.id)}>
                  <Flag size={14} />
                  Жалоба
                </button>
              </>
            )}
          </div>
        ) : null}
      </header>
      {isEditing ? (
        <div className="comment-edit">
          <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} autoFocus />
          <div>
            <button className="solid-button" onClick={saveEdit}>
              <Check size={15} />
              Сохранить
            </button>
            <button className="ghost-button" onClick={() => setIsEditing(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : comment.text ? (
        <p>{comment.text}</p>
      ) : null}
      {comment.attachments.length > 0 ? (
        <div className={`media-grid count-${Math.min(comment.attachments.length, 3)}`}>
          {comment.attachments.map((attachment) => (
            <MediaPreview key={attachment.id} attachment={attachment} />
          ))}
        </div>
      ) : null}
      <footer>
        <button onClick={() => onReact(comment.id)}>
          <Flame size={15} />
          {comment.reactions}
        </button>
      </footer>
    </article>
  );
}

function ReactionParticles({ bursts }: { bursts: ReactionBurst[] }) {
  if (bursts.length === 0) return null;

  return (
    <span className="reaction-bursts" aria-hidden="true">
      {bursts.map((burst) =>
        Array.from({ length: reactionPieces }, (_, index) => {
          const angle = burst.seed + (Math.PI * 2 * index) / reactionPieces;
          const distance = 44 + (index % 6) * 9 + Math.min(burst.force, 100) * 0.18;
          const verticalPull = 0.72 + (index % 4) * 0.05;

          return (
            <span
              key={`${burst.id}-${index}`}
              style={
                {
                  "--rx": `${Math.cos(angle) * distance}px`,
                  "--ry": `${Math.sin(angle) * distance * verticalPull - 12}px`,
                  "--spin": `${burst.seed * 48 + index * 31}deg`,
                  "--delay": `${index * 0.004}s`,
                  "--scale": `${0.82 + (index % 5) * 0.16}`,
                } as CSSProperties
              }
            />
          );
        }),
      )}
    </span>
  );
}

function Leaderboard({
  commentsByPostId,
  posts,
  savedPostIds,
  users,
  userById,
  wallById,
  onOpenPost,
  onOpenProfile,
}: {
  commentsByPostId: Map<string, Comment[]>;
  posts: Post[];
  savedPostIds: Set<string>;
  users: UserProfile[];
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
}) {
  const stats = useMemo(() => buildUserStats(users, posts), [posts, users]);
  const topByPosts = [...stats].sort((a, b) => b.posts - a.posts || b.reactions - a.reactions);
  const topByReactions = [...stats].sort((a, b) => b.reactions - a.reactions || b.posts - a.posts);
  const topByTime = [...stats].sort((a, b) => b.timeOnSiteMinutes - a.timeOnSiteMinutes);
  const hotPosts = [...posts]
    .sort((a, b) => getPulseScore(b, commentsByPostId) - getPulseScore(a, commentsByPostId))
    .slice(0, 6);
  const savedPosts = [...posts]
    .filter((post) => savedPostIds.has(post.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);

  return (
    <section className="utility-page">
      <div className="page-head">
        <h1>Пульс</h1>
      </div>

      <div className="rank-grid">
        <RankPanel title="Заметки" icon={<Trophy size={17} />}>
          {topByPosts.map((item, index) => (
            <RankUserRow key={item.user.id} index={index} item={item} value={`${item.posts}`} onOpenProfile={onOpenProfile} />
          ))}
        </RankPanel>

        <RankPanel title="Огоньки" icon={<Flame size={17} />}>
          {topByReactions.map((item, index) => (
            <RankUserRow key={item.user.id} index={index} item={item} value={`${item.reactions}`} onOpenProfile={onOpenProfile} />
          ))}
        </RankPanel>

        <RankPanel title="В доме" icon={<Clock size={17} />}>
          {topByTime.map((item, index) => (
            <RankUserRow
              key={item.user.id}
              index={index}
              item={item}
              value={formatMinutes(item.timeOnSiteMinutes)}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </RankPanel>
      </div>

      <section className="panel pulse-panel">
        <div className="panel-title">
          <Flame size={17} />
          <h2>Живые заметки</h2>
        </div>
        <div className="rank-list">
          {hotPosts.map((post, index) => {
            const author = userById.get(post.authorId);
            const wallName = getWallDisplayName(wallById.get(post.wallId), userById);
            const answers = commentsByPostId.get(post.id)?.length ?? 0;
            return (
              <button className="rank-row as-button pulse-row" key={post.id} onClick={() => onOpenPost(post.id)}>
                <span className="rank-index">{index + 1}</span>
                <div className="rank-body">
                  <strong>{post.text || "Заметка"}</strong>
                  <small>{author?.name ?? "пользователь"} · {wallName} · {answers} отв.</small>
                </div>
                <b>{post.reactions}</b>
              </button>
            );
          })}
        </div>
      </section>

      {savedPosts.length > 0 ? (
        <section className="panel pulse-panel">
          <div className="panel-title">
            <Bookmark size={17} />
            <h2>Сохранённое</h2>
          </div>
          <div className="rank-list">
            {savedPosts.map((post) => {
              const author = userById.get(post.authorId);
              const wallName = getWallDisplayName(wallById.get(post.wallId), userById);
              return (
                <button className="rank-row as-button pulse-row" key={post.id} onClick={() => onOpenPost(post.id)}>
                  <div className="rank-body">
                    <strong>{post.text || "Заметка"}</strong>
                    <small>{author?.name ?? "пользователь"} · {wallName}</small>
                  </div>
                  <b>{formatCompactNumber(getPostViewCount(post))}</b>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ProfilePage({
  activeUser,
  commentsByPostId,
  followedUserIds,
  pinnedPostIds,
  postById,
  posts,
  profileWall,
  savedPostIds,
  user,
  userById,
  wallById,
  onDeletePost,
  onEditPost,
  onFollow,
  onHidePost,
  onOpenPost,
  onOpenProfile,
  onOpenSettings,
  onPinPost,
  onPublish,
  onMovePost,
  onReact,
  onRecordView,
  onReportPost,
  onRepost,
  onToggleSave,
}: {
  activeUser: UserProfile | undefined;
  commentsByPostId: Map<string, Comment[]>;
  followedUserIds: Set<string>;
  pinnedPostIds: Set<string>;
  postById: Map<string, Post>;
  posts: Post[];
  profileWall: Wall | undefined;
  savedPostIds: Set<string>;
  user: UserProfile | undefined;
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onDeletePost: (postId: string) => void;
  onEditPost: (postId: string, text: string) => void;
  onFollow: (userId: string) => void;
  onHidePost: (postId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onOpenSettings: () => void;
  onPinPost: (postId: string) => void;
  onPublish: (text: string, attachments: MediaAttachment[]) => void;
  onMovePost: (postId: string, x: number, y: number) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReportPost: (postId: string) => void;
  onRepost: (postId: string) => void;
  onToggleSave: (postId: string) => void;
}) {
  if (!user) return <div className="empty">Профиль не найден</div>;

  const profileWallId = getProfileWallId(user.id);
  const userPosts = posts
    .filter((post) => post.authorId === user.id || post.wallId === profileWallId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const views = userPosts.reduce((sum, post) => sum + getPostViewCount(post), 0);
  const comments = userPosts.reduce((sum, post) => sum + (commentsByPostId.get(post.id)?.length ?? 0), 0);
  const isOwnProfile = activeUser?.id === user.id;
  const fieldBoardHeight = getBoardCanvasHeight(userPosts);

  return (
    <section
      className="profile-page field-page board-space-page profile-board-page"
      style={{ "--field-board-height": `${fieldBoardHeight}px` } as CSSProperties}
    >
      <div
        className="profile-cover space-cover wall-cover field-wall-cover profile-wall-cover"
        style={getWallCoverStyle(profileWall)}
      >
        <div className="space-copy">
          <div className="wall-title-row">
            {profileWall?.avatarUrl ? <WallAvatar fallback={user.name} wall={profileWall} /> : <Avatar user={user} />}
            <div>
              <span className="space-kicker">Доска</span>
              <h1>{user.name}</h1>
              <p>{user.handle}</p>
            </div>
          </div>
          {(profileWall?.description || user.bio) ? <p>{profileWall?.description || user.bio}</p> : null}
          <WallActionLinks buttons={profileWall?.actionButtons ?? []} />
        </div>
        <div className="space-actions profile-space-actions">
          <div className="space-stat-row profile-stat-row">
            <MiniMetric label="Заметки" value={`${userPosts.length}`} />
            <MiniMetric label="Ответы" value={`${comments}`} />
            <MiniMetric label="Прочитали" value={formatCompactNumber(views)} />
          </div>
          <div className="space-action-row profile-action-row">
            {isOwnProfile ? (
              <button className="wall-settings-button text" onClick={onOpenSettings}>
                <Settings size={16} />
                Доска
              </button>
            ) : (
              <button className={followedUserIds.has(user.id) ? "follow-button active" : "follow-button"} onClick={() => onFollow(user.id)}>
                {followedUserIds.has(user.id) ? <Check size={15} /> : <CirclePlus size={15} />}
                {followedUserIds.has(user.id) ? "Подписка" : "Подписаться"}
              </button>
            )}
            <button className="follow-button profile-copy-button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/${user.handle}`)}>
              <Link2 size={15} />
              Адрес
            </button>
          </div>
        </div>
      </div>

      <Composer
        className="desktop-composer field-composer board-composer"
        targetLabel={isOwnProfile ? "Моя доска" : `Доска ${user.name}`}
        onPublish={onPublish}
      />

      <WallBoard
        activeUserId={activeUser?.id}
        className="field-board space-field-board profile-field-board"
        commentsByPostId={commentsByPostId}
        emptyText="На этой доске пока нет заметок"
        hint="перетащи карточки по доске"
        pinnedPostIds={pinnedPostIds}
        postById={postById}
        posts={userPosts}
        savedPostIds={savedPostIds}
        userById={userById}
        wallById={wallById}
        onDeletePost={onDeletePost}
        onEditPost={onEditPost}
        onHidePost={onHidePost}
        onMovePost={onMovePost}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onPinPost={onPinPost}
        onReact={onReact}
        onRecordView={onRecordView}
        onReportPost={onReportPost}
        onRepost={onRepost}
        onToggleSave={onToggleSave}
      />
      <FieldMiniMap posts={userPosts} />
    </section>
  );
}

function CommunitySpacePage({
  onOpenBoards,
  onOpenMinecraft,
}: {
  onOpenBoards: () => void;
  onOpenMinecraft: () => void;
}) {
  return (
    <section className="space-hub-page">
      <div className="space-hub-title">
        <h1>Сообщество КиберКотлета</h1>
      </div>
      <div className="space-choice-grid" aria-label="Разделы сообщества">
        <button className="space-choice-card" onClick={onOpenMinecraft}>
          <PackagePlus size={38} />
          <span>Minecraft</span>
        </button>
        <button className="space-choice-card" onClick={onOpenBoards}>
          <MapIcon size={38} />
          <span>Доски</span>
        </button>
      </div>
    </section>
  );
}

function CommunityBoardsPage({
  spaces,
  onCreateSpace,
  onOpenFeed,
  onOpenSpace,
}: {
  spaces: Wall[];
  onCreateSpace: () => void;
  onOpenFeed: () => void;
  onOpenSpace: (spaceId: string) => void;
}) {
  return (
    <section className="space-hub-page boards-hub-page">
      <div className="space-hub-title">
        <h1>Доски</h1>
      </div>
      <div className="space-choice-grid boards-choice-grid" aria-label="Доски сообщества">
        <button className="space-choice-card" onClick={onOpenFeed}>
          <House size={38} />
          <span>Поле</span>
        </button>
        <button className="space-choice-card" onClick={onCreateSpace}>
          <CirclePlus size={38} />
          <span>Новая доска</span>
        </button>
        {spaces.slice(0, 6).map((space) => (
          <button className="space-choice-card board-choice-card" key={space.id} onClick={() => onOpenSpace(space.id)}>
            <WallAvatar fallback={space.name} wall={space} />
            <span>
              <ChannelName wall={space} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MinecraftUtility({ onBack, onCelebrate }: { onBack: () => void; onCelebrate: () => void }) {
  const minecraftWall: Wall = {
    id: "space:minecraft",
    siteSectionId: spaceSectionId,
    name: cyberKotletaModpackName,
    description: "мод пак для игры на WhiteShield",
    accentColor: "green",
    publishMode: "owner",
  };
  const pageStyle = {
    ...getWallAccentStyle(minecraftWall),
    "--field-board-height": "760px",
  } as CSSProperties;

  return (
    <section className="space-page field-page board-space-page minecraft-space-page" style={pageStyle}>
      <div className="profile-cover space-cover wall-cover field-wall-cover minecraft-wall-cover" style={getWallCoverStyle(minecraftWall)}>
        <div className="space-copy">
          <div className="wall-title-row">
            <WallAvatar fallback={minecraftWall.name} wall={minecraftWall} />
            <div>
              <span className="space-kicker">Доска</span>
              <h1>
                <ChannelName wall={minecraftWall} size="hero" />
              </h1>
            </div>
          </div>
          <p>{minecraftWall.description}</p>
        </div>

        <div className="space-actions">
          <div className="space-stat-row">
            <MiniMetric label="Заметки" value="1" />
            <MiniMetric label="Сервер" value="WhiteShield" />
            <MiniMetric label="Версия" value="1.21.1" />
          </div>
          <div className="space-action-row single">
            <button className="follow-button" onClick={onBack}>
              <ArrowLeft size={15} />
              Назад
            </button>
          </div>
        </div>
      </div>

      <section className="wall-board field-board minecraft-field-board" aria-label="Доска модпака">
        <div className="wall-board-head">
          <span>Доска</span>
          <small>скачай модпак</small>
        </div>
        <div className="wall-board-canvas">
          <div
            className="wall-board-item minecraft-download-item"
            style={{ "--board-x": "calc(var(--board-left-offset, 0px) + 24px)", "--board-y": "44px" } as CSSProperties}
          >
            <article className="post-card board-card minecraft-download-post">
              <header className="minecraft-post-head">
                <span className="minecraft-post-mark">
                  <PackagePlus size={22} />
                </span>
                <div>
                  <span>Minecraft 1.21.1 · Fabric</span>
                </div>
              </header>

              <div className="minecraft-post-copy">
                <p>мод пак для игры на WhiteShield</p>
              </div>

              <div className="minecraft-download-options">
                <a
                  className="minecraft-download-option"
                  href={cyberKotletaZipPath}
                  download="cyberkotleta-whiteshield-modpack.zip"
                  onClick={onCelebrate}
                >
                  <span>
                    <Download size={16} />
                  </span>
                  <strong>ZIP архив</strong>
                </a>
                <a
                  className="minecraft-download-option secondary"
                  href={cyberKotletaMrpackPath}
                  download="cyberkotleta-whiteshield-modpack.mrpack"
                  onClick={onCelebrate}
                >
                  <span>
                    <PackagePlus size={16} />
                  </span>
                  <strong>.mrpack</strong>
                  <small>Modrinth APP</small>
                </a>
              </div>
            </article>
          </div>
        </div>
      </section>
    </section>
  );
}

function RankPanel({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      <div className="rank-list">{children}</div>
    </section>
  );
}

function RankUserRow({
  index,
  item,
  value,
  onOpenProfile,
}: {
  index: number;
  item: UserStat;
  value: string;
  onOpenProfile: (profileId: string) => void;
}) {
  return (
    <button className="rank-row as-button" onClick={() => onOpenProfile(item.user.id)}>
      <span className="rank-index">{index + 1}</span>
      <Avatar user={item.user} />
      <div className="rank-body">
        <strong>{item.user.name}</strong>
        <small>{item.user.handle}</small>
      </div>
      <b>{value}</b>
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Avatar({ large = false, user }: { large?: boolean; user: UserProfile }) {
  return (
    <span className={large ? "avatar large" : "avatar"}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" draggable={false} />
      ) : (
        user.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function ConfettiLayer({ bursts }: { bursts: ConfettiBurst[] }) {
  if (bursts.length === 0) return null;

  return (
    <div className="confetti-layer" aria-hidden="true">
      {bursts.map((burst) => (
        <div className={`confetti-burst ${burst.kind}`} key={burst.id}>
          {Array.from({ length: confettiPieces }, (_, index) => (
            <span
              key={index}
              style={
                {
                  "--x": `${Math.cos((Math.PI * 2 * index) / confettiPieces) * (80 + (index % 4) * 16)}px`,
                  "--y": `${Math.sin((Math.PI * 2 * index) / confettiPieces) * (48 + (index % 5) * 12)}px`,
                  "--r": `${index * 19}deg`,
                  "--delay": `${index * 0.012}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="icon-button" onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function MediaPreview({
  attachment,
  compact = false,
}: {
  attachment: MediaAttachment;
  compact?: boolean;
}) {
  if (attachment.type === "image") {
    return <img className="media image-media" src={attachment.url} alt={attachment.name} />;
  }

  if (attachment.type === "video") {
    return (
      <video className="media video-media" src={attachment.url} controls={!compact} muted={compact} />
    );
  }

  return (
    <div className="audio-media">
      <AudioLines size={compact ? 16 : 22} />
      <span>{attachment.name}</span>
      {!compact ? <audio src={attachment.url} controls /> : null}
    </div>
  );
}

type UserStat = {
  user: UserProfile;
  posts: number;
  reactions: number;
  timeOnSiteMinutes: number;
};

function buildUserStats(users: UserProfile[], posts: Post[]): UserStat[] {
  return users.map((user) => {
    const userPosts = posts.filter((post) => post.authorId === user.id);
    return {
      user,
      posts: userPosts.length,
      reactions: userPosts.reduce((sum, post) => sum + post.reactions, 0),
      timeOnSiteMinutes: user.timeOnSiteMinutes,
    };
  });
}

function getMediaKind(file: File): MediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

function addPostNotification(
  current: SocialState,
  payload: {
    actorId: string;
    kind: NotificationItem["kind"];
    postId: string;
    text: string;
  },
): NotificationItem[] {
  const post = current.posts.find((item) => item.id === payload.postId);
  if (!post || post.authorId === payload.actorId) return current.notifications;

  return [
    {
      id: crypto.randomUUID(),
      kind: payload.kind,
      actorId: payload.actorId,
      recipientId: post.authorId,
      postId: payload.postId,
      text: payload.text,
      createdAt: Date.now(),
    },
    ...current.notifications,
  ];
}

function buildCommentNotifications(current: SocialState, comment: Comment): NotificationItem[] {
  const post = current.posts.find((item) => item.id === comment.postId);
  if (!post) return [];

  const notifications: NotificationItem[] = [];
  const parentComment = comment.parentId
    ? current.comments.find((item) => item.id === comment.parentId)
    : undefined;

  if (parentComment && parentComment.authorId !== comment.authorId) {
    notifications.push({
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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

function addCommentReactionNotification(
  current: SocialState,
  actorId: string,
  commentId: string,
): NotificationItem[] {
  const comment = current.comments.find((item) => item.id === commentId);
  if (!comment || comment.authorId === actorId) return current.notifications;

  return [
    {
      id: crypto.randomUUID(),
      kind: "reaction",
      actorId,
      recipientId: comment.authorId,
      postId: comment.postId,
      commentId,
      text: "Огонёк на ваш ответ",
      createdAt: Date.now(),
    },
    ...current.notifications,
  ];
}

function buildMentionNotifications({
  actorId,
  commentId,
  postId,
  text,
  users,
}: {
  actorId: string;
  commentId?: string;
  postId: string;
  text: string;
  users: UserProfile[];
}): NotificationItem[] {
  if (!text.includes("@")) return [];

  const lowerText = text.toLowerCase();
  const mentionedUsers = users.filter((user) => user.id !== actorId && lowerText.includes(user.handle.toLowerCase()));

  return mentionedUsers.map((user) => ({
    id: crypto.randomUUID(),
    kind: "mention",
    actorId,
    recipientId: user.id,
    postId,
    commentId,
    text: "Вас упомянули",
    createdAt: Date.now(),
  }));
}

function addFollowNotification(
  current: SocialState,
  actorId: string,
  targetType: "user" | "wall",
  targetId: string,
): NotificationItem[] {
  if (targetType !== "user" || targetId === actorId) return current.notifications;

  return [
    {
      id: crypto.randomUUID(),
      kind: "follow",
      actorId,
      recipientId: targetId,
      text: "Новая подписка",
      createdAt: Date.now(),
    },
    ...current.notifications,
  ];
}

function createGuestUser(): UserProfile {
  return {
    id: guestUserId,
    name: "Гость",
    handle: "@guest",
    bio: "Пишет без привязки к Discord.",
    joinedAt: Date.now(),
    timeOnSiteMinutes: 0,
  };
}

function ensureGuestUser(users: UserProfile[]): UserProfile[] {
  if (users.some((user) => user.id === guestUserId)) return users;
  return [createGuestUser(), ...users];
}

function normalizeLocalSession(current: SocialState): SocialState {
  const users = ensureGuestUser(current.users);
  const hasDiscordSession = Boolean(readStoredDiscordSession());
  const activeUserId = hasDiscordSession
    ? current.activeUserId
    : current.activeUserId === "rub1kub"
      ? guestUserId
      : current.activeUserId;

  return {
    ...current,
    users,
    activeUserId: users.some((user) => user.id === activeUserId) ? activeUserId : guestUserId,
  };
}

function mergeSharedStateWithLocalSession(current: SocialState, shared: SocialState): SocialState {
  const currentUsers = ensureGuestUser(current.users);
  const sharedUsers = ensureGuestUser(shared.users);
  const activeUser = currentUsers.find((user) => user.id === current.activeUserId);
  const hasActiveUserInSharedState = sharedUsers.some((user) => user.id === current.activeUserId);
  const users = activeUser && !hasActiveUserInSharedState ? [activeUser, ...sharedUsers] : sharedUsers;
  const activeUserId = users.some((user) => user.id === current.activeUserId)
    ? current.activeUserId
    : guestUserId;

  return {
    ...shared,
    users,
    activeUserId,
  };
}

function prepareSharedStateForWrite(current: SocialState): SocialState {
  return {
    ...current,
    users: ensureGuestUser(current.users),
    activeUserId: guestUserId,
  };
}

function activateDiscordProfile(current: SocialState, session: DiscordSession): SocialState {
  const profileId = `discord:${session.user.id}`;
  const existing = current.users.find((user) => user.id === profileId);
  const profile = discordSessionToProfile(session, existing);
  const currentUsers = ensureGuestUser(current.users);
  const users = existing
    ? currentUsers.map((user) => (user.id === profile.id ? profile : user))
    : [profile, ...currentUsers];

  return {
    ...current,
    users,
    activeUserId: profile.id,
  };
}

function formatRelativeTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return timeFormatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return timeFormatter.format(hours, "hour");
  return timeFormatter.format(Math.round(hours / 24), "day");
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}м`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}ч ${rest}м` : `${hours}ч`;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("ru", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function getPostViewCount(post: Post): number {
  return post.views.uniqueUserIds.length;
}

function normalizeRuntimeBoardCopy(current: SocialState): SocialState {
  let changed = false;
  const users = current.users.map((user) => {
    const bio = normalizeBoardCopyText(user.bio);
    if (bio === user.bio) return user;
    changed = true;
    return { ...user, bio };
  });
  const walls = current.walls.map((wall) => {
    const description = normalizeBoardCopyText(wall.description ?? "");
    const rules = normalizeBoardCopyText(wall.rules ?? "");
    if (description === (wall.description ?? "") && rules === (wall.rules ?? "")) return wall;
    changed = true;
    return { ...wall, description, rules };
  });
  const posts = current.posts.map((post) => {
    const text = normalizeBoardCopyText(post.text);
    if (text === post.text) return post;
    changed = true;
    return { ...post, text };
  });

  return changed ? { ...current, users, walls, posts } : current;
}

function normalizeBoardCopyText(text: string): string {
  return text
    .replaceAll("Ведёт свою стену", "Ведёт свою доску")
    .replaceAll("Общая стена", "Общая доска")
    .replaceAll("Заметка на стене", "Заметка на доске")
    .replaceAll("Пост на стене", "Заметка на доске")
    .replaceAll("Профильная стена", "Профильная доска");
}

function isPixelSyncMessage(value: unknown): value is PixelSyncMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as PixelSyncMessage;
  return message.type === "pixel" && typeof message.sourceId === "string" && Boolean(normalizePixelCell(message.cell));
}

function mergePixelState(
  current: SocialState,
  incomingCells: PixelCell[],
  incomingCooldowns: Record<string, number>,
): SocialState {
  return {
    ...current,
    pixelCells: mergePixelCells(current.pixelCells, incomingCells),
    pixelCooldowns: {
      ...current.pixelCooldowns,
      ...incomingCooldowns,
    },
  };
}

function applyPixelCellToState(current: SocialState, cell: PixelCell, shouldSyncCooldown: boolean): SocialState {
  const normalizedCell = normalizePixelCell(cell);
  if (!normalizedCell) return current;

  return {
    ...current,
    pixelCells: mergePixelCells(current.pixelCells, [normalizedCell]),
    pixelCooldowns: shouldSyncCooldown
      ? {
          ...current.pixelCooldowns,
          [normalizedCell.authorId]: Math.max(
            current.pixelCooldowns[normalizedCell.authorId] ?? 0,
            normalizedCell.updatedAt,
          ),
        }
      : current.pixelCooldowns,
  };
}

function mergePixelCells(currentCells: PixelCell[], incomingCells: PixelCell[]): PixelCell[] {
  const merged = new Map<string, PixelCell>();

  for (const cell of [...currentCells, ...incomingCells]) {
    const normalizedCell = normalizePixelCell(cell);
    if (!normalizedCell) continue;

    const key = `${normalizedCell.x}:${normalizedCell.y}`;
    const previous = merged.get(key);
    if (!previous || normalizedCell.updatedAt >= previous.updatedAt) {
      merged.set(key, normalizedCell);
    }
  }

  return [...merged.values()]
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(-maxPixelCells);
}

function normalizePixelCell(cell: PixelCell | undefined): PixelCell | null {
  if (!cell) return null;
  const x = Math.round(Number(cell.x));
  const y = Math.round(Number(cell.y));
  const color = typeof cell.color === "string" ? cell.color.toLowerCase() : "";
  const authorId = typeof cell.authorId === "string" ? cell.authorId : "";
  const updatedAt = Number(cell.updatedAt) || Date.now();
  if (!Number.isFinite(x) || !Number.isFinite(y) || !pixelPalette.includes(color) || !authorId) return null;

  return {
    x: Math.max(0, Math.min(pixelColumns - 1, x)),
    y: Math.max(0, Math.min(pixelRows - 1, y)),
    color,
    authorId,
    updatedAt,
  };
}

function clampPostPosition(position: PostPosition, maxX = 1800, maxY = 2200): PostPosition {
  return {
    x: Math.max(0, Math.min(maxX, Math.round(position.x))),
    y: Math.max(0, Math.min(maxY, Math.round(position.y))),
  };
}

function getDefaultBoardPosition(index: number, offsetX = 0): PostPosition {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: offsetX + column * (boardCardWidth + boardGap),
    y: row * (boardCardHeight + boardGap),
  };
}

function resolveBoardPostLayout(posts: Post[], maxX = 1800, defaultOffsetX = 0): Array<{ post: Post; position: PostPosition }> {
  const placed: PostPosition[] = [];

  return posts.map((post, index) => {
    const desiredPosition = clampPostPosition(post.position ?? getDefaultBoardPosition(index, defaultOffsetX), maxX);
    const position = findOpenBoardPosition(desiredPosition, placed, index, maxX, defaultOffsetX);
    placed.push(position);

    return { post, position };
  });
}

function findOpenBoardPosition(
  desiredPosition: PostPosition,
  placed: PostPosition[],
  index: number,
  maxX = 1800,
  defaultOffsetX = 0,
): PostPosition {
  if (!hasBoardPositionOverlap(desiredPosition, placed)) return desiredPosition;

  const defaultPosition = clampPostPosition(getDefaultBoardPosition(index, defaultOffsetX), maxX);
  if (!hasBoardPositionOverlap(defaultPosition, placed)) return defaultPosition;

  const columns = 3;
  const startRow = Math.floor(index / columns);

  for (let rowOffset = 0; rowOffset < 60; rowOffset += 1) {
    for (let column = 0; column < columns; column += 1) {
      const candidate = clampPostPosition({
        x: defaultOffsetX + column * (boardCardWidth + boardGap),
        y: (startRow + rowOffset) * (boardCardHeight + boardGap),
      }, maxX);

      if (!hasBoardPositionOverlap(candidate, placed)) return candidate;
    }
  }

  return clampPostPosition({
    x: defaultOffsetX,
    y: (startRow + 60) * (boardCardHeight + boardGap),
  }, maxX);
}

function hasBoardPositionOverlap(position: PostPosition, placed: PostPosition[]): boolean {
  return placed.some(
    (other) =>
      Math.abs(position.x - other.x) < boardCardWidth + boardGap &&
      Math.abs(position.y - other.y) < boardCardHeight + boardGap,
  );
}

function getBoardCanvasHeight(posts: Post[]): number {
  const postLayout = resolveBoardPostLayout(posts);

  return Math.max(
    720,
    ...postLayout.map(({ position }) => position.y + boardCardHeight + boardGap),
  );
}

function isDragIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-drag-handle]")) return false;
  return Boolean(target.closest("button, a, input, textarea, select, audio, video, [data-no-drag]"));
}

function formatWallChannelName(wall: Wall): string {
  const name = wall.name.trim().toLowerCase();
  const emoji = getWallChannelEmoji(name);
  return `│ ${emoji} · ${name}`;
}

function formatWallTextName(wall: Wall): string {
  return formatWallChannelName(wall);
}

function getWallChannelEmoji(name: string): string {
  if (/лаб|lab|тест|test/i.test(name)) return "🧪";
  if (/ссыл|link|url/i.test(name)) return "🔗";
  if (/замет|note/i.test(name)) return "✎";
  if (/общ|глав|вокзал|чат|chat/i.test(name)) return "👋";
  if (/арт|рис|pixel|пиксел/i.test(name)) return "🎨";
  return "•";
}

function formatWallInitial(value: string): string {
  return value.trim().slice(0, 1).toUpperCase() || "#";
}

function getWallAccentOption(value: string | undefined): typeof wallAccentOptions[number] {
  return wallAccentOptions.find((option) => option.id === value) ?? wallAccentOptions[0];
}

function getWallAccentCssVars(option: typeof wallAccentOptions[number]): CSSProperties {
  return {
    "--accent": option.accent,
    "--accent-2": option.accent2,
    "--accent-soft": option.soft,
    "--focus": option.accent2,
  } as CSSProperties;
}

function getWallAccentStyle(wall: Wall | undefined): CSSProperties | undefined {
  if (!wall?.accentColor) return undefined;
  return getWallAccentCssVars(getWallAccentOption(wall.accentColor));
}

function getMediaFocus(value: MediaFocus | undefined): MediaFocus {
  if (!value) return defaultMediaFocus;
  return {
    x: Math.max(0, Math.min(100, Math.round(value.x))),
    y: Math.max(0, Math.min(100, Math.round(value.y))),
  };
}

function formatMediaFocus(value: MediaFocus | undefined): string {
  const focus = getMediaFocus(value);
  return `${focus.x}% ${focus.y}%`;
}

function getMediaFocusStyle(value: MediaFocus | undefined): CSSProperties {
  return {
    objectPosition: formatMediaFocus(value),
  };
}

function getMediaFocusVars(value: MediaFocus | undefined): CSSProperties {
  const focus = getMediaFocus(value);
  return {
    "--media-focus-x": `${focus.x}%`,
    "--media-focus-y": `${focus.y}%`,
  } as CSSProperties;
}

function getWallCoverStyle(wall: Wall | undefined): CSSProperties | undefined {
  if (!wall?.bannerUrl) return undefined;

  return {
    "--banner-image": `url(${wall.bannerUrl})`,
    "--banner-position": formatMediaFocus(wall.bannerFocus),
  } as CSSProperties;
}

function getPostObjectKind(post: Post, commentCount: number): ObjectKind {
  if (post.repostOfId) return "fork";
  if (post.attachments.some((attachment) => attachment.type === "audio")) return "audio";
  if (post.attachments.length > 0) return "media";
  if (commentCount > 1) return "branch";
  return "note";
}

function getObjectKindLabel(kind: ObjectKind): string {
  const labels: Record<ObjectKind, string> = {
    audio: "звук",
    branch: "ветка",
    fork: "ответвление",
    media: "медиа",
    note: "заметка",
  };

  return labels[kind];
}

function getObjectSignal(post: Post, commentCount: number): string {
  if (commentCount > 0) return formatAnswerCount(commentCount);
  if (post.reactions > 0) return `${formatCompactNumber(post.reactions)} огоньков`;
  return "новое";
}

function formatAnswerCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const word =
    lastTwo >= 11 && lastTwo <= 14
      ? "ответов"
      : last === 1
        ? "ответ"
        : last >= 2 && last <= 4
          ? "ответа"
          : "ответов";

  return `${formatCompactNumber(count)} ${word}`;
}

function formatNoteCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const word =
    lastTwo >= 11 && lastTwo <= 14
      ? "заметок"
      : last === 1
        ? "заметка"
        : last >= 2 && last <= 4
          ? "заметки"
          : "заметок";

  return `${formatCompactNumber(count)} ${word}`;
}

function getProfileWallId(userId: string): string {
  return `${profileWallPrefix}${userId}`;
}

function getComposerTargetWallId(route: AppRoute, activeUser: UserProfile | undefined): string | undefined {
  if (route.view === "profile") return getProfileWallId(route.profileId);
  if (route.view === "space") return route.spaceId;
  if (route.view === "feed") {
    return activeUser ? getProfileWallId(activeUser.id) : undefined;
  }
  return undefined;
}

function isNavRouteActive(route: AppRoute, view: AppRoute["view"]): boolean {
  if (view === "spaceHub") {
    return route.view === "spaceHub" || route.view === "spaceMinecraft" || route.view === "spaceBoards";
  }
  return route.view === view;
}

function getComposerTargetLabel(
  wallId: string | undefined,
  wallById: Map<string, Wall>,
  userById: Map<string, UserProfile>,
  activeUser: UserProfile | undefined,
): string | undefined {
  if (!wallId) return undefined;
  if (wallId === getProfileWallId(activeUser?.id ?? "")) return "Моя доска";

  return getWallDisplayName(wallById.get(wallId), userById);
}

function getWallDisplayName(wall: Wall | undefined, userById: Map<string, UserProfile>): string {
  if (!wall) return "Доска";

  if (wall.id.startsWith(profileWallPrefix)) {
    const userId = wall.id.slice(profileWallPrefix.length);
    const user = userById.get(userId);
    return user ? `Доска ${user.name}` : "Доска профиля";
  }

  return formatWallTextName(wall);
}

function canManageWall(wall: Wall | undefined, userId: string): boolean {
  if (!wall) return false;
  if (wall.id.startsWith(profileWallPrefix)) return wall.id === getProfileWallId(userId);
  return wall.ownerId === userId;
}

function canPublishToWall(wall: Wall | undefined, userId: string): boolean {
  if (!wall) return false;
  if (wall.id.startsWith(profileWallPrefix)) return true;
  return wall.publishMode !== "owner" || wall.ownerId === userId;
}

function getPulseScore(post: Post, commentsByPostId: Map<string, Comment[]>): number {
  const ageHours = Math.max(1, (Date.now() - post.createdAt) / 3600000);
  const answers = commentsByPostId.get(post.id)?.length ?? 0;
  return post.reactions * 3 + answers * 5 + getPostViewCount(post) - ageHours * 0.25;
}

function isSpaceWall(wall: Wall): boolean {
  return wall.siteSectionId === spaceSectionId;
}

function ensureWallExists(walls: Wall[], wallId: string, users: UserProfile[]): Wall[] {
  if (walls.some((wall) => wall.id === wallId)) return walls;

  if (wallId.startsWith(profileWallPrefix)) {
    const userId = wallId.slice(profileWallPrefix.length);
    const user = users.find((item) => item.id === userId);
    return [
      {
        id: wallId,
        siteSectionId: wallId,
        name: user ? user.name : "Профиль",
        ownerId: userId,
        description: user?.bio ?? "",
        publishMode: "open",
      },
      ...walls,
    ];
  }

  return walls;
}

function readRouteFromPath(pathname: string, users: UserProfile[], walls: Wall[]): AppRoute {
  const parts = pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const first = parts[0]?.toLowerCase();

  if (!first || first === "main" || first === "agents") return { view: "feed" };
  if (first === "feed") return { view: "feed" };
  if (first === "top") return { view: "top" };
  if (first === "mine") return { view: "spaceMinecraft" };
  if (first === "space" && !parts[1]) return { view: "spaceHub" };
  if (first === "space" && parts[1]?.toLowerCase() === "minecraft") return { view: "spaceMinecraft" };
  if (first === "space" && parts[1]?.toLowerCase() === "boards") return { view: "spaceBoards" };
  if (first === "post" && parts[1]) return { view: "post", postId: parts[1] };

  if (first?.startsWith("@")) {
    const user = users.find((item) => item.handle.toLowerCase() === first);
    return user ? { view: "profile", profileId: user.id } : { view: "feed" };
  }

  if (first === "stena" && parts[1]) {
    const id = `space:${parts[1]}`;
    const space = walls.find((wall) => wall.id === id || slugify(wall.name) === parts[1]);
    return space ? { view: "space", spaceId: space.id } : { view: "feed" };
  }

  return { view: "feed" };
}

function routeToPath(route: AppRoute, userById: Map<string, UserProfile>, walls: Wall[]): string {
  if (route.view === "feed") return "/feed";
  if (route.view === "top") return "/top";
  if (route.view === "spaceHub") return "/space";
  if (route.view === "spaceMinecraft") return "/space/minecraft";
  if (route.view === "spaceBoards") return "/space/boards";
  if (route.view === "post") return `/post/${encodeURIComponent(route.postId)}`;

  if (route.view === "profile") {
    const user = userById.get(route.profileId);
    return user ? `/${user.handle}` : "/feed";
  }

  const space = walls.find((wall) => wall.id === route.spaceId);
  const slug = route.spaceId.replace(/^space:/, "") || slugify(space?.name ?? "space");
  return `/stena/${encodeURIComponent(slug)}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function makeUniqueId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) return baseId;

  let index = 2;
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1;
  }
  return `${baseId}-${index}`;
}

export default App;
