import {
  AudioLines,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bookmark,
  Bold,
  Brush,
  Check,
  CheckSquare,
  CirclePlus,
  Code2,
  CornerDownRight,
  Clock,
  Download,
  Eraser,
  Eye,
  Flag,
  Flame,
  House,
  Image as ImageIcon,
  Italic,
  Loader2,
  Link2,
  List,
  LogIn,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  MoreHorizontal,
  Moon,
  PackagePlus,
  Paperclip,
  Paintbrush,
  Palette,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  Quote,
  Repeat2,
  Search,
  Send,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sun,
  Trash2,
  Type,
  Trophy,
  UserRound,
  Video,
  Volume2,
  VolumeX,
  Vote,
  X,
  Maximize2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, CSSProperties, DragEvent, FormEvent } from "react";
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
import {
  dispatchSharedSocialAction,
  readSharedSocialState,
  subscribeSharedSocialState,
  writeSharedSocialState,
} from "./sharedState";
import type { SharedStateAction } from "./sharedState";
import { readSocialState, readTheme, socialStateStorageKey, writeSocialState, writeTheme } from "./storage";
import type {
  Comment,
  ChecklistItem,
  MediaAttachment,
  MediaFocus,
  MediaKind,
  NotificationItem,
  PixelCell,
  Post,
  PostAppearance,
  PostConnection,
  PostInteractionSettings,
  PostKind,
  PostPosition,
  PostPoll,
  SketchPoint,
  SketchStroke,
  SocialState,
  Theme,
  UserProfile,
  Wall,
  WallActionButton,
  WallInviteSettings,
  WallPrivacyMode,
} from "./types";

const timeFormatter = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
const maxFiles = 6;
const cyberKotletaModpackName = "Модпак CyberKotleta";
const cyberKotletaZipPath = "/downloads/cyberkotleta-whiteshield-modpack.zip";
const cyberKotletaMrpackPath = "/downloads/cyberkotleta-whiteshield-modpack.mrpack";
const minecraftWallId = "space:minecraft";
const minecraftDownloadPostId = "minecraft-download-post";
const minecraftDownloadObjectId = "minecraft:download-card";
const minecraftOwnerUserId = "rub1kub";
const minecraftOwnerDiscordUserId = "discord:1129003754818125915";
const minecraftAdminUserIds = new Set([
  minecraftOwnerUserId,
  minecraftOwnerDiscordUserId,
  "discord:476391268671291393",
]);
const confettiPieces = 22;
const reactionPieces = 14;
const maxReactionBursts = 3;
const reactionBurstCadenceMs = 120;
const reactionIdleMs = 1120;
const reactionParticleLifetimeMs = 980;
const userOnlineWindowMs = 1000 * 60 * 2;
const userRecentlySeenWindowMs = 1000 * 60 * 15;
const socialStateWriteDelayMs = 180;
const sharedStatePollMs = 1300;
const postViewVisibleMs = 720;
const profileWallPrefix = "profile:";
const spaceSectionId = "space";
const guestUserId = "guest";
const anonymousGuestStorageKey = "kotleta.anonymous.guest.v1";
const anonymousGuestPrefix = "guest:";
const fieldLayoutStorageKey = "kotleta.field.layout.v2";
const pinnedWallStorageKey = "kotleta.pinned.walls.v1";
const boardGridSize = 24;
const boardCardWidth = 318;
const boardCardHeight = 226;
const boardGap = 18;
const defaultMediaFocus: MediaFocus = { x: 50, y: 50 };
type WallAccentOption = {
  id: string;
  label: string;
  accent: string;
  accent2: string;
  soft: string;
};

const wallAccentOptions: WallAccentOption[] = [
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
];
const pixelSize = 7;
const pixelColumns = 300;
const pixelRows = 190;
const maxPixelCells = pixelColumns * pixelRows;
const pixelCooldownMs = 1000;
const pixelSyncChannelName = "kotleta.pixel.v1";
const audioPlaybackEventName = "kotleta:audio-play";
const pixelPalette = ["#111318", "#f6f8f7", "#21e69a", "#0f9f68", "#6c7685", "#5c6cff", "#d93862"];
const sketchPalette = ["#111318", "#f6f8f7", "#21e69a", "#0f9f68", "#6c7685", "#5c6cff", "#d93862", "#f2c94c"];
const postKindOptions: Array<{ id: PostKind; label: string; hint: string }> = [
  { id: "note", label: "Заметка", hint: "текст" },
  { id: "sketch", label: "Рисунок", hint: "рисование" },
  { id: "idea", label: "Идея", hint: "набросок" },
  { id: "list", label: "Список", hint: "пункты" },
  { id: "poll", label: "Голосование", hint: "выбор" },
  { id: "checklist", label: "Список", hint: "пункты" },
  { id: "link", label: "Ссылка", hint: "переход" },
  { id: "signal", label: "Сигнал", hint: "важное" },
];
const defaultPostSettings: PostInteractionSettings = {
  comments: true,
  reactions: true,
  reposts: true,
  saves: true,
  views: true,
};
const defaultPostAppearance: PostAppearance = {
  background: "plain",
  shape: "soft",
  size: "normal",
};

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

type BoardRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type BoardLayoutOptions = {
  defaultOffsetX?: number;
  defaultOffsetY?: number;
  maxX?: number;
  positionOverrides?: Record<string, PostPosition>;
  usePostPositions?: boolean;
};

type BoardLayoutItem = {
  height: number;
  position: PostPosition;
  post: Post;
  width: number;
};

type AppRoute =
  | { view: "feed" }
  | { view: "top" }
  | { view: "spaceHub" }
  | { view: "spaceBoards" }
  | { view: "profile"; profileId: string }
  | { view: "space"; spaceId: string }
  | { view: "post"; postId: string };

type FeedFilter = "all" | "following" | "saved";
type ObjectKind = "note" | "branch" | "media" | "audio" | "fork";

type PostDraftOptions = {
  appearance: PostAppearance;
  checklist: ChecklistItem[];
  kind: PostKind;
  poll?: PostPoll;
  settings: PostInteractionSettings;
  sketch: SketchStroke[];
};

type PostUpdatePayload = Partial<PostDraftOptions>;

type CreateSpacePayload = {
  accentColor: string;
  avatarFocus: MediaFocus;
  avatarUrl: string;
  bannerFocus: MediaFocus;
  bannerUrl: string;
  name: string;
  slug: string;
  description: string;
  rules: string;
  privacyMode: WallPrivacyMode;
  invite: WallInviteSettings;
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
  privacyMode: WallPrivacyMode;
  invite: WallInviteSettings;
  publishMode: Wall["publishMode"];
};

type AppNavItem = {
  icon: React.ReactNode;
  label: string;
  route: AppRoute;
  view: AppRoute["view"];
};

type FieldLayoutState = Record<string, Record<string, PostPosition>>;
type PinnedWallState = Record<string, string[]>;

function App() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [state, setState] = useState<SocialState>(() => normalizeLocalSession(readSocialState()));
  const [fieldLayouts, setFieldLayouts] = useState<FieldLayoutState>(() => readFieldLayouts());
  const [pinnedWalls, setPinnedWalls] = useState<PinnedWallState>(() => readPinnedWalls());
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
  const [connectionSourcePostId, setConnectionSourcePostId] = useState<string | null>(null);
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
  const scopedUserId = state.activeUserId;
  const hiddenCommentIds = useMemo(
    () => new Set(getScopedIdList(state.hiddenCommentIdsByUser, scopedUserId)),
    [scopedUserId, state.hiddenCommentIdsByUser],
  );
  const commentsByPostId = useMemo(() => {
    const map = new Map<string, Comment[]>();
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
  }, [hiddenCommentIds, state.comments]);
  const activeUser = userById.get(state.activeUserId) ?? userById.get(getAnonymousGuestUser().id) ?? userById.get(guestUserId);
  const isDiscordUser = activeUser?.provider === "discord";
  const spaces = useMemo(() => state.walls.filter(isSpaceWall), [state.walls]);
  const wallById = useMemo(
    () => new Map(state.walls.map((wall) => [wall.id, wall])),
    [state.walls],
  );
  const savedPostIds = useMemo(
    () => new Set(getScopedIdList(state.savedPostIdsByUser, scopedUserId)),
    [scopedUserId, state.savedPostIdsByUser],
  );
  const pinnedPostIds = useMemo(
    () => new Set(getScopedIdList(state.pinnedPostIdsByUser, scopedUserId)),
    [scopedUserId, state.pinnedPostIdsByUser],
  );
  const hiddenPostIds = useMemo(
    () => new Set(getScopedIdList(state.hiddenPostIdsByUser, scopedUserId)),
    [scopedUserId, state.hiddenPostIdsByUser],
  );
  const followedUserIds = useMemo(
    () => new Set(state.follows.filter((follow) => follow.userId === scopedUserId && follow.targetType === "user").map((follow) => follow.targetId)),
    [scopedUserId, state.follows],
  );
  const followedWallIds = useMemo(
    () => new Set(state.follows.filter((follow) => follow.userId === scopedUserId && follow.targetType === "wall").map((follow) => follow.targetId)),
    [scopedUserId, state.follows],
  );
  const activeInviteCode = useMemo(
    () => new URLSearchParams(window.location.search).get("invite") ?? "",
    [route],
  );
  const visibleSpaces = useMemo(
    () => spaces.filter((space) => canViewWall(space, activeUser?.id, followedWallIds, activeInviteCode)),
    [activeInviteCode, activeUser?.id, followedWallIds, spaces],
  );
  const unreadNotificationCount = useMemo(
    () => stackNotificationItems(state.notifications.filter((item) => item.recipientId === state.activeUserId && !item.readAt)).length,
    [state.activeUserId, state.notifications],
  );
  const fieldLayoutKey = activeUser?.id ?? getAnonymousGuestUser().id;
  const fieldPostPositions = fieldLayouts[fieldLayoutKey] ?? {};
  const pinnedWallIds = useMemo(() => pinnedWalls[fieldLayoutKey] ?? [], [fieldLayoutKey, pinnedWalls]);
  const pinnedWallIdSet = useMemo(() => new Set(pinnedWallIds), [pinnedWallIds]);
  const sidebarSpaces = useMemo(() => {
    const byId = new Map(visibleSpaces.map((space) => [space.id, space]));
    const pinnedSpaces = pinnedWallIds
      .map((id) => byId.get(id))
      .filter((space): space is Wall => Boolean(space));
    const fallbackSpaces = visibleSpaces.filter((space) => !pinnedWallIdSet.has(space.id));

    return [...pinnedSpaces, ...fallbackSpaces].slice(0, 4);
  }, [pinnedWallIdSet, pinnedWallIds, visibleSpaces]);
  const activeProfile =
    route.view === "profile" ? userById.get(route.profileId) ?? activeUser : activeUser;
  const activeSpace =
    route.view === "space"
      ? state.walls.find((wall) =>
          wall.id === route.spaceId && canViewWall(wall, activeUser?.id, followedWallIds, activeInviteCode),
        )
      : undefined;
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
      .filter((user) => `${user.name} ${user.handle} ${user.bio} ${getUserStatus(user)}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 4);
  }, [query, state.users]);
  const matchingSpaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return visibleSpaces
      .filter((space) => `${space.name} ${space.description ?? ""} ${space.rules ?? ""}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 4);
  }, [query, visibleSpaces]);

  const visibleFeedPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return state.posts
      .filter((post) => {
        const author = userById.get(post.authorId);
        const wall = wallById.get(post.wallId);
        const haystack = `${post.text} ${author?.name ?? ""} ${author?.handle ?? ""} ${wall?.name ?? ""}`.toLowerCase();
        if (hiddenPostIds.has(post.id)) return false;
        if (wall && isSpaceWall(wall) && !canViewWall(wall, activeUser?.id, followedWallIds, activeInviteCode)) return false;
        if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
        if (feedFilter === "following") return followedUserIds.has(post.authorId) || followedWallIds.has(post.wallId);
        if (feedFilter === "saved") return savedPostIds.has(post.id);
        if (!normalizedQuery && post.id === minecraftDownloadPostId) return false;
        return true;
      })
      .sort((a, b) => {
        const pinnedDelta = Number(pinnedPostIds.has(b.id)) - Number(pinnedPostIds.has(a.id));
        if (pinnedDelta) return pinnedDelta;
        return b.createdAt - a.createdAt;
      });
  }, [
    feedFilter,
    activeInviteCode,
    activeUser?.id,
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
      setState((current) => mergeSharedStateWithLocalSession(current, snapshot.state));
    }
  }, []);
  const dispatchSharedAction = useCallback((action: SharedStateAction) => {
    if (!sharedStateReadyRef.current) return;
    skipNextSharedStateWriteRef.current = true;

    void dispatchSharedSocialAction(action).then((snapshot) => {
      if (!snapshot) return;
      sharedStateVersionRef.current = snapshot.version;
      skipNextSharedStateWriteRef.current = true;
      setState((current) => mergeSharedStateWithLocalSession(current, snapshot.state));
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeTheme(theme);
  }, [theme]);

  useEffect(() => {
    writeFieldLayouts(fieldLayouts);
  }, [fieldLayouts]);

  useEffect(() => {
    writePinnedWalls(pinnedWalls);
  }, [pinnedWalls]);

  useEffect(() => {
    setState((current) => touchActiveUserPresence(current));
  }, [activeUser?.id]);

  useEffect(() => {
    setState((current) => normalizeRuntimeBoardCopy(current));
  }, []);

  useEffect(() => {
    let cancelled = false;

    function receiveSharedSnapshot(snapshot: Awaited<ReturnType<typeof readSharedSocialState>>) {
      if (!snapshot || cancelled || snapshot.version === sharedStateVersionRef.current) return;

      sharedStateReadyRef.current = true;
      sharedStateVersionRef.current = snapshot.version;
      skipNextSharedStateWriteRef.current = true;
      setState((current) => mergeSharedStateWithLocalSession(current, snapshot.state));
    }

    async function pollSharedSnapshot() {
      if (socialStateWriteTimerRef.current) return;

      const snapshot = await readSharedSocialState();
      receiveSharedSnapshot(snapshot);
    }

    async function loadSharedState() {
      const snapshot = await readSharedSocialState();
      receiveSharedSnapshot(snapshot);
    }

    void loadSharedState();
    const unsubscribe = subscribeSharedSocialState(receiveSharedSnapshot);
    const interval = typeof EventSource === "undefined"
      ? window.setInterval(() => {
          void pollSharedSnapshot();
        }, sharedStatePollMs)
      : null;

    return () => {
      cancelled = true;
      unsubscribe();
      if (interval) window.clearInterval(interval);
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
    if (!first || first === "main") {
      window.history.replaceState(null, "", "/feed");
    }
  }, []);

  useEffect(() => {
    const canonicalPath = routeToPath(route, userById, state.walls);
    if (window.location.pathname === "/space/minecraft" && canonicalPath !== window.location.pathname) {
      window.history.replaceState(null, "", canonicalPath);
    }
  }, [route, state.walls, userById]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setState((current) => touchActiveUserPresence(current, Date.now(), 1));
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
      walls: wallId === minecraftWallId
        ? ensureMinecraftWallExists(current.walls)
        : ensureWallExists(current.walls, wallId, current.users),
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
      users: ensureLocalGuestUsers(current.users),
      activeUserId: getAnonymousGuestUser().id,
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
      avatarFocus: payload.avatarFocus,
      avatarUrl: payload.avatarUrl.trim() || undefined,
      bannerFocus: payload.bannerFocus,
      bannerUrl: payload.bannerUrl.trim() || undefined,
      accentColor: payload.accentColor || undefined,
      description: payload.description.trim(),
      rules: payload.rules.trim(),
      privacyMode: payload.privacyMode,
      invite: payload.privacyMode === "public" ? undefined : normalizeWallInviteSettings(payload.invite),
      publishMode: payload.publishMode,
    };

    setState((current) => ({
      ...current,
      walls: [wall, ...current.walls],
    }));
    if (activeUser) {
      dispatchSharedAction({
        type: "wall.create",
        actorId: activeUser.id,
        actor: activeUser,
        wall,
      });
    }
    navigate({ view: "space", spaceId: wall.id });
    celebrate("wall");
  }

  function togglePinnedWall(wallId: string) {
    setPinnedWalls((current) => {
      const currentList = current[fieldLayoutKey] ?? [];
      const nextList = currentList.includes(wallId)
        ? currentList.filter((id) => id !== wallId)
        : [wallId, ...currentList].slice(0, 12);
      const nextState = { ...current };

      if (nextList.length > 0) {
        nextState[fieldLayoutKey] = nextList;
      } else {
        delete nextState[fieldLayoutKey];
      }

      return nextState;
    });
  }

  function publishPostToWall(
    wallId: string | undefined,
    text: string,
    attachments: MediaAttachment[],
    options?: Partial<PostDraftOptions>,
  ) {
    if (!wallId || !activeUser) return;
    const postOptions = normalizePostDraftOptions(options, attachments);
    if (!hasPublishablePostDraft(text, attachments, postOptions)) return;
    const walls = ensureWallExists(state.walls, wallId, state.users);
    const targetWall = walls.find((wall) => wall.id === wallId);
    if (!canPublishToWall(targetWall, activeUser.id)) return;
    const position = getNewBoardPostPosition(state.posts.filter((post) => post.wallId === wallId), {
      appearance: postOptions.appearance,
      attachments,
      checklist: postOptions.checklist,
      poll: postOptions.poll,
      sketch: postOptions.sketch,
      text: text.trim(),
    });
    const post: Post = {
      id: crypto.randomUUID(),
      wallId,
      authorId: activeUser.id,
      kind: postOptions.kind,
      text: text.trim(),
      attachments,
      reactions: 0,
      views: {
        total: 0,
        uniqueUserIds: [],
      },
      position,
      appearance: postOptions.appearance,
      settings: postOptions.settings,
      sketch: postOptions.sketch,
      checklist: postOptions.checklist,
      poll: postOptions.poll,
      createdAt: Date.now(),
    };

    setState((current) => {
      return {
        ...current,
        walls: ensureWallExists(current.walls, wallId, current.users),
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
    dispatchSharedAction({
      type: "post.create",
      actorId: activeUser.id,
      actor: activeUser,
      post,
    });
    setIsMobileComposerOpen(false);
    celebrate("post");
  }

  function movePost(postId: string, x: number, y: number) {
    if (!activeUser) return;

    const position = clampPostPosition({
      x: Math.round(x / boardGridSize) * boardGridSize,
      y: Math.round(y / boardGridSize) * boardGridSize,
    });
    const currentState = latestSocialStateRef.current;
    const targetPost = currentState.posts.find((post) => post.id === postId);
    if (!canMoveSharedPost(targetPost, currentState.walls, activeUser.id)) return;

    setState((current) => {
      const targetPost = current.posts.find((post) => post.id === postId);
      if (!canMoveSharedPost(targetPost, current.walls, current.activeUserId)) return current;

      return {
        ...current,
        posts: current.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                position,
              }
            : post,
        ),
      };
    });

    dispatchSharedAction({
      type: "post.move",
      actorId: activeUser.id,
      actor: activeUser,
      postId,
      x: position.x,
      y: position.y,
    });
  }

  function moveFieldPost(postId: string, x: number, y: number) {
    if (!fieldLayoutKey) return;
    const position = clampPostPosition({
      x: Math.round(x / boardGridSize) * boardGridSize,
      y: Math.round(y / boardGridSize) * boardGridSize,
    });

    setFieldLayouts((current) => ({
      ...current,
      [fieldLayoutKey]: {
        ...(current[fieldLayoutKey] ?? {}),
        [postId]: position,
      },
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
    dispatchSharedAction({
      type: "pixel.paint",
      actorId: activeUserId,
      actor: activeUser,
      x: nextCell.x,
      y: nextCell.y,
      color: nextCell.color,
    });
  }

  const react = useCallback((postId: string, amount = 1) => {
    const reactionAmount = Math.max(0, Math.floor(amount));
    if (reactionAmount === 0) return;
    const actorId = latestSocialStateRef.current.activeUserId;
    const actor = latestSocialStateRef.current.users.find((user) => user.id === actorId);

    setState((current) => {
      const targetPost = current.posts.find((post) => post.id === postId);
      if (!targetPost || !getPostSettings(targetPost).reactions) return current;

      return {
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
      };
    });
    dispatchSharedAction({
      type: "post.react",
      actorId,
      actor,
      postId,
      amount: reactionAmount,
    });
  }, [dispatchSharedAction]);

  const recordPostView = useCallback((postId: string) => {
    const current = latestSocialStateRef.current;
    const targetPost = current.posts.find((post) => post.id === postId);
    if (!targetPost || !getPostSettings(targetPost).views) return;
    const viewerId = current.activeUserId;
    const actor = current.users.find((user) => user.id === viewerId);
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
    dispatchSharedAction({
      type: "post.view",
      actorId: viewerId,
      actor,
      postId,
    });
  }, [dispatchSharedAction]);

  function addComment(postId: string, parentId: string | undefined, text: string, attachments: MediaAttachment[]) {
    if (!activeUser || (!text.trim() && attachments.length === 0)) return;
    const parentComment = parentId ? latestSocialStateRef.current.comments.find((comment) => comment.id === parentId) : undefined;
    const targetPost = postById.get(postId);
    if (!targetPost || !getPostSettings(targetPost).comments) return;
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
    dispatchSharedAction({
      type: "comment.create",
      actorId: activeUser.id,
      actor: activeUser,
      comment,
    });
  }

  function reactToComment(commentId: string) {
    if (!activeUser) return;
    setState((current) => ({
      ...current,
      comments: current.comments.map((comment) =>
        comment.id === commentId ? { ...comment, reactions: comment.reactions + 1 } : comment,
      ),
      notifications: addCommentReactionNotification(current, current.activeUserId, commentId),
    }));
    dispatchSharedAction({
      type: "comment.react",
      actorId: activeUser.id,
      actor: activeUser,
      commentId,
      amount: 1,
    });
  }

  function editComment(commentId: string, text: string) {
    if (!activeUser) return;
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
    dispatchSharedAction({
      type: "comment.update",
      actorId: activeUser.id,
      actor: activeUser,
      commentId,
      text: nextText,
    });
  }

  function deleteComment(commentId: string) {
    const actor = activeUser;
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
        hiddenCommentIdsByUser: removeScopedIds(current.hiddenCommentIdsByUser, idsToDelete),
        reports: current.reports.filter((report) => !report.commentId || !idsToDelete.has(report.commentId)),
      };
    });
    if (actor) {
      dispatchSharedAction({
        type: "comment.delete",
        actorId: actor.id,
        actor,
        commentId,
      });
    }
  }

  function hideComment(commentId: string) {
    setState((current) => ({
      ...current,
      hiddenCommentIdsByUser: addScopedId(current.hiddenCommentIdsByUser, current.activeUserId, commentId),
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
      hiddenCommentIdsByUser: addScopedId(current.hiddenCommentIdsByUser, current.activeUserId, commentId),
    }));
  }

  function editPost(postId: string, text: string, options?: PostUpdatePayload) {
    if (!activeUser) return;
    setState((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              text: text.trim(),
              ...(options?.kind ? { kind: options.kind } : {}),
              ...(options?.appearance ? { appearance: options.appearance } : {}),
              ...(options?.settings ? { settings: options.settings } : {}),
              ...(options?.sketch ? { sketch: options.sketch } : {}),
              ...(options?.checklist ? { checklist: options.checklist } : {}),
              ...(Object.prototype.hasOwnProperty.call(options ?? {}, "poll") ? { poll: options?.poll } : {}),
              editedAt: Date.now(),
            }
          : post,
      ),
    }));
    dispatchSharedAction({
      type: "post.update",
      actorId: activeUser.id,
      actor: activeUser,
      postId,
      text: text.trim(),
      options,
    });
  }

  function deletePost(postId: string) {
    const actor = activeUser;
    setState((current) => ({
      ...current,
      posts: current.posts.filter((post) => post.id !== postId),
      comments: current.comments.filter((comment) => comment.postId !== postId),
      postConnections: current.postConnections.filter(
        (connection) => connection.fromPostId !== postId && connection.toPostId !== postId,
      ),
      savedPostIds: current.savedPostIds.filter((id) => id !== postId),
      pinnedPostIds: current.pinnedPostIds.filter((id) => id !== postId),
      hiddenPostIds: current.hiddenPostIds.filter((id) => id !== postId),
      hiddenCommentIds: current.hiddenCommentIds.filter(
        (id) => current.comments.some((comment) => comment.id === id && comment.postId !== postId),
      ),
      savedPostIdsByUser: removeScopedIds(current.savedPostIdsByUser, new Set([postId])),
      pinnedPostIdsByUser: removeScopedIds(current.pinnedPostIdsByUser, new Set([postId])),
      hiddenPostIdsByUser: removeScopedIds(current.hiddenPostIdsByUser, new Set([postId])),
      hiddenCommentIdsByUser: removeScopedIds(
        current.hiddenCommentIdsByUser,
        new Set(current.comments.filter((comment) => comment.postId === postId).map((comment) => comment.id)),
      ),
    }));
    if (route.view === "post" && route.postId === postId) {
      navigate({ view: "feed" });
    }
    if (actor) {
      dispatchSharedAction({
        type: "post.delete",
        actorId: actor.id,
        actor,
        postId,
      });
    }
  }

  function togglePinnedPost(postId: string) {
    setState((current) => {
      const post = current.posts.find((item) => item.id === postId);
      if (!post || post.authorId !== current.activeUserId) return current;

      return {
        ...current,
        pinnedPostIdsByUser: toggleScopedId(current.pinnedPostIdsByUser, current.activeUserId, postId),
      };
    });
  }

  function toggleSavedPost(postId: string) {
    if (!activeUser) return;
    setState((current) => ({
      ...current,
      savedPostIdsByUser: !getPostSettings(current.posts.find((post) => post.id === postId)).saves
        ? current.savedPostIdsByUser
        : toggleScopedId(current.savedPostIdsByUser, current.activeUserId, postId),
    }));
    dispatchSharedAction({
      type: "post.save.toggle",
      actorId: activeUser.id,
      actor: activeUser,
      postId,
    });
  }

  function repostPost(postId: string) {
    const sourcePost = getRepostSourcePost(postById.get(postId), postById);
    if (!activeUser || !sourcePost) return;
    if (!getPostSettings(sourcePost).reposts) return;
    if (hasUserRepostedPost(sourcePost.id, activeUser.id, postById)) return;

    const wallId = getProfileWallId(activeUser.id);
    const position = getNewBoardPostPosition(state.posts.filter((post) => post.wallId === wallId), {
      attachments: [],
      repostOfId: sourcePost.id,
      text: "",
    });
    const repost: Post = {
      id: crypto.randomUUID(),
      wallId,
      authorId: activeUser.id,
      text: "",
      attachments: [],
      reactions: 0,
      views: {
        total: 0,
        uniqueUserIds: [],
      },
      position,
      repostOfId: sourcePost.id,
      createdAt: Date.now(),
    };

    setState((current) => {
      const currentPostById = new Map(current.posts.map((post) => [post.id, post]));
      if (hasUserRepostedPost(sourcePost.id, activeUser.id, currentPostById)) return current;

      return {
        ...current,
        walls: ensureWallExists(current.walls, repost.wallId, current.users),
        posts: [repost, ...current.posts],
        notifications: addPostNotification(current, {
          kind: "repost",
          actorId: activeUser.id,
          postId: sourcePost.id,
          text: "Заметка появилась на доске",
        }),
      };
    });
    dispatchSharedAction({
      type: "post.repost",
      actorId: activeUser.id,
      actor: activeUser,
      postId: sourcePost.id,
      repostId: repost.id,
      position: repost.position,
      createdAt: repost.createdAt,
    });
    celebrate("post");
  }

  function toggleChecklistItem(postId: string, itemId: string) {
    if (!activeUser) return;

    setState((current) => ({
      ...current,
      posts: current.posts.map((post) => {
        if (post.id !== postId || !post.checklist) return post;

        return {
          ...post,
          checklist: post.checklist.map((item) => {
            if (item.id !== itemId) return item;
            const isChecked = item.checkedBy.includes(current.activeUserId);
            return {
              ...item,
              checkedBy: isChecked
                ? item.checkedBy.filter((id) => id !== current.activeUserId)
                : [...item.checkedBy, current.activeUserId],
            };
          }),
        };
      }),
    }));
    dispatchSharedAction({
      type: "checklist.toggle",
      actorId: activeUser.id,
      actor: activeUser,
      postId,
      itemId,
    });
  }

  function voteInPoll(postId: string, optionId: string) {
    if (!activeUser) return;

    setState((current) => ({
      ...current,
      posts: current.posts.map((post) => {
        if (post.id !== postId || !post.poll) return post;
        const hasVotedOption = post.poll.options.some((option) =>
          option.id === optionId && option.voterIds.includes(current.activeUserId),
        );

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
                    ? option.voterIds.filter((id) => id !== current.activeUserId)
                    : [...option.voterIds, current.activeUserId],
                };
              }

              if (option.id === optionId) {
                return {
                  ...option,
                  voterIds: hasVotedOption
                    ? option.voterIds.filter((id) => id !== current.activeUserId)
                    : Array.from(new Set([...option.voterIds, current.activeUserId])),
                };
              }

              return {
                ...option,
                voterIds: option.voterIds.filter((id) => id !== current.activeUserId),
              };
            }),
          },
        };
      }),
    }));
    dispatchSharedAction({
      type: "poll.vote",
      actorId: activeUser.id,
      actor: activeUser,
      postId,
      optionId,
    });
  }

  function startPostConnection(postId: string) {
    setConnectionSourcePostId(postId);
  }

  function finishPostConnection(postId: string) {
    if (!activeUser || !connectionSourcePostId || connectionSourcePostId === postId) {
      setConnectionSourcePostId(null);
      return;
    }
    const connection: PostConnection = {
      id: crypto.randomUUID(),
      fromPostId: connectionSourcePostId,
      toPostId: postId,
      authorId: activeUser.id,
      createdAt: Date.now(),
    };

    setState((current) => {
      const toPost = current.posts.find((post) => post.id === postId);
      const fromPost = current.posts.find((post) => post.id === connectionSourcePostId);
      if (!fromPost || !toPost) return current;

      const exists = current.postConnections.some(
        (connection) => connection.fromPostId === connectionSourcePostId && connection.toPostId === postId,
      );
      if (exists) return current;

      return {
        ...current,
        postConnections: [
          connection,
          ...current.postConnections,
        ],
      };
    });
    dispatchSharedAction({
      type: "connection.create",
      actorId: activeUser.id,
      actor: activeUser,
      connection,
    });
    setConnectionSourcePostId(null);
  }

  function deletePostConnection(connectionId: string) {
    if (!activeUser) return;
    setState((current) => ({
      ...current,
      postConnections: current.postConnections.filter((connection) => connection.id !== connectionId),
    }));
    dispatchSharedAction({
      type: "connection.delete",
      actorId: activeUser.id,
      actor: activeUser,
      connectionId,
    });
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
      hiddenPostIdsByUser: addScopedId(current.hiddenPostIdsByUser, current.activeUserId, postId),
    }));
  }

  function hidePost(postId: string) {
    setState((current) => ({
      ...current,
      hiddenPostIdsByUser: addScopedId(current.hiddenPostIdsByUser, current.activeUserId, postId),
    }));
  }

  function toggleFollow(targetType: "user" | "wall", targetId: string) {
    if (!activeUser) return;

    setState((current) => {
      const existing = current.follows.find(
        (follow) => follow.userId === current.activeUserId && follow.targetType === targetType && follow.targetId === targetId,
      );
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
            userId: current.activeUserId,
            targetId,
            targetType,
            createdAt: Date.now(),
          },
          ...current.follows,
        ],
        notifications: addFollowNotification(current, activeUser.id, targetType, targetId),
      };
    });
    dispatchSharedAction({
      type: "follow.toggle",
      actorId: activeUser.id,
      actor: activeUser,
      targetId,
      targetType,
    });
  }

  function updateWallSettings(wallId: string, payload: WallSettingsPayload) {
    if (!activeUser) return;
    const wallUpdate: Partial<Wall> = {
      actionButtons: payload.actionButtons,
      avatarUrl: payload.avatarUrl.trim() || undefined,
      bannerUrl: payload.bannerUrl.trim() || undefined,
      avatarFocus: payload.avatarFocus,
      bannerFocus: payload.bannerFocus,
      accentColor: payload.accentColor || undefined,
      description: payload.description.trim(),
      name: payload.name.trim(),
      rules: payload.rules.trim(),
      privacyMode: payload.privacyMode,
      invite: payload.privacyMode === "public" ? undefined : normalizeWallInviteSettings(payload.invite),
      publishMode: payload.publishMode,
    };
    setState((current) => ({
      ...current,
      walls: current.walls.map((wall) =>
        wall.id === wallId
          ? {
              ...wall,
              ...wallUpdate,
            }
          : wall,
      ),
    }));
    dispatchSharedAction({
      type: "wall.update",
      actorId: activeUser.id,
      actor: activeUser,
      wallId,
      wall: wallUpdate,
    });
    setSettingsWallId(null);
  }

  function deleteWall(wallId: string) {
    const actor = activeUser;
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
        postConnections: current.postConnections.filter(
          (connection) => !postIds.has(connection.fromPostId) && !postIds.has(connection.toPostId),
        ),
        follows: current.follows.filter((follow) => follow.targetType !== "wall" || follow.targetId !== wallId),
        savedPostIds: current.savedPostIds.filter((postId) => !postIds.has(postId)),
        pinnedPostIds: current.pinnedPostIds.filter((postId) => !postIds.has(postId)),
        hiddenPostIds: current.hiddenPostIds.filter((postId) => !postIds.has(postId)),
        hiddenCommentIds: current.hiddenCommentIds.filter((commentId) => !commentIds.has(commentId)),
        savedPostIdsByUser: removeScopedIds(current.savedPostIdsByUser, postIds),
        pinnedPostIdsByUser: removeScopedIds(current.pinnedPostIdsByUser, postIds),
        hiddenPostIdsByUser: removeScopedIds(current.hiddenPostIdsByUser, postIds),
        hiddenCommentIdsByUser: removeScopedIds(current.hiddenCommentIdsByUser, commentIds),
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
    if (actor) {
      dispatchSharedAction({
        type: "wall.delete",
        actorId: actor.id,
        actor,
        wallId,
      });
    }

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
    <div className="shell" style={shellAccentStyle}>
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
          {sidebarSpaces.map((space) => (
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
          <div className={isDiscordUser ? "current-user-card with-logout" : "current-user-card"}>
            <button className="current-user" onClick={() => openProfile(activeUser.id)}>
              <Avatar user={activeUser} />
              <span>
                <strong>{activeUser.name}</strong>
                <UserStatusLabel forceOnline user={activeUser} />
              </span>
            </button>
            {isDiscordUser ? (
              <button className="user-logout" onClick={logoutDiscord} aria-label="Завершить сеанс Дискорда" title="Завершить сеанс">
                <LogOut size={15} />
              </button>
            ) : null}
          </div>
        ) : null}

        {!isDiscordUser ? (
          <AuthControls
            error={authError}
            onLogin={startDiscordAuth}
          />
        ) : null}

        {activeUser ? (
          <NotificationCenter
            activeUserId={activeUser.id}
            isOpen={isNotificationsOpen}
            notifications={state.notifications}
            unreadCount={unreadNotificationCount}
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
            followedWallIds={followedWallIds}
            spaces={visibleSpaces}
            activeUserId={activeUser?.id}
            commentsByPostId={commentsByPostId}
            connectionSourcePostId={connectionSourcePostId}
            postPositions={fieldPostPositions}
            postConnections={state.postConnections}
            postById={postById}
            pinnedPostIds={pinnedPostIds}
            savedPostIds={savedPostIds}
            userById={userById}
            wallById={wallById}
            onCreateSpace={() => setIsCreateSpaceOpen(true)}
            onDeletePost={deletePost}
            onDeletePostConnection={deletePostConnection}
            onEditPost={editPost}
            onFinishPostConnection={finishPostConnection}
            onFilterChange={setFeedFilter}
            onHidePost={hidePost}
            onMovePost={moveFieldPost}
            onOpenPost={(postId) => navigate({ view: "post", postId })}
            onOpenProfile={openProfile}
            onOpenSpace={(spaceId) => navigate({ view: "space", spaceId })}
            onPinPost={togglePinnedPost}
            onPublish={(text, attachments, options) =>
              publishPostToWall(getProfileWallId(activeUser?.id ?? ""), text, attachments, options)
            }
            onReact={react}
            onRecordView={recordPostView}
            onReportPost={reportPost}
            onRepost={repostPost}
            onStartPostConnection={startPostConnection}
            onToggleChecklistItem={toggleChecklistItem}
            onToggleSave={toggleSavedPost}
            onVotePoll={voteInPoll}
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
            onOpenMinecraft={() => navigate({ view: "space", spaceId: minecraftWallId })}
          />
        ) : null}

        {route.view === "spaceBoards" ? (
          <CommunityBoardsPage
            spaces={visibleSpaces}
            onCreateSpace={() => setIsCreateSpaceOpen(true)}
            onOpenFeed={() => navigate({ view: "feed" })}
            onOpenSpace={(spaceId) => navigate({ view: "space", spaceId })}
          />
        ) : null}

        {route.view === "profile" ? (
          <ProfilePage
            activeUser={activeUser}
            commentsByPostId={commentsByPostId}
            connectionSourcePostId={connectionSourcePostId}
            followedUserIds={followedUserIds}
            pinnedPostIds={pinnedPostIds}
            postConnections={state.postConnections}
            postById={postById}
            posts={state.posts.filter((post) => !hiddenPostIds.has(post.id))}
            savedPostIds={savedPostIds}
            user={activeProfile}
            userById={userById}
            profileWall={activeProfileWall}
            wallById={wallById}
            onDeletePost={deletePost}
            onDeletePostConnection={deletePostConnection}
            onEditPost={editPost}
            onFinishPostConnection={finishPostConnection}
            onFollow={(userId) => toggleFollow("user", userId)}
            onHidePost={hidePost}
            onOpenPost={(postId) => navigate({ view: "post", postId })}
            onOpenProfile={openProfile}
            onOpenSettings={() => openWallSettings(getProfileWallId(activeProfile?.id ?? ""))}
            onPinPost={togglePinnedPost}
            onPublish={(text, attachments, options) =>
              publishPostToWall(getProfileWallId(activeProfile?.id ?? ""), text, attachments, options)
            }
            onMovePost={movePost}
            onReact={react}
            onRecordView={recordPostView}
            onReportPost={reportPost}
            onRepost={repostPost}
            onStartPostConnection={startPostConnection}
            onToggleChecklistItem={toggleChecklistItem}
            onToggleSave={toggleSavedPost}
            onVotePoll={voteInPoll}
          />
        ) : null}

        {route.view === "space" ? (
          <SpacePage
            activeUser={activeUser}
            commentsByPostId={commentsByPostId}
            connectionSourcePostId={connectionSourcePostId}
            followedWallIds={followedWallIds}
            pinnedPostIds={pinnedPostIds}
            pinnedWallIds={pinnedWallIdSet}
            postConnections={state.postConnections}
            postById={postById}
            posts={state.posts.filter((post) => post.wallId === activeSpace?.id && !hiddenPostIds.has(post.id))}
            savedPostIds={savedPostIds}
            space={activeSpace}
            userById={userById}
            wallById={wallById}
            onCreateSpace={() => setIsCreateSpaceOpen(true)}
            onDeletePost={deletePost}
            onDeletePostConnection={deletePostConnection}
            onEditPost={editPost}
            onFinishPostConnection={finishPostConnection}
            onFollow={(wallId) => toggleFollow("wall", wallId)}
            onHidePost={hidePost}
            onOpenPost={(postId) => navigate({ view: "post", postId })}
            onOpenProfile={openProfile}
            onOpenSettings={openWallSettings}
            onPinPost={togglePinnedPost}
            onTogglePinnedWall={togglePinnedWall}
            onPublish={(text, attachments, options) => publishPostToWall(activeSpace?.id, text, attachments, options)}
            onMovePost={movePost}
            onReact={react}
            onRecordView={recordPostView}
            onReportPost={reportPost}
            onRepost={repostPost}
            onStartPostConnection={startPostConnection}
            onToggleChecklistItem={toggleChecklistItem}
            onToggleSave={toggleSavedPost}
            onVotePoll={voteInPoll}
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
            onToggleChecklistItem={toggleChecklistItem}
            onToggleSave={toggleSavedPost}
            onVotePoll={voteInPoll}
          />
        ) : null}
      </main>

      <MobileBottomNav
        activeRoute={route}
        activeUser={activeUser}
        navItems={navItems}
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
          onPublish={(text, attachments, options) => publishPostToWall(composerTargetWallId, text, attachments, options)}
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
          canDelete={!settingsWall.id.startsWith(profileWallPrefix) && settingsWall.id !== minecraftWallId}
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
  onLogin,
}: {
  error: string;
  onLogin: () => void;
}) {
  return (
    <div className="auth-controls">
      <button className="discord-button" onClick={onLogin}>
        <LogIn size={15} />
        Войти через Дискорд
      </button>
      {error ? <span className="auth-error">{error}</span> : null}
    </div>
  );
}

type StackedNotificationItem = NotificationItem & {
  stackCount: number;
  stackText: string;
};

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
  const visibleNotifications = stackNotificationItems(
    notifications.filter((item) => item.recipientId === activeUserId),
  )
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
                  <strong>{formatStackedNotificationText(item)}</strong>
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

function stackNotificationItems(items: NotificationItem[]): StackedNotificationItem[] {
  const groups = new Map<string, StackedNotificationItem>();

  for (const item of items) {
    const parsed = parseNotificationStackText(item.text);
    const key = [
      item.recipientId,
      item.actorId,
      item.kind,
      item.postId ?? "",
      item.commentId ?? "",
      parsed.text,
    ].join("|");
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        ...item,
        stackCount: parsed.count,
        stackText: parsed.text,
      });
      continue;
    }

    existing.stackCount += parsed.count;
    if (item.createdAt > existing.createdAt) {
      existing.id = item.id;
      existing.createdAt = item.createdAt;
      existing.readAt = item.readAt;
    } else if (!item.readAt) {
      existing.readAt = undefined;
    }
  }

  return Array.from(groups.values());
}

function parseNotificationStackText(text: string): { count: number; text: string } {
  const match = text.match(/\s+×(\d+)$/);
  return {
    count: match ? Math.max(1, Number(match[1]) || 1) : 1,
    text: text.replace(/\s+×\d+$/, ""),
  };
}

function formatStackedNotificationText(item: StackedNotificationItem): string {
  return item.stackCount > 1 ? `${item.stackText} ×${item.stackCount}` : item.stackText;
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
          <div className="pixel-popover" role="dialog" aria-label="Палитра пикселей">
            <div className="pixel-popover-head">
              <span>Пиксель</span>
              <button className="pixel-close" onClick={() => setIsPainting(false)} aria-label="Закрыть палитру">
                <X size={15} />
              </button>
            </div>
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
            <span className={cooldownLeft > 0 ? "pixel-cooldown locked" : "pixel-cooldown"} aria-live="polite">
              <i />
              {cooldownLeft > 0 ? `пауза ${Math.ceil(cooldownLeft / 1000)}с` : "можно ставить"}
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
  onOpenProfile,
  onNavigate,
}: {
  activeRoute: AppRoute;
  activeUser: UserProfile | undefined;
  navItems: AppNavItem[];
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
  connectionSourcePostId,
  followedWallIds,
  matchingSpaces,
  matchingUsers,
  hasSearch,
  pinnedPostIds,
  postConnections,
  postById,
  postPositions,
  posts,
  savedPostIds,
  spaces,
  userById,
  wallById,
  onCreateSpace,
  onDeletePost,
  onDeletePostConnection,
  onEditPost,
  onFinishPostConnection,
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
  onStartPostConnection,
  onToggleChecklistItem,
  onToggleSave,
  onVotePoll,
}: {
  filter: FeedFilter;
  activeUserId: string | undefined;
  allPosts: Post[];
  commentsByPostId: Map<string, Comment[]>;
  connectionSourcePostId: string | null;
  followedWallIds: Set<string>;
  matchingSpaces: Wall[];
  matchingUsers: UserProfile[];
  hasSearch: boolean;
  pinnedPostIds: Set<string>;
  postConnections: PostConnection[];
  postById: Map<string, Post>;
  postPositions: Record<string, PostPosition>;
  posts: Post[];
  savedPostIds: Set<string>;
  spaces: Wall[];
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onCreateSpace: () => void;
  onDeletePost: (postId: string) => void;
  onDeletePostConnection: (connectionId: string) => void;
  onEditPost: (postId: string, text: string, options?: PostUpdatePayload) => void;
  onFinishPostConnection: (postId: string) => void;
  onFilterChange: (filter: FeedFilter) => void;
  onHidePost: (postId: string) => void;
  onMovePost: (postId: string, x: number, y: number) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onOpenSpace: (spaceId: string) => void;
  onPinPost: (postId: string) => void;
  onPublish: (text: string, attachments: MediaAttachment[], options?: Partial<PostDraftOptions>) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReportPost: (postId: string) => void;
  onRepost: (postId: string) => void;
  onStartPostConnection: (postId: string) => void;
  onToggleChecklistItem: (postId: string, itemId: string) => void;
  onToggleSave: (postId: string) => void;
  onVotePoll: (postId: string, optionId: string) => void;
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
  const directorySpaces = filter === "following"
    ? spaces.filter((space) => followedWallIds.has(space.id))
    : filter === "all"
      ? spaces
      : [];
  const shouldShowBoardDirectory = !hasSearch && directorySpaces.length > 0;
  const feedPositionOverrides = postPositions;
  const feedDefaultOffsetY = getInitialFieldBoardDefaultY(shouldShowBoardDirectory);
  const fieldBoardHeight = getBoardCanvasHeight(posts, {
    defaultOffsetX: getInitialFieldBoardDefaultX(),
    defaultOffsetY: feedDefaultOffsetY,
    positionOverrides: feedPositionOverrides,
    usePostPositions: false,
  });

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
            onPublish={(text, attachments, options) => {
              onPublish(text, attachments, options);
              setIsCreateOpen(false);
            }}
          />
        </div>
      ) : null}

      {shouldShowBoardDirectory ? (
        <section className="board-directory" aria-label="Доски">
          {directorySpaces.slice(0, 5).map((space) => {
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
      ) : null}

      <WallBoard
        activeUserId={activeUserId}
        avoidProtectedRects={false}
        canMovePost={() => true}
        className="field-board"
        commentsByPostId={commentsByPostId}
        connectionSourcePostId={connectionSourcePostId}
        emptyText={emptyText}
        hint="перетащи карточки по странице"
        pinnedPostIds={pinnedPostIds}
        postConnections={postConnections}
        postById={postById}
        positionOverrides={feedPositionOverrides}
        posts={posts}
        preferPostPositions={false}
        savedPostIds={savedPostIds}
        title="Доска"
        userById={userById}
        wallById={wallById}
        onDeletePost={onDeletePost}
        onDeletePostConnection={onDeletePostConnection}
        onEditPost={onEditPost}
        onFinishPostConnection={onFinishPostConnection}
        onHidePost={onHidePost}
        onMovePost={onMovePost}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onPinPost={onPinPost}
        onReact={onReact}
        onRecordView={onRecordView}
        onReportPost={onReportPost}
        onRepost={onRepost}
        onStartPostConnection={onStartPostConnection}
        onToggleChecklistItem={onToggleChecklistItem}
        onToggleSave={onToggleSave}
        onVotePoll={onVotePoll}
      />

    </section>
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
  avoidProtectedRects = true,
  canMovePost = () => true,
  className,
  commentsByPostId,
  connectionSourcePostId,
  dynamicFieldOffsets = true,
  emptyText,
  hint = "перетащи заметку",
  pinnedPostIds,
  postConnections,
  postById,
  positionOverrides,
  preferPostPositions = true,
  posts,
  resolveProtectedLayout = true,
  savedPostIds,
  title = "Доска",
  userById,
  wallById,
  onDeletePost,
  onDeletePostConnection,
  onEditPost,
  onFinishPostConnection,
  onHidePost,
  onMovePost,
  onOpenPost,
  onOpenProfile,
  onPinPost,
  onReact,
  onRecordView,
  onReportPost,
  onRepost,
  onStartPostConnection,
  onToggleChecklistItem,
  onToggleSave,
  onVotePoll,
}: {
  activeUserId: string | undefined;
  avoidProtectedRects?: boolean;
  canMovePost?: (post: Post) => boolean;
  className?: string;
  commentsByPostId: Map<string, Comment[]>;
  connectionSourcePostId: string | null;
  dynamicFieldOffsets?: boolean;
  emptyText: string;
  hint?: string;
  pinnedPostIds: Set<string>;
  postConnections: PostConnection[];
  postById: Map<string, Post>;
  positionOverrides?: Record<string, PostPosition>;
  preferPostPositions?: boolean;
  posts: Post[];
  resolveProtectedLayout?: boolean;
  savedPostIds: Set<string>;
  title?: string;
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onDeletePost: (postId: string) => void;
  onDeletePostConnection: (connectionId: string) => void;
  onEditPost: (postId: string, text: string, options?: PostUpdatePayload) => void;
  onFinishPostConnection: (postId: string) => void;
  onHidePost: (postId: string) => void;
  onMovePost: (postId: string, x: number, y: number) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onPinPost: (postId: string) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReportPost: (postId: string) => void;
  onRepost: (postId: string) => void;
  onStartPostConnection: (postId: string) => void;
  onToggleChecklistItem: (postId: string, itemId: string) => void;
  onToggleSave: (postId: string) => void;
  onVotePoll: (postId: string, optionId: string) => void;
}) {
  const boardClassNames = className?.split(" ") ?? [];
  const isFieldBoard = boardClassNames.includes("field-board");
  const [drag, setDrag] = useState<{
    height: number;
    origin: PostPosition;
    pointerX: number;
    pointerY: number;
    postId: string;
    width: number;
  } | null>(null);
  const boardRef = useRef<HTMLElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const [boardDefaultX, setBoardDefaultX] = useState(() => isFieldBoard ? getInitialFieldBoardDefaultX() : 0);
  const [boardDefaultY, setBoardDefaultY] = useState(() => isFieldBoard ? getInitialFieldBoardDefaultY() : 0);
  const [protectedRects, setProtectedRects] = useState<BoardRect[]>([]);
  const protectedRectsRef = useRef<BoardRect[]>([]);
  const [previewPosition, setPreviewPosition] = useState<PostPosition | null>(null);
  const previewPositionRef = useRef<PostPosition | null>(null);
  const boardRightReserve = 0;
  const boardMaxX = isFieldBoard && boardWidth > 0
    ? Math.max(0, boardWidth - boardCardWidth - boardGap - boardRightReserve)
    : 1800;
  const basePostLayout = useMemo(
    () => resolveBoardPostLayout(posts, {
      defaultOffsetY: boardDefaultY,
      defaultOffsetX: boardDefaultX,
      maxX: boardMaxX,
      positionOverrides,
      usePostPositions: preferPostPositions,
    }),
    [boardDefaultX, boardDefaultY, boardMaxX, positionOverrides, posts, preferPostPositions],
  );
  const postLayout = useMemo(
    () => isFieldBoard && avoidProtectedRects && resolveProtectedLayout
      ? resolveSafeBoardLayout(basePostLayout, protectedRects, boardMaxX)
      : basePostLayout,
    [avoidProtectedRects, basePostLayout, boardMaxX, isFieldBoard, protectedRects, resolveProtectedLayout],
  );
  const connectionSourcePost = connectionSourcePostId ? postById.get(connectionSourcePostId) : undefined;
  const boardHeight = Math.max(
    720,
    ...postLayout.map(({ height, position }) => position.y + height + boardGap),
  );

  useEffect(() => {
    const node = boardRef.current;
    if (!node || !isFieldBoard) return;

    const updateWidth = () => {
      const boardRect = node.getBoundingClientRect();
      const mainRect = node.closest(".main")?.getBoundingClientRect();
      const nextBoardWidth = Math.round(boardRect.width);
      const defaultStartX = Math.max(0, Math.round((mainRect?.left ?? boardRect.left) - boardRect.left));
      const defaultStartY = dynamicFieldOffsets ? getFieldBoardContentStartY(node) : getInitialFieldBoardDefaultY(false);
      const maxDefaultX = Math.max(0, nextBoardWidth - boardCardWidth - boardGap - boardRightReserve);
      const nextProtectedRects = getFieldProtectedRects(node);
      protectedRectsRef.current = nextProtectedRects;
      setBoardWidth(Math.round(boardRect.width));
      setBoardDefaultX(Math.min(maxDefaultX, dynamicFieldOffsets ? defaultStartX : getInitialFieldBoardDefaultX()));
      setBoardDefaultY(defaultStartY);
      setProtectedRects(nextProtectedRects);
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [dynamicFieldOffsets, isFieldBoard, posts.length]);

  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;

    function handlePointerMove(event: PointerEvent) {
      const rawPosition = clampPostPosition({
        x: activeDrag.origin.x + event.clientX - activeDrag.pointerX,
        y: activeDrag.origin.y + event.clientY - activeDrag.pointerY,
      }, getBoardMaxXForWidth(boardMaxX, activeDrag.width));
      const nextPosition = isFieldBoard && avoidProtectedRects
        ? resolveSafeBoardPosition(rawPosition, protectedRectsRef.current, [], boardMaxX, activeDrag.height, activeDrag.width)
        : rawPosition;
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
  }, [avoidProtectedRects, boardMaxX, drag, isFieldBoard, onMovePost]);

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, post: Post, position: PostPosition) {
    if (event.button !== 0) return;
    if (window.innerWidth < 760) return;
    if (!canMovePost(post)) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({
      height: getEstimatedBoardCardHeight(post),
      origin: position,
      pointerX: event.clientX,
      pointerY: event.clientY,
      postId: post.id,
      width: getEstimatedBoardCardWidth(post),
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
      {connectionSourcePost ? (
        <div className="connection-prompt" data-no-open>
          <ArrowRight size={16} />
          <span>
            <strong>Стрелка отсюда</strong>
            <small>Выбери заметку, куда вести связь</small>
          </span>
          <button type="button" onClick={() => onFinishPostConnection(connectionSourcePost.id)}>
            Отмена
          </button>
        </div>
      ) : null}
      <div className="wall-board-canvas" style={{ "--board-content-height": `${boardHeight}px` } as CSSProperties}>
        <BoardConnectionLayer
          connections={postConnections}
          layout={postLayout}
          onDeleteConnection={onDeletePostConnection}
        />
        {postLayout.map(({ post, position, width }) => {
          const commentCount = commentsByPostId.get(post.id)?.length ?? 0;
          const currentPosition = drag?.postId === post.id && previewPosition ? previewPosition : position;
          const canDragPost = canMovePost(post);

          return (
            <div
              key={post.id}
              className={[
                "wall-board-item",
                canDragPost ? "can-drag" : "",
                drag?.postId === post.id ? "dragging" : "",
              ].filter(Boolean).join(" ")}
              style={
                {
                  "--board-x": `${currentPosition.x}px`,
                  "--board-y": `${currentPosition.y}px`,
                  "--board-card-width": `${width}px`,
                } as CSSProperties
              }
            >
              {canDragPost ? (
                <button
                  type="button"
                  className="board-drag-handle"
                  data-drag-handle
                  title="Перетащить карточку"
                  aria-label="Перетащить карточку"
                  onPointerDown={(event) => startDrag(event, post, currentPosition)}
                />
              ) : null}
              <PostCard
                activeUserId={activeUserId}
                commentCount={commentCount}
                canCreateConnection={canDragPost}
                connectionSourcePostId={connectionSourcePostId}
                hasReposted={hasUserRepostedPost(post.id, activeUserId, postById)}
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
                onFinishConnection={onFinishPostConnection}
                onHide={onHidePost}
                onOpenPost={onOpenPost}
                onOpenProfile={onOpenProfile}
                onPin={onPinPost}
                onReact={onReact}
                onRecordView={onRecordView}
                onReport={onReportPost}
                onRepost={onRepost}
                onStartConnection={onStartPostConnection}
                onToggleChecklistItem={onToggleChecklistItem}
                onToggleSave={onToggleSave}
                onVotePoll={onVotePoll}
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

function UserStatusLabel({
  className = "",
  forceOnline = false,
  user,
}: {
  className?: string;
  forceOnline?: boolean;
  user: UserProfile | undefined;
}) {
  const status = getUserStatus(user, forceOnline);
  const isOnline = status === "Онлайн";
  const statusClassName = ["user-status", className, isOnline ? "online" : ""].filter(Boolean).join(" ");

  return (
    <small className={statusClassName}>
      {isOnline ? <span className="status-dot" aria-hidden="true" /> : null}
      <span>{status}</span>
    </small>
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
  connectionSourcePostId,
  followedWallIds,
  pinnedPostIds,
  pinnedWallIds,
  postConnections,
  postById,
  posts,
  savedPostIds,
  space,
  userById,
  wallById,
  onCreateSpace,
  onDeletePost,
  onDeletePostConnection,
  onEditPost,
  onFinishPostConnection,
  onFollow,
  onHidePost,
  onOpenPost,
  onOpenProfile,
  onOpenSettings,
  onPinPost,
  onTogglePinnedWall,
  onPublish,
  onMovePost,
  onReact,
  onRecordView,
  onReportPost,
  onRepost,
  onStartPostConnection,
  onToggleChecklistItem,
  onToggleSave,
  onVotePoll,
}: {
  activeUser: UserProfile | undefined;
  commentsByPostId: Map<string, Comment[]>;
  connectionSourcePostId: string | null;
  followedWallIds: Set<string>;
  pinnedPostIds: Set<string>;
  pinnedWallIds: Set<string>;
  postConnections: PostConnection[];
  postById: Map<string, Post>;
  posts: Post[];
  savedPostIds: Set<string>;
  space: Wall | undefined;
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onCreateSpace: () => void;
  onDeletePost: (postId: string) => void;
  onDeletePostConnection: (connectionId: string) => void;
  onEditPost: (postId: string, text: string, options?: PostUpdatePayload) => void;
  onFinishPostConnection: (postId: string) => void;
  onFollow: (wallId: string) => void;
  onHidePost: (postId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onOpenSettings: (wallId: string) => void;
  onPinPost: (postId: string) => void;
  onTogglePinnedWall: (wallId: string) => void;
  onPublish: (text: string, attachments: MediaAttachment[], options?: Partial<PostDraftOptions>) => void;
  onMovePost: (postId: string, x: number, y: number) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReportPost: (postId: string) => void;
  onRepost: (postId: string) => void;
  onStartPostConnection: (postId: string) => void;
  onToggleChecklistItem: (postId: string, itemId: string) => void;
  onToggleSave: (postId: string) => void;
  onVotePoll: (postId: string, optionId: string) => void;
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
  const isPinnedInMenu = pinnedWallIds.has(space.id);
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
        <span className="space-kicker">Доска</span>
        <div className="space-copy">
          <div className="wall-title-row">
            <WallAvatar fallback={space.name} wall={space} />
            <div>
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
          <div className={canManage ? "space-action-row has-settings" : "space-action-row"}>
            <button className={isFollowing ? "follow-button active" : "follow-button"} onClick={() => onFollow(space.id)}>
              {isFollowing ? <Check size={15} /> : <CirclePlus size={15} />}
              {isFollowing ? "Подписка" : "Подписаться"}
            </button>
            <button
              className={isPinnedInMenu ? "wall-settings-button text menu-pin-button active" : "wall-settings-button text menu-pin-button"}
              onClick={() => onTogglePinnedWall(space.id)}
              aria-label={isPinnedInMenu ? "Убрать доску из левого меню" : "Добавить доску в левое меню"}
              title={isPinnedInMenu ? "Убрать из меню" : "Добавить в меню"}
            >
              <Pin size={15} />
              {isPinnedInMenu ? "Из меню" : "В меню"}
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
        <Composer
          className="desktop-composer field-composer board-composer"
          targetLabel={`Доска ${formatWallTextName(space)}`}
          wall={space}
          onPublish={onPublish}
        />
      ) : null}

      <WallBoard
        activeUserId={activeUser?.id}
        canMovePost={(post) => canMoveSharedPost(post, [...wallById.values()], activeUser?.id)}
        className="field-board space-field-board"
        commentsByPostId={commentsByPostId}
        connectionSourcePostId={connectionSourcePostId}
        dynamicFieldOffsets={false}
        emptyText="На этой доске пока нет заметок"
        hint="перетащи карточки по доске"
        pinnedPostIds={pinnedPostIds}
        postConnections={postConnections}
        postById={postById}
        posts={posts}
        resolveProtectedLayout={false}
        savedPostIds={savedPostIds}
        userById={userById}
        wallById={wallById}
        onDeletePost={onDeletePost}
        onDeletePostConnection={onDeletePostConnection}
        onEditPost={onEditPost}
        onFinishPostConnection={onFinishPostConnection}
        onHidePost={onHidePost}
        onMovePost={onMovePost}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onPinPost={onPinPost}
        onReact={onReact}
        onRecordView={onRecordView}
        onReportPost={onReportPost}
        onRepost={onRepost}
        onStartPostConnection={onStartPostConnection}
        onToggleChecklistItem={onToggleChecklistItem}
        onToggleSave={onToggleSave}
        onVotePoll={onVotePoll}
      />
    </section>
  );
}

type TextFormatAction = "bold" | "italic" | "code" | "quote" | "list" | "link";

const textFormatActions: Array<{
  action: TextFormatAction;
  icon: React.ReactNode;
  label: string;
}> = [
  { action: "bold", icon: <Bold size={15} />, label: "Жирный" },
  { action: "italic", icon: <Italic size={15} />, label: "Курсив" },
  { action: "code", icon: <Code2 size={15} />, label: "Код" },
  { action: "quote", icon: <Quote size={15} />, label: "Цитата" },
  { action: "list", icon: <List size={15} />, label: "Список" },
  { action: "link", icon: <Link2 size={15} />, label: "Ссылка" },
];

function FormattingTextarea({
  autoFocus = false,
  onChange,
  onPaste,
  placeholder,
  value,
}: {
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  value: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isInlineMenuOpen, setIsInlineMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuPosition && !isInlineMenuOpen) return;

    function close() {
      setMenuPosition(null);
      setIsInlineMenuOpen(false);
    }

    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [isInlineMenuOpen, menuPosition]);

  function openMenuAt(x: number, y: number) {
    setMenuPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - 220)),
      y: Math.max(8, Math.min(y, window.innerHeight - 260)),
    });
  }

  function applyFormat(action: TextFormatAction) {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? value.length;
    const selectionEnd = textarea?.selectionEnd ?? value.length;
    const result = formatTextSelection(value, selectionStart, selectionEnd, action);

    onChange(result.value);
    setMenuPosition(null);
    setIsInlineMenuOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  function handleContextMenu(event: React.MouseEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    openMenuAt(event.clientX, event.clientY);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!event.metaKey && !event.ctrlKey) return;

    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      applyFormat("bold");
      return;
    }
    if (key === "i") {
      event.preventDefault();
      applyFormat("italic");
      return;
    }
    if (key === "k") {
      event.preventDefault();
      applyFormat("link");
    }
  }

  return (
    <div className="format-textarea" data-no-open>
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="format-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setMenuPosition(null);
          setIsInlineMenuOpen((value) => !value);
        }}
        aria-label="Форматирование текста"
        title="Форматирование текста"
      >
        <Type size={15} />
        Aa
      </button>
      {isInlineMenuOpen ? (
        <TextFormatMenu
          anchored
          onApply={applyFormat}
        />
      ) : null}
      {menuPosition ? (
        <TextFormatMenu
          x={menuPosition.x}
          y={menuPosition.y}
          onApply={applyFormat}
        />
      ) : null}
    </div>
  );
}

function TextFormatMenu({
  anchored = false,
  x,
  y,
  onApply,
}: {
  anchored?: boolean;
  x?: number;
  y?: number;
  onApply: (action: TextFormatAction) => void;
}) {
  return (
    <div
      className={anchored ? "text-format-menu inline-format-menu" : "text-format-menu"}
      style={anchored ? undefined : { left: x, top: y } as CSSProperties}
      onClick={(event) => event.stopPropagation()}
      data-no-open
    >
      {textFormatActions.map((item) => (
        <button key={item.action} type="button" onClick={() => onApply(item.action)}>
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Composer({
  className = "",
  objectTools = true,
  placeholder = "Новая заметка",
  targetLabel,
  wall,
  onPublish,
}: {
  className?: string;
  objectTools?: boolean;
  placeholder?: string;
  targetLabel?: string;
  wall?: Wall;
  onPublish: (text: string, attachments: MediaAttachment[], options?: Partial<PostDraftOptions>) => void;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const [options, setOptions] = useState<PostDraftOptions>(() => createDefaultPostDraftOptions());
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerClassName = [
    "composer-card",
    objectTools ? "composer-note-builder" : "",
    objectTools ? `post-bg-${options.appearance.background}` : "",
    objectTools ? `post-shape-${options.appearance.shape}` : "",
    objectTools ? `post-size-${options.appearance.size}` : "",
    isDraggingFiles ? "is-dragging-files" : "",
    className,
  ].filter(Boolean).join(" ");
  const composerStyle = objectTools ? getPostAccentStyle(options.appearance, wall) : undefined;

  useEffect(() => {
    if (!isAttachMenuOpen) return;

    function closeMenu() {
      setIsAttachMenuOpen(false);
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeMenu);
    };
  }, [isAttachMenuOpen]);

  async function attachFiles(files: FileList | File[] | null) {
    const mediaFiles = Array.from(files ?? []).filter((file) => getMediaKind(file));
    if (mediaFiles.length === 0 || attachments.length >= maxFiles) return;

    setIsReading(true);
    const next: MediaAttachment[] = [];

    try {
      for (const file of mediaFiles.slice(0, maxFiles - attachments.length)) {
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

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedFiles = getClipboardMediaFiles(event.clipboardData);
    if (pastedFiles.length === 0) return;

    event.preventDefault();
    void attachFiles(pastedFiles);
  }

  function hasDraggedFiles(dataTransfer: DataTransfer) {
    return Array.from(dataTransfer.types).includes("Files");
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;

    setIsDraggingFiles(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;

    event.preventDefault();
    setIsDraggingFiles(false);

    const files = Array.from(event.dataTransfer.files).filter((file) => getMediaKind(file));
    if (files.length > 0) {
      void attachFiles(files);
    }
  }

  function openFilePicker() {
    setIsAttachMenuOpen(false);
    fileInputRef.current?.click();
  }

  function enableObject(kind: Extract<PostKind, "sketch" | "poll" | "list">) {
    setOptions((current) => {
      const patch: Partial<PostDraftOptions> = { kind };

      if (kind === "poll" && !current.poll) {
        patch.poll = createDefaultPoll(text);
      }

      if (kind === "list" && current.checklist.length === 0) {
        patch.checklist = [{ id: crypto.randomUUID(), text: "", checkedBy: [] }];
      }

      if (kind === "sketch" && current.appearance.size === "compact") {
        patch.appearance = { ...current.appearance, size: "normal" };
      }

      return { ...current, ...patch };
    });
    setIsAttachMenuOpen(false);
  }

  function updateAppearance(patch: Partial<PostAppearance>) {
    setOptions((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        ...patch,
      },
    }));
  }

  function handleResizePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!objectTools) return;

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;

    function handlePointerMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const size: PostAppearance["size"] = dy > 84
        ? "tall"
        : dx > 96
          ? "wide"
          : dx < -54 || dy < -54
            ? "compact"
            : "normal";

      updateAppearance({ size });
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function submit() {
    if (objectTools) {
      if (!hasPublishablePostDraft(text, attachments, options)) return;
      onPublish(text, attachments, options);
    } else {
      if (!text.trim() && attachments.length === 0) return;
      onPublish(text, attachments);
    }
    setText("");
    setAttachments([]);
    setOptions(createDefaultPostDraftOptions());
    setIsAttachMenuOpen(false);
    setIsAdvancedOpen(false);
  }

  return (
    <section
      className={composerClassName}
      style={composerStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {targetLabel ? (
        <div className="composer-target">
          <span>Публикация</span>
          <strong>{targetLabel}</strong>
        </div>
      ) : null}

      <FormattingTextarea
        value={text}
        onChange={setText}
        onPaste={handlePaste}
        placeholder={placeholder}
      />
      {isDraggingFiles ? (
        <div className="composer-drop-overlay" data-no-open>
          <Paperclip size={18} />
          <span>Отпусти файл</span>
        </div>
      ) : null}

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

      {objectTools ? (
        <PostObjectEditor
          options={options}
          showControls={isAdvancedOpen}
          text={text}
          wall={wall}
          onChange={setOptions}
        />
      ) : null}

      <div className="composer-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          onChange={(event) => attachFiles(event.target.files)}
        />
        <div className="composer-attach" onClick={(event) => event.stopPropagation()}>
          <IconButton
            label="Вложения"
            onClick={() => setIsAttachMenuOpen((value) => !value)}
          >
            <Paperclip size={17} />
          </IconButton>
          {isAttachMenuOpen ? (
            <div className="composer-attach-menu" data-no-open>
              <button type="button" onClick={openFilePicker}>
                <ImageIcon size={17} />
                Фото или видео
              </button>
              <button type="button" onClick={openFilePicker}>
                <AudioLines size={17} />
                Звук
              </button>
              {objectTools ? (
                <>
                  <button type="button" onClick={() => enableObject("sketch")}>
                    <Brush size={17} />
                    Рисунок
                  </button>
                  <button type="button" onClick={() => enableObject("poll")}>
                    <Vote size={17} />
                    Голосование
                  </button>
                  <button type="button" onClick={() => enableObject("list")}>
                    <List size={17} />
                    Список
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {objectTools ? (
          <IconButton
            label="Настройки заметки"
            onClick={() => setIsAdvancedOpen((value) => !value)}
          >
            <SlidersHorizontal size={17} />
          </IconButton>
        ) : null}
        <button
          className="publish"
          disabled={isReading || (objectTools ? !hasPublishablePostDraft(text, attachments, options) : (!text.trim() && attachments.length === 0))}
          onClick={submit}
          aria-label="Опубликовать"
          title="Опубликовать"
        >
          <Send size={16} />
        </button>
      </div>
      {objectTools ? (
        <button
          type="button"
          className="composer-resize-handle"
          onPointerDown={handleResizePointerDown}
          aria-label="Изменить размер заметки"
          title="Тяни, чтобы изменить размер заметки"
        >
          <span aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

function PostObjectEditor({
  compact = false,
  options,
  showControls = false,
  text,
  wall,
  onChange,
}: {
  compact?: boolean;
  options: PostDraftOptions;
  showControls?: boolean;
  text: string;
  wall?: Wall;
  onChange: (options: PostDraftOptions) => void;
}) {
  const editorClassName = compact ? "post-object-editor compact" : "post-object-editor";
  const hasSpecialEditor = options.kind === "sketch" ||
    options.kind === "poll" ||
    options.kind === "list" ||
    options.kind === "checklist" ||
    options.sketch.length > 0 ||
    options.checklist.length > 0 ||
    Boolean(options.poll);
  const customPostAccentValue = normalizeHexColor(options.appearance.accentColor) ??
    getWallAccentOption(wall?.accentColor ?? wallAccentOptions[0].id).accent;
  const isCustomPostAccent = Boolean(normalizeHexColor(options.appearance.accentColor));

  function update(patch: Partial<PostDraftOptions>) {
    onChange({ ...options, ...patch });
  }

  function updateSettings(key: keyof PostInteractionSettings) {
    update({
      settings: {
        ...options.settings,
        [key]: !options.settings[key],
      },
    });
  }

  function updateAppearance(patch: Partial<PostAppearance>) {
    update({
      appearance: {
        ...options.appearance,
        ...patch,
      },
    });
  }

  if (!showControls && !hasSpecialEditor) return null;

  return (
    <div className={editorClassName} data-no-open>
      {showControls ? (
        <div className="post-object-toolbar">
        <details className="post-object-section post-object-small-section">
          <summary>
            <Palette size={15} />
            Вид
          </summary>
          <div className="post-object-controls">
            <DraftAppearancePreview
              appearance={options.appearance}
              text={text}
              wall={wall}
            />
            <ControlGroup label="Размер">
              {[
                ["compact", "Маленькая"],
                ["normal", "Обычная"],
                ["wide", "Широкая"],
                ["tall", "Высокая"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={options.appearance.size === id ? "active" : ""}
                  onClick={() => updateAppearance({ size: id as PostAppearance["size"] })}
                >
                  {label}
                </button>
              ))}
            </ControlGroup>
            <ControlGroup label="Фон">
              {[
                ["plain", "Чисто"],
                ["soft", "Мягко"],
                ["glass", "Стекло"],
                ["gradient", "Градиент"],
                ["paper", "Бумага"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={options.appearance.background === id ? "active" : ""}
                  onClick={() => updateAppearance({ background: id as PostAppearance["background"] })}
                >
                  {label}
                </button>
              ))}
            </ControlGroup>
            <ControlGroup label="Форма">
              {[
                ["soft", "Мягкая"],
                ["round", "Круглая"],
                ["sharp", "Острая"],
                ["ticket", "Билет"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={options.appearance.shape === id ? "active" : ""}
                  onClick={() => updateAppearance({ shape: id as PostAppearance["shape"] })}
                >
                  {label}
                </button>
              ))}
            </ControlGroup>
            <div className="post-accent-row" aria-label="Цвет заметки">
              {wallAccentOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={options.appearance.accentColor === option.id ? "active" : ""}
                  onClick={() => updateAppearance({ accentColor: options.appearance.accentColor === option.id ? undefined : option.id })}
                  style={{ "--wall-swatch": option.accent } as CSSProperties}
                  aria-label={option.label}
                />
              ))}
              <label
                className={isCustomPostAccent ? "post-accent-custom active" : "post-accent-custom"}
                style={{ "--wall-swatch": customPostAccentValue } as CSSProperties}
                title="Свой цвет"
              >
                <span />
                <input
                  type="color"
                  value={customPostAccentValue}
                  onChange={(event) => updateAppearance({ accentColor: event.target.value })}
                  aria-label="Свой цвет заметки"
                />
              </label>
            </div>
          </div>
        </details>

        <details className="post-object-section post-object-small-section">
          <summary>
            <Settings size={15} />
            Действия
          </summary>
          <div className="post-toggle-grid">
            {[
              ["reactions", "Огоньки"],
              ["comments", "Ответы"],
              ["views", "Просмотры"],
              ["saves", "Сохранение"],
              ["reposts", "Репост"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={options.settings[key as keyof PostInteractionSettings] ? "active" : ""}
                onClick={() => updateSettings(key as keyof PostInteractionSettings)}
              >
                {options.settings[key as keyof PostInteractionSettings] ? <Check size={14} /> : <X size={14} />}
                {label}
              </button>
            ))}
          </div>
        </details>
        </div>
      ) : null}

      {(options.kind === "sketch" || options.sketch.length > 0) ? (
        <SketchEditor
          strokes={options.sketch}
          onChange={(sketch) => update({ sketch })}
        />
      ) : null}

      {(options.kind === "checklist" || options.kind === "list" || options.checklist.length > 0) ? (
        <ChecklistEditor
          items={options.checklist}
          onChange={(checklist) => update({ checklist })}
        />
      ) : null}

      {(options.kind === "poll") ? (
        <PollEditor
          poll={options.poll}
          text={text}
          onChange={(poll) => update({ poll })}
        />
      ) : null}
    </div>
  );
}

function DraftAppearancePreview({
  appearance,
  text,
  wall,
}: {
  appearance: PostAppearance;
  text: string;
  wall?: Wall;
}) {
  const previewText = text.trim() || "Новая заметка";

  return (
    <div
      className={[
        "draft-appearance-preview",
        `post-bg-${appearance.background}`,
        `post-shape-${appearance.shape}`,
        `post-size-${appearance.size}`,
      ].join(" ")}
      style={getPostAccentStyle(appearance, wall)}
    >
      <span>Предпросмотр</span>
      <strong>{previewText.slice(0, 120)}</strong>
      <footer>
        <i><Flame size={13} /> 0</i>
        <i><MessageCircle size={13} /> 0</i>
        <i><Eye size={13} /> 0</i>
      </footer>
    </div>
  );
}

function ControlGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="control-group">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) {
  function updateItem(id: string, text: string) {
    onChange(items.map((item) => (item.id === id ? { ...item, text } : item)));
  }

  return (
    <details className="post-object-section" open>
      <summary>
        <CheckSquare size={15} />
        Список
      </summary>
      <div className="checklist-editor">
        {(items.length > 0 ? items : [{ id: crypto.randomUUID(), text: "", checkedBy: [] }]).map((item) => (
          <label key={item.id}>
            <CheckSquare size={14} />
            <input
              value={item.text}
              onChange={(event) => {
                updateItem(item.id, event.target.value);
                if (items.length === 0) onChange([{ ...item, text: event.target.value }]);
              }}
              placeholder="Пункт"
            />
            <button type="button" onClick={() => onChange(items.filter((current) => current.id !== item.id))} aria-label="Удалить пункт">
              <X size={13} />
            </button>
          </label>
        ))}
        <button
          type="button"
          className="tiny-add-button"
          onClick={() => onChange([...items, { id: crypto.randomUUID(), text: "", checkedBy: [] }].slice(0, 24))}
        >
          <Plus size={14} />
          Пункт
        </button>
      </div>
    </details>
  );
}

function PollEditor({
  poll,
  text,
  onChange,
}: {
  poll: PostPoll | undefined;
  text: string;
  onChange: (poll: PostPoll | undefined) => void;
}) {
  const currentPoll = poll ?? createDefaultPoll(text);

  function updateOption(id: string, optionText: string) {
    onChange({
      ...currentPoll,
      options: currentPoll.options.map((option) => (option.id === id ? { ...option, text: optionText } : option)),
    });
  }

  return (
    <details className="post-object-section" open>
      <summary>
        <Vote size={15} />
        Голосование
      </summary>
      <div className="poll-editor">
        <label>
          <span>Вопрос</span>
          <input
            value={currentPoll.question}
            onChange={(event) => onChange({ ...currentPoll, question: event.target.value })}
            placeholder="Вопрос"
          />
        </label>
        <button
          type="button"
          className={currentPoll.multi ? "toggle-line active" : "toggle-line"}
          onClick={() => onChange({ ...currentPoll, multi: !currentPoll.multi })}
        >
          <Check size={14} />
          Несколько вариантов
        </button>
        <div className="poll-option-editor">
          {currentPoll.options.map((option, index) => (
            <label key={option.id}>
              <span>{index + 1}</span>
              <input value={option.text} onChange={(event) => updateOption(option.id, event.target.value)} />
              <button
                type="button"
                onClick={() => onChange({ ...currentPoll, options: currentPoll.options.filter((item) => item.id !== option.id) })}
                aria-label="Удалить вариант"
              >
                <X size={13} />
              </button>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="tiny-add-button"
          disabled={currentPoll.options.length >= 8}
          onClick={() =>
            onChange({
              ...currentPoll,
              options: [...currentPoll.options, { id: crypto.randomUUID(), text: `Вариант ${currentPoll.options.length + 1}`, voterIds: [] }],
            })
          }
        >
          <Plus size={14} />
          Вариант
        </button>
      </div>
    </details>
  );
}

function SketchEditor({
  strokes,
  onChange,
}: {
  strokes: SketchStroke[];
  onChange: (strokes: SketchStroke[]) => void;
}) {
  const [color, setColor] = useState(sketchPalette[2]);
  const [width, setWidth] = useState(4);
  const [draftStroke, setDraftStroke] = useState<SketchStroke | null>(null);
  const canvasRef = useRef<SVGSVGElement | null>(null);

  function getPoint(event: React.PointerEvent<SVGSVGElement>): SketchPoint | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10)),
      y: Math.max(0, Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10)),
    };
  }

  function startDraw(event: React.PointerEvent<SVGSVGElement>) {
    const point = getPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraftStroke({
      id: crypto.randomUUID(),
      color,
      width,
      points: [point],
    });
  }

  function draw(event: React.PointerEvent<SVGSVGElement>) {
    if (!draftStroke || event.buttons !== 1) return;
    const point = getPoint(event);
    if (!point) return;
    setDraftStroke((current) => current ? { ...current, points: [...current.points, point].slice(-300) } : current);
  }

  function endDraw() {
    if (!draftStroke) return;
    if (draftStroke.points.length > 1) {
      onChange([...strokes, draftStroke].slice(-80));
    }
    setDraftStroke(null);
  }

  return (
    <details className="post-object-section" open>
      <summary>
        <Brush size={15} />
        Рисунок
      </summary>
      <div className="sketch-editor">
        <svg
          ref={canvasRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
          role="img"
          aria-label="Рисунок заметки"
        >
          {[...strokes, ...(draftStroke ? [draftStroke] : [])].map((stroke) => (
            <path
              key={stroke.id}
              d={strokeToPath(stroke.points)}
              fill="none"
              stroke={stroke.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={stroke.width}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="sketch-tools">
          <div className="sketch-palette">
            {sketchPalette.map((item) => (
              <button
                key={item}
                type="button"
                className={color === item ? "active" : ""}
                onClick={() => setColor(item)}
                style={{ "--swatch": item } as CSSProperties}
                aria-label={`Цвет ${item}`}
              />
            ))}
          </div>
          <label>
            <span>Толщина</span>
            <input type="range" min={1} max={12} value={width} onChange={(event) => setWidth(Number(event.target.value))} />
          </label>
          <button type="button" className="sketch-clear-button" onClick={() => onChange([])}>
            <Eraser size={14} />
            Очистить
          </button>
        </div>
      </div>
    </details>
  );
}

function SketchPreview({ strokes }: { strokes: SketchStroke[] }) {
  return (
    <svg className="sketch-preview" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Рисунок">
      {strokes.map((stroke) => (
        <path
          key={stroke.id}
          d={strokeToPath(stroke.points)}
          fill="none"
          stroke={stroke.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={stroke.width}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function PostChecklist({
  activeUserId,
  items,
  postId,
  onToggle,
}: {
  activeUserId: string | undefined;
  items: ChecklistItem[];
  postId: string;
  onToggle: (postId: string, itemId: string) => void;
}) {
  const checkedCount = items.filter((item) => activeUserId && item.checkedBy.includes(activeUserId)).length;

  return (
    <div className="post-checklist" data-no-open>
      <div>
        <CheckSquare size={15} />
        <span>{checkedCount}/{items.length}</span>
      </div>
      {items.map((item) => {
        const checked = Boolean(activeUserId && item.checkedBy.includes(activeUserId));
        return (
          <button
            key={item.id}
            type="button"
            className={checked ? "checked" : ""}
            onClick={() => onToggle(postId, item.id)}
          >
            <span>{checked ? <Check size={13} /> : null}</span>
            {item.text}
          </button>
        );
      })}
    </div>
  );
}

function PostPollBlock({
  activeUserId,
  poll,
  postId,
  onVote,
}: {
  activeUserId: string | undefined;
  poll: PostPoll;
  postId: string;
  onVote: (postId: string, optionId: string) => void;
}) {
  const totalVotes = poll.options.reduce((sum, option) => sum + option.voterIds.length, 0);

  return (
    <div className="post-poll" data-no-open>
      <div className="post-poll-head">
        <Vote size={15} />
        <strong>{poll.question}</strong>
      </div>
      {poll.options.map((option) => {
        const voted = Boolean(activeUserId && option.voterIds.includes(activeUserId));
        const percent = totalVotes > 0 ? Math.round((option.voterIds.length / totalVotes) * 100) : 0;

        return (
          <button
            key={option.id}
            type="button"
            className={voted ? "voted" : ""}
            onClick={() => onVote(postId, option.id)}
          >
            <span style={{ "--poll-value": `${percent}%` } as CSSProperties} />
            <strong>{option.text}</strong>
            <em>{percent}%</em>
          </button>
        );
      })}
      <small>{totalVotes} голосов{poll.multi ? " · несколько вариантов" : ""}</small>
    </div>
  );
}

function BoardConnectionLayer({
  connections,
  layout,
  onDeleteConnection,
}: {
  connections: PostConnection[];
  layout: BoardLayoutItem[];
  onDeleteConnection: (connectionId: string) => void;
}) {
  const layoutByPostId = new Map(layout.map((item) => [item.post.id, item]));
  const visibleConnections = connections.flatMap((connection) => {
    const from = layoutByPostId.get(connection.fromPostId);
    const to = layoutByPostId.get(connection.toPostId);
    if (!from || !to || from.post.wallId !== to.post.wallId) return [];
    return [{ connection, from, to }];
  });

  if (visibleConnections.length === 0) return null;

  return (
    <svg className="board-connections" aria-label="Связи заметок">
      <defs>
        <marker id="board-arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" />
        </marker>
      </defs>
      {visibleConnections.map(({ connection, from, to }) => {
        const start = {
          x: from.position.x + from.width,
          y: from.position.y + Math.min(from.height, boardCardHeight) / 2,
        };
        const end = {
          x: to.position.x,
          y: to.position.y + Math.min(to.height, boardCardHeight) / 2,
        };
        const midX = (start.x + end.x) / 2;

        return (
          <g key={connection.id}>
            <path
              d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
              markerEnd="url(#board-arrow-head)"
            />
            <g
              className="board-connection-remove"
              role="button"
              tabIndex={0}
              onClick={() => onDeleteConnection(connection.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onDeleteConnection(connection.id);
              }}
              aria-label="Удалить стрелку"
            >
              <circle cx={midX} cy={(start.y + end.y) / 2} r="9" />
              <text x={midX} y={(start.y + end.y) / 2 + 4}>×</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function WallColorPicker({
  compact = false,
  value,
  onChange,
}: {
  compact?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const accentOption = getWallAccentOption(value);
  const customAccentValue = normalizeHexColor(value) ?? accentOption.accent;
  const isCustom = accentOption.label === "Свой";

  return (
    <div className={compact ? "wall-color-editor compact" : "wall-color-editor"}>
      <span>Цвет доски</span>
      <div className="wall-color-options" role="radiogroup" aria-label="Цвет доски">
        {wallAccentOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "active" : ""}
            onClick={() => onChange(option.id)}
            role="radio"
            aria-checked={value === option.id}
            style={{ "--wall-swatch": option.accent } as CSSProperties}
          >
            <i />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      <label
        className={isCustom ? "wall-custom-color active" : "wall-custom-color"}
        style={{ "--wall-swatch": customAccentValue } as CSSProperties}
      >
        <i aria-hidden="true" />
        <span>Свой цвет</span>
        <strong>{customAccentValue.toUpperCase()}</strong>
        <input
          type="color"
          value={customAccentValue}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Свой цвет доски"
        />
      </label>
    </div>
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
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [accentColor, setAccentColor] = useState<string>(wallAccentOptions[0].id);
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [privacyMode, setPrivacyMode] = useState<WallPrivacyMode>("public");
  const [inviteCode, setInviteCode] = useState(() => createWallInviteCode());
  const [inviteTtlDays, setInviteTtlDays] = useState("30");
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [publishMode, setPublishMode] = useState<Wall["publishMode"]>("open");
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [uploadingTarget, setUploadingTarget] = useState<"avatar" | "banner" | null>(null);
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

  async function uploadCreateSpaceImage(event: ChangeEvent<HTMLInputElement>, target: "avatar" | "banner") {
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
      } else {
        setBannerUrl(attachment.url);
      }
    } catch {
      setMediaError("Не удалось загрузить изображение.");
    } finally {
      setUploadingTarget(null);
    }
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
      accentColor: normalizeWallAccentValue(accentColor),
      avatarFocus: defaultMediaFocus,
      avatarUrl,
      bannerFocus: defaultMediaFocus,
      bannerUrl,
      name: nextName,
      slug: nextSlug,
      description: description.trim(),
      rules: rules.trim(),
      privacyMode,
      invite: buildWallInviteSettings(inviteCode, inviteTtlDays, inviteMaxUses),
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
        <div className="create-space-media">
          <section>
            <span>Аватар</span>
            <div className="create-space-avatar-preview">
              {avatarUrl ? <img src={avatarUrl} alt="" draggable={false} /> : formatWallInitial(name || "Д")}
            </div>
            <label className="wall-media-upload">
              {uploadingTarget === "avatar" ? <Loader2 size={15} className="spin" /> : <ImageIcon size={15} />}
              <span>Загрузить</span>
              <input type="file" accept="image/*" onChange={(event) => uploadCreateSpaceImage(event, "avatar")} />
            </label>
          </section>
          <section>
            <span>Баннер</span>
            <div
              className="create-space-banner-preview"
              style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
            >
              {bannerUrl ? null : "Без баннера"}
            </div>
            <label className="wall-media-upload">
              {uploadingTarget === "banner" ? <Loader2 size={15} className="spin" /> : <ImageIcon size={15} />}
              <span>Загрузить</span>
              <input type="file" accept="image/*" onChange={(event) => uploadCreateSpaceImage(event, "banner")} />
            </label>
          </section>
        </div>
        {mediaError ? <div className="inline-error compact">{mediaError}</div> : null}
        <WallColorPicker compact value={accentColor} onChange={setAccentColor} />
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
        <label>
          <span>Доступ</span>
          <select value={privacyMode} onChange={(event) => setPrivacyMode(event.target.value as WallPrivacyMode)}>
            <option value="public">Открытая</option>
            <option value="link">Только по ссылке</option>
            <option value="invite">По приглашению</option>
          </select>
        </label>
        {privacyMode !== "public" ? (
          <div className="invite-settings">
            <div>
              <span>Код ссылки</span>
              <button type="button" onClick={() => setInviteCode(createWallInviteCode())}>
                Обновить
              </button>
            </div>
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
            <div className="invite-grid">
              <label>
                <span>Дней</span>
                <input value={inviteTtlDays} onChange={(event) => setInviteTtlDays(event.target.value)} inputMode="numeric" />
              </label>
              <label>
                <span>Лимит</span>
                <input value={inviteMaxUses} onChange={(event) => setInviteMaxUses(event.target.value)} inputMode="numeric" placeholder="без лимита" />
              </label>
            </div>
          </div>
        ) : null}
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
  const [accentColor, setAccentColor] = useState<string>(wall.accentColor ?? wallAccentOptions[0].id);
  const [description, setDescription] = useState(wall.description ?? "");
  const [rules, setRules] = useState(wall.rules ?? "");
  const [privacyMode, setPrivacyMode] = useState<WallPrivacyMode>(wall.privacyMode ?? "public");
  const [inviteCode, setInviteCode] = useState(wall.invite?.code ?? createWallInviteCode());
  const [inviteTtlDays, setInviteTtlDays] = useState(() => formatInviteTtlDays(wall.invite?.expiresAt));
  const [inviteMaxUses, setInviteMaxUses] = useState(() => wall.invite?.maxUses ? String(wall.invite.maxUses) : "");
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
      accentColor: normalizeWallAccentValue(accentColor),
      avatarFocus,
      avatarUrl,
      bannerFocus,
      bannerUrl,
      description,
      name,
      rules,
      privacyMode,
      invite: buildWallInviteSettings(inviteCode, inviteTtlDays, inviteMaxUses, wall.invite?.usedBy),
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
        <WallColorPicker value={accentColor} onChange={setAccentColor} />
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
        <label>
          <span>Доступ</span>
          <select value={privacyMode} onChange={(event) => setPrivacyMode(event.target.value as WallPrivacyMode)}>
            <option value="public">Открытая</option>
            <option value="link">Только по ссылке</option>
            <option value="invite">По приглашению</option>
          </select>
        </label>
        {privacyMode !== "public" ? (
          <div className="invite-settings">
            <div>
              <span>Ссылка доступа</span>
              <button type="button" onClick={() => setInviteCode(createWallInviteCode())}>
                Обновить
              </button>
            </div>
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
            <div className="invite-grid">
              <label>
                <span>Дней</span>
                <input value={inviteTtlDays} onChange={(event) => setInviteTtlDays(event.target.value)} inputMode="numeric" />
              </label>
              <label>
                <span>Лимит</span>
                <input value={inviteMaxUses} onChange={(event) => setInviteMaxUses(event.target.value)} inputMode="numeric" placeholder="без лимита" />
              </label>
            </div>
            <small>{getWallInvitePreview(wall.id, inviteCode)}</small>
          </div>
        ) : null}
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
  onPublish: (text: string, attachments: MediaAttachment[], options?: Partial<PostDraftOptions>) => void;
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
  canCreateConnection = false,
  connectionSourcePostId,
  hasReposted,
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
  onFinishConnection,
  onHide,
  onOpenPost,
  onOpenProfile,
  onPin,
  onReact,
  onRecordView,
  onReport,
  onRepost,
  onStartConnection,
  onToggleChecklistItem,
  onToggleSave,
  onVotePoll,
}: {
  activeUserId: string | undefined;
  commentCount: number;
  canCreateConnection?: boolean;
  connectionSourcePostId: string | null;
  hasReposted: boolean;
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
  onEdit: (postId: string, text: string, options?: PostUpdatePayload) => void;
  onFinishConnection: (postId: string) => void;
  onHide: (postId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onPin: (postId: string) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReport: (postId: string) => void;
  onRepost: (postId: string) => void;
  onStartConnection: (postId: string) => void;
  onToggleChecklistItem: (postId: string, itemId: string) => void;
  onToggleSave: (postId: string) => void;
  onVotePoll: (postId: string, optionId: string) => void;
}) {
  const [reacting, setReacting] = useState(false);
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);
  const [displayReactions, setDisplayReactions] = useState(post.reactions);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(post.text);
  const [draftOptions, setDraftOptions] = useState<PostDraftOptions>(() => buildPostDraftOptionsFromPost(post));
  const articleRef = useRef<HTMLElement | null>(null);
  const reactButtonRef = useRef<HTMLButtonElement | null>(null);
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
  const isMinecraftDownload = post.id === minecraftDownloadPostId && post.wallId === minecraftWallId;
  const postSettings = getPostSettings(post);
  const postAppearance = getPostAppearance(post);
  const canFinishConnection = Boolean(canCreateConnection && connectionSourcePostId && connectionSourcePostId !== post.id);

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
    if (isEditing) return;
    setDraftText(post.text);
    setDraftOptions(buildPostDraftOptionsFromPost(post));
  }, [isEditing, post]);

  useEffect(() => {
    const nextReactions = Math.max(post.reactions + pendingReactionsRef.current, displayReactionsRef.current);
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

  function playReactionPulse() {
    const button = reactButtonRef.current;
    if (!button || typeof button.animate !== "function") return;

    button.animate(
      [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(-1px) scale(1.05)" },
        { transform: "translateY(0) scale(1)" },
      ],
      { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    button.querySelector(".react-icon")?.animate(
      [
        { transform: "scale(1) rotate(0deg)" },
        { transform: "scale(1.2) rotate(-8deg)" },
        { transform: "scale(1) rotate(0deg)" },
      ],
      { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    button.querySelector(".react-count")?.animate(
      [
        { transform: "translateY(0)", opacity: 1 },
        { transform: "translateY(-4px)", opacity: 1 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }

  function handleReact() {
    if (!postSettings.reactions) return;
    const nextReactions = displayReactionsRef.current + 1;

    displayReactionsRef.current = nextReactions;
    pendingReactionsRef.current += 1;
    queueReactionFrame();
    queueReactionBurst(nextReactions);
    playReactionPulse();
    keepReactionShellAlive();
  }

  function saveEdit() {
    if (!hasPublishablePostDraft(draftText, post.attachments, draftOptions)) return;
    onEdit(post.id, draftText, draftOptions);
    setIsEditing(false);
    setIsMenuOpen(false);
  }

  function copyPostLink() {
    const url = `${window.location.origin}/post/${post.id}`;
    void navigator.clipboard?.writeText(url);
    setIsMenuOpen(false);
  }

  function handleCardClickCapture(event: React.MouseEvent<HTMLElement>) {
    if (isEditing || isMenuOpen || !canFinishConnection) return;
    if (isPostConnectionClickIgnored(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    if (connectionSourcePostId !== post.id) {
      onFinishConnection(post.id);
    }
  }

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (isEditing || isMenuOpen) return;
    if (connectionSourcePostId) return;
    if (isPostOpenIgnored(event.target)) return;
    onOpenPost(post.id);
  }

  const cardClassName = [
    "post-card",
    surface === "field" ? "field-object" : "",
    surface === "board" ? "board-card" : "",
    surface === "field" ? `object-${fieldObjectKind}` : "",
    post.attachments.length > 0 ? "has-media" : "",
    post.repostOfId ? "is-repost" : "",
    isPinned ? "is-pinned" : "",
    `kind-${getPostKind(post)}`,
    `post-bg-${postAppearance.background}`,
    `post-shape-${postAppearance.shape}`,
    `post-size-${postAppearance.size}`,
    reacting ? "reaction-wake" : "",
    connectionSourcePostId === post.id ? "connection-source" : "",
    canFinishConnection ? "connection-target" : "",
    isMenuOpen ? "menu-open" : "",
  ].filter(Boolean).join(" ");
  const postAccentStyle = getPostAccentStyle(postAppearance, wall);

  if (isMinecraftDownload) {
    return (
      <article
        ref={articleRef}
        className={`${cardClassName} minecraft-download-post`}
        style={postAccentStyle}
        onClickCapture={handleCardClickCapture}
        onClick={handleCardClick}
      >
        <header className="minecraft-post-head">
          <span className="minecraft-post-mark">
            <PackagePlus size={22} />
          </span>
          <div>
            <span>Версия 26.1.2 · Fabric</span>
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
          >
            <span>
              <PackagePlus size={16} />
            </span>
            <strong>.mrpack</strong>
            <small>Modrinth APP</small>
          </a>
        </div>
      </article>
    );
  }

  return (
    <article
      ref={articleRef}
      className={cardClassName}
      style={postAccentStyle}
      onClickCapture={handleCardClickCapture}
      onClick={handleCardClick}
    >
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
            {postSettings.comments ? (
              <button onClick={() => onOpenPost(post.id)}>
                <MessageCircle size={15} />
                Открыть ответы
              </button>
            ) : null}
            {postSettings.saves ? (
              <button onClick={() => onToggleSave(post.id)}>
                <Bookmark size={15} />
                {isSaved ? "Из сохранённого" : "В сохранённое"}
              </button>
            ) : null}
            {postSettings.reposts ? (
              <button onClick={() => onRepost(post.id)} disabled={hasReposted}>
                <Repeat2 size={15} />
                {hasReposted ? "Уже на доске" : "Поделиться на доске"}
              </button>
            ) : null}
            {canFinishConnection ? (
              <button onClick={() => {
                onFinishConnection(post.id);
                setIsMenuOpen(false);
              }}>
                <ArrowRight size={15} />
                Стрелка сюда
              </button>
            ) : null}
            {canCreateConnection ? (
              <button onClick={() => {
                onStartConnection(post.id);
                setIsMenuOpen(false);
              }}>
                <ArrowRight size={15} />
                Стрелка отсюда
              </button>
            ) : null}
            {isOwnPost ? (
              <button onClick={() => onPin(post.id)}>
                <Pin size={15} />
                {isPinned ? "Открепить" : "Закрепить"}
              </button>
            ) : null}
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
          <FormattingTextarea value={draftText} onChange={setDraftText} autoFocus />
          <PostObjectEditor
            compact
            options={draftOptions}
            showControls
            text={draftText}
            onChange={setDraftOptions}
          />
          <div className="post-edit-actions">
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
        <FormattedText className="post-text" text={post.text} />
      ) : null}

      {post.sketch && post.sketch.length > 0 ? (
        <SketchPreview strokes={post.sketch} />
      ) : null}

      {post.attachments.length > 0 ? (
        <div className={`media-grid count-${Math.min(post.attachments.length, 3)}`}>
          {post.attachments.map((attachment) => (
            <MediaPreview key={attachment.id} attachment={attachment} />
          ))}
        </div>
      ) : null}

      {post.checklist && post.checklist.length > 0 ? (
        <PostChecklist
          activeUserId={activeUserId}
          items={post.checklist}
          postId={post.id}
          onToggle={onToggleChecklistItem}
        />
      ) : null}

      {post.poll ? (
        <PostPollBlock
          activeUserId={activeUserId}
          poll={post.poll}
          postId={post.id}
          onVote={onVotePoll}
        />
      ) : null}

      {repostedPost ? (
        <button className="repost-card" onClick={() => onOpenPost(repostedPost.id)}>
          <Repeat2 size={15} />
          <span className="repost-card-body">
            <strong>{repostAuthor?.name ?? "Пользователь"}</strong>
            {repostedPost.text ? <small>{repostedPost.text}</small> : <small>Медиа</small>}
            {repostedPost.attachments.length > 0 ? (
              <span className="repost-media-strip" aria-label={formatMediaSummary(repostedPost.attachments)}>
                {repostedPost.attachments.slice(0, 3).map((attachment) => (
                  <span key={attachment.id} className="repost-media-thumb">
                    {attachment.type === "image" ? (
                      <img src={attachment.url} alt="" />
                    ) : attachment.type === "video" ? (
                      <Video size={15} />
                    ) : (
                      <AudioLines size={15} />
                    )}
                  </span>
                ))}
                {repostedPost.attachments.length > 3 ? <i>+{repostedPost.attachments.length - 3}</i> : null}
              </span>
            ) : null}
          </span>
        </button>
      ) : null}

      <footer className="post-footer">
        <div className="post-footer-metrics">
          {postSettings.reactions ? (
            <button
              ref={reactButtonRef}
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
          ) : null}
          {postSettings.comments ? (
            <button className="post-stat comments-stat" onClick={() => onOpenPost(post.id)} aria-label={`Ответы ${commentCount}`}>
              <MessageCircle size={16} />
              <span className="stat-label">Ответы</span>
              <span className="stat-count">{commentCount}</span>
            </button>
          ) : null}
          {postSettings.views ? (
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
          ) : null}
        </div>
        <div className="post-footer-tools">
          {postSettings.saves ? (
            <button
              className={isSaved ? "post-stat active" : "post-stat"}
              onClick={() => onToggleSave(post.id)}
              aria-label={isSaved ? "Убрать из сохранённого" : "В сохранённое"}
            >
              <Bookmark size={16} />
            </button>
          ) : null}
          {postSettings.reposts ? (
            <button
              className={hasReposted ? "post-stat reposted" : "post-stat"}
              onClick={() => onRepost(post.id)}
              disabled={hasReposted}
              aria-label={hasReposted ? "Уже на вашей доске" : "Поделиться на доске"}
              title={hasReposted ? "Уже на вашей доске" : "Поделиться на доске"}
            >
              <Repeat2 size={16} />
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

function FormattedText({ className, text }: { className: string; text: string }) {
  const blocks: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(<ul key={`list-${blocks.length}`}>{listItems}</ul>);
    listItems = [];
  }

  text.split(/\r?\n/).forEach((line, index) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushList();
      blocks.push(<br key={`br-${index}`} />);
      return;
    }

    const listMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(<li key={`li-${index}`}>{formatInlineText(listMatch[1])}</li>);
      return;
    }

    flushList();

    if (trimmedLine.startsWith("> ")) {
      blocks.push(<blockquote key={`quote-${index}`}>{formatInlineText(trimmedLine.slice(2))}</blockquote>);
      return;
    }

    blocks.push(<p key={`p-${index}`}>{formatInlineText(line)}</p>);
  });

  flushList();

  return <div className={className}>{blocks}</div>;
}

function formatInlineText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const key = `${match.index}-${match[0]}`;
    if (match[2]) {
      nodes.push(<strong key={key}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<code key={key}>{match[3]}</code>);
    } else if (match[4]) {
      nodes.push(<em key={key}>{match[4]}</em>);
    } else if (match[5] && match[6]) {
      nodes.push(
        <a key={key} href={match[6]} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
          {match[5]}
        </a>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function formatTextSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: TextFormatAction,
): { selectionEnd: number; selectionStart: number; value: string } {
  const selected = value.slice(selectionStart, selectionEnd);
  const fallback = getFormatFallback(action);
  const source = selected || fallback;
  const replacement = getFormattedText(source, action);
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  const innerOffset = getFormatInnerOffset(action);

  return {
    value: nextValue,
    selectionStart: selectionStart + innerOffset.start,
    selectionEnd: selectionStart + replacement.length - innerOffset.end,
  };
}

function getFormatFallback(action: TextFormatAction): string {
  const fallbacks: Record<TextFormatAction, string> = {
    bold: "жирный текст",
    italic: "курсив",
    code: "код",
    quote: "цитата",
    list: "пункт",
    link: "текст ссылки",
  };

  return fallbacks[action];
}

function getFormattedText(text: string, action: TextFormatAction): string {
  switch (action) {
    case "bold":
      return `**${text}**`;
    case "italic":
      return `*${text}*`;
    case "code":
      return text.includes("\n") ? `\`\`\`\n${text}\n\`\`\`` : `\`${text}\``;
    case "quote":
      return text.split(/\r?\n/).map((line) => `> ${line || " "}`).join("\n");
    case "list":
      return text.split(/\r?\n/).map((line) => `- ${line || "пункт"}`).join("\n");
    case "link":
      return `[${text}](https://)`;
    default:
      return text;
  }
}

function getFormatInnerOffset(action: TextFormatAction): { end: number; start: number } {
  switch (action) {
    case "bold":
      return { start: 2, end: 2 };
    case "italic":
    case "code":
      return { start: 1, end: 1 };
    case "link":
      return { start: 1, end: 11 };
    case "quote":
      return { start: 2, end: 0 };
    case "list":
      return { start: 2, end: 0 };
    default:
      return { start: 0, end: 0 };
  }
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
  onToggleChecklistItem,
  onToggleSave,
  onVotePoll,
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
  onEditPost: (postId: string, text: string, options?: PostUpdatePayload) => void;
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
  onToggleChecklistItem: (postId: string, itemId: string) => void;
  onToggleSave: (postId: string) => void;
  onVotePoll: (postId: string, optionId: string) => void;
}) {
  if (!post) return <div className="empty">Заметка не найдена</div>;

  const postSettings = getPostSettings(post);
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
        connectionSourcePostId={null}
        hasReposted={hasUserRepostedPost(post.id, activeUser?.id, postById)}
        isPinned={pinnedPostIds.has(post.id)}
        isSaved={savedPostIds.has(post.id)}
        post={post}
        repostedPost={post.repostOfId ? postById.get(post.repostOfId) : undefined}
        user={userById.get(post.authorId)}
        userById={userById}
        wall={wallById.get(post.wallId)}
        onDelete={onDeletePost}
        onEdit={onEditPost}
        onFinishConnection={() => undefined}
        onHide={onHidePost}
        onOpenPost={() => undefined}
        onOpenProfile={onOpenProfile}
        onPin={onPinPost}
        onReact={onReact}
        onRecordView={onRecordView}
        onReport={onReportPost}
        onRepost={onRepost}
        onStartConnection={() => undefined}
        onToggleChecklistItem={onToggleChecklistItem}
        onToggleSave={onToggleSave}
        onVotePoll={onVotePoll}
      />

      {postSettings.comments ? (
      <section className="comments-panel">
        <div className="panel-title">
          <MessageCircle size={17} />
          <h2>Ответы</h2>
          <span>{comments.length}</span>
        </div>

        {activeUser ? (
          <Composer
            className="comment-composer"
            objectTools={false}
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
      ) : (
        <section className="comments-panel locked">
          <div className="panel-title">
            <MessageCircle size={17} />
            <h2>Ответы закрыты</h2>
          </div>
          <div className="empty small">Автор отключил обсуждение.</div>
        </section>
      )}
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
          objectTools={false}
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
  connectionSourcePostId,
  followedUserIds,
  pinnedPostIds,
  postConnections,
  postById,
  posts,
  profileWall,
  savedPostIds,
  user,
  userById,
  wallById,
  onDeletePost,
  onDeletePostConnection,
  onEditPost,
  onFinishPostConnection,
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
  onStartPostConnection,
  onToggleChecklistItem,
  onToggleSave,
  onVotePoll,
}: {
  activeUser: UserProfile | undefined;
  commentsByPostId: Map<string, Comment[]>;
  connectionSourcePostId: string | null;
  followedUserIds: Set<string>;
  pinnedPostIds: Set<string>;
  postConnections: PostConnection[];
  postById: Map<string, Post>;
  posts: Post[];
  profileWall: Wall | undefined;
  savedPostIds: Set<string>;
  user: UserProfile | undefined;
  userById: Map<string, UserProfile>;
  wallById: Map<string, Wall>;
  onDeletePost: (postId: string) => void;
  onDeletePostConnection: (connectionId: string) => void;
  onEditPost: (postId: string, text: string, options?: PostUpdatePayload) => void;
  onFinishPostConnection: (postId: string) => void;
  onFollow: (userId: string) => void;
  onHidePost: (postId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onOpenSettings: () => void;
  onPinPost: (postId: string) => void;
  onPublish: (text: string, attachments: MediaAttachment[], options?: Partial<PostDraftOptions>) => void;
  onMovePost: (postId: string, x: number, y: number) => void;
  onReact: (postId: string, amount?: number) => void;
  onRecordView: (postId: string) => void;
  onReportPost: (postId: string) => void;
  onRepost: (postId: string) => void;
  onStartPostConnection: (postId: string) => void;
  onToggleChecklistItem: (postId: string, itemId: string) => void;
  onToggleSave: (postId: string) => void;
  onVotePoll: (postId: string, optionId: string) => void;
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
        <span className="space-kicker">Доска</span>
        <div className="space-copy">
          <div className="wall-title-row">
            {profileWall?.avatarUrl ? <WallAvatar fallback={user.name} wall={profileWall} /> : <Avatar user={user} />}
            <div>
              <h1>{user.name}</h1>
              <p>{user.handle}</p>
              <UserStatusLabel className="profile-status" forceOnline={isOwnProfile} user={user} />
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
        wall={profileWall}
        onPublish={onPublish}
      />

      <WallBoard
        activeUserId={activeUser?.id}
        canMovePost={(post) => canMoveSharedPost(post, [...wallById.values()], activeUser?.id)}
        className="field-board space-field-board profile-field-board"
        commentsByPostId={commentsByPostId}
        connectionSourcePostId={connectionSourcePostId}
        dynamicFieldOffsets={false}
        emptyText="На этой доске пока нет заметок"
        hint="перетащи карточки по доске"
        pinnedPostIds={pinnedPostIds}
        postConnections={postConnections}
        postById={postById}
        posts={userPosts}
        resolveProtectedLayout={false}
        savedPostIds={savedPostIds}
        userById={userById}
        wallById={wallById}
        onDeletePost={onDeletePost}
        onDeletePostConnection={onDeletePostConnection}
        onEditPost={onEditPost}
        onFinishPostConnection={onFinishPostConnection}
        onHidePost={onHidePost}
        onMovePost={onMovePost}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onPinPost={onPinPost}
        onReact={onReact}
        onRecordView={onRecordView}
        onReportPost={onReportPost}
        onRepost={onRepost}
        onStartPostConnection={onStartPostConnection}
        onToggleChecklistItem={onToggleChecklistItem}
        onToggleSave={onToggleSave}
        onVotePoll={onVotePoll}
      />
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
  const [isImageOpen, setIsImageOpen] = useState(false);

  if (attachment.type === "image") {
    return (
      <>
        <button
          type="button"
          className={compact ? "media-image-button compact" : "media-image-button"}
          onClick={() => setIsImageOpen(true)}
          data-no-open
          aria-label={`Открыть изображение ${attachment.name}`}
        >
          <img className="media image-media" src={attachment.url} alt={attachment.name} />
        </button>
        {isImageOpen ? (
          <div className="media-lightbox" onClick={() => setIsImageOpen(false)} role="presentation" data-no-open>
            <button
              type="button"
              className="media-lightbox-close"
              onClick={() => setIsImageOpen(false)}
              aria-label="Закрыть изображение"
            >
              <X size={18} />
            </button>
            <img src={attachment.url} alt={attachment.name} onClick={(event) => event.stopPropagation()} />
          </div>
        ) : null}
      </>
    );
  }

  if (attachment.type === "video") {
    return <CustomVideoPlayer attachment={attachment} compact={compact} />;
  }

  if (compact) {
    return (
      <div className="custom-audio-player compact" data-no-open>
        <AudioLines size={16} />
        <span className="audio-title">{attachment.name}</span>
      </div>
    );
  }

  return <CustomAudioPlayer attachment={attachment} />;
}

function CustomVideoPlayer({
  attachment,
  compact = false,
}: {
  attachment: MediaAttachment;
  compact?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(compact);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  function syncMetadata(target: HTMLVideoElement) {
    setDuration(Number.isFinite(target.duration) ? target.duration : 0);
    setCurrentTime(Number.isFinite(target.currentTime) ? target.currentTime : 0);
  }

  function togglePlay() {
    const node = videoRef.current;
    if (!node) return;

    if (node.paused) {
      void node.play().catch(() => setIsPlaying(false));
      return;
    }
    node.pause();
  }

  function seek(value: string) {
    const node = videoRef.current;
    if (!node || duration <= 0) return;
    const nextTime = (Number(value) / 100) * duration;
    node.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function toggleMute() {
    const node = videoRef.current;
    if (!node) return;
    const nextMuted = !node.muted;
    node.muted = nextMuted;
    setIsMuted(nextMuted);
  }

  function openFullscreen() {
    const node = videoRef.current;
    if (!node) return;
    void node.requestFullscreen?.();
  }

  return (
    <div className={`custom-video-player ${compact ? "compact" : ""}`} data-no-open>
      <button
        type="button"
        className="custom-video-shell"
        onClick={togglePlay}
        aria-label={isPlaying ? "Пауза" : "Воспроизвести видео"}
      >
        <video
          ref={videoRef}
          className="media custom-video"
          src={attachment.url}
          muted={isMuted}
          preload="metadata"
          playsInline
          onLoadedMetadata={(event) => syncMetadata(event.currentTarget)}
          onTimeUpdate={(event) => syncMetadata(event.currentTarget)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
        {!isPlaying ? (
          <span className="video-play-badge" aria-hidden="true">
            <Play size={compact ? 18 : 24} fill="currentColor" />
          </span>
        ) : null}
      </button>
      {!compact ? (
        <div className="video-controlbar" data-no-open>
          <button type="button" className="media-control-button" onClick={togglePlay} aria-label={isPlaying ? "Пауза" : "Воспроизвести"}>
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <span className="media-time">{formatMediaTime(currentTime)}</span>
          <input
            className="media-progress"
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={(event) => seek(event.currentTarget.value)}
            aria-label="Позиция видео"
            style={{ "--media-progress": `${progress}%` } as CSSProperties}
          />
          <span className="media-time">{formatMediaTime(duration)}</span>
          <button type="button" className="media-control-button" onClick={toggleMute} aria-label={isMuted ? "Включить звук" : "Выключить звук"}>
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button type="button" className="media-control-button" onClick={openFullscreen} aria-label="На весь экран">
            <Maximize2 size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CustomAudioPlayer({ attachment }: { attachment: MediaAttachment }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  useEffect(() => {
    function handleOtherAudio(event: Event) {
      const nextId = event instanceof CustomEvent ? event.detail?.id : undefined;
      if (nextId === attachment.id) return;
      audioRef.current?.pause();
    }

    window.addEventListener(audioPlaybackEventName, handleOtherAudio);
    return () => window.removeEventListener(audioPlaybackEventName, handleOtherAudio);
  }, [attachment.id]);

  function syncMetadata(target: HTMLAudioElement) {
    setDuration(Number.isFinite(target.duration) ? target.duration : 0);
    setCurrentTime(Number.isFinite(target.currentTime) ? target.currentTime : 0);
  }

  function togglePlay() {
    const node = audioRef.current;
    if (!node) return;

    if (node.paused) {
      window.dispatchEvent(new CustomEvent(audioPlaybackEventName, { detail: { id: attachment.id } }));
      void node.play().catch(() => setIsPlaying(false));
      return;
    }
    node.pause();
  }

  function seek(value: string) {
    const node = audioRef.current;
    if (!node || duration <= 0) return;
    const nextTime = (Number(value) / 100) * duration;
    node.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function jump(delta: number) {
    const node = audioRef.current;
    if (!node) return;
    const nextTime = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, node.currentTime + delta));
    node.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="custom-audio-player" data-no-open>
      <audio
        ref={audioRef}
        src={attachment.url}
        preload="metadata"
        onLoadedMetadata={(event) => syncMetadata(event.currentTarget)}
        onTimeUpdate={(event) => syncMetadata(event.currentTarget)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <div className="audio-player-head">
        <button type="button" className="audio-play-button" onClick={togglePlay} aria-label={isPlaying ? "Пауза" : "Воспроизвести аудио"}>
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <div className="audio-copy">
          <span className="audio-title">{attachment.name}</span>
          <small>{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</small>
        </div>
        <a className="media-control-button" href={attachment.url} download={attachment.name} aria-label="Скачать аудио">
          <Download size={16} />
        </a>
      </div>
      <div className="audio-wave" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => <span key={index} />)}
      </div>
      <div className="audio-controls">
        <button type="button" className="media-control-button" onClick={() => jump(-10)} aria-label="Назад на 10 секунд">
          <SkipBack size={16} />
        </button>
        <input
          className="media-progress"
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={(event) => seek(event.currentTarget.value)}
          aria-label="Позиция аудио"
          style={{ "--media-progress": `${progress}%` } as CSSProperties}
        />
        <button type="button" className="media-control-button" onClick={() => jump(10)} aria-label="Вперёд на 10 секунд">
          <SkipForward size={16} />
        </button>
      </div>
      {isPlaying ? (
        <div className="audio-mini-player" data-no-open>
          <button type="button" className="audio-play-button mini" onClick={togglePlay} aria-label="Пауза">
            <Pause size={16} fill="currentColor" />
          </button>
          <div className="audio-mini-copy">
            <strong>{attachment.name}</strong>
            <span>{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span>
          </div>
          <input
            className="media-progress"
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={(event) => seek(event.currentTarget.value)}
            aria-label="Позиция аудио"
            style={{ "--media-progress": `${progress}%` } as CSSProperties}
          />
        </div>
      ) : null}
    </div>
  );
}

function formatMediaTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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

function formatMediaSummary(attachments: MediaAttachment[]): string {
  if (attachments.length === 0) return "Без медиа";

  const counts = attachments.reduce<Record<MediaKind, number>>((acc, attachment) => {
    acc[attachment.type] += 1;
    return acc;
  }, { audio: 0, image: 0, video: 0 });
  const parts = [
    counts.image ? `${counts.image} фото` : "",
    counts.video ? `${counts.video} видео` : "",
    counts.audio ? `${counts.audio} аудио` : "",
  ].filter(Boolean);

  return parts.join(", ");
}

function getClipboardMediaFiles(data: DataTransfer | null): File[] {
  if (!data) return [];

  const files = Array.from(data.files).filter((file) => getMediaKind(file));
  if (files.length > 0) return files;

  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file && getMediaKind(file)));
}

function getRepostSourcePost(post: Post | undefined, postById: Map<string, Post>): Post | undefined {
  if (!post) return undefined;

  let source = post;
  const visited = new Set<string>();
  while (source.repostOfId && !visited.has(source.id)) {
    visited.add(source.id);
    const next = postById.get(source.repostOfId);
    if (!next) break;
    source = next;
  }

  return source;
}

function hasUserRepostedPost(postId: string, userId: string | undefined, postById: Map<string, Post>): boolean {
  if (!userId) return false;

  const source = getRepostSourcePost(postById.get(postId), postById);
  if (!source) return false;

  for (const post of postById.values()) {
    if (!post.repostOfId || post.authorId !== userId) continue;
    const repostSource = getRepostSourcePost(post, postById);
    if (repostSource?.id === source.id) return true;
  }

  return false;
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

  return addStackedNotification(current.notifications, {
    id: crypto.randomUUID(),
    kind: payload.kind,
    actorId: payload.actorId,
    recipientId: post.authorId,
    postId: payload.postId,
    text: payload.text,
    createdAt: Date.now(),
  });
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

  return addStackedNotification(current.notifications, {
    id: crypto.randomUUID(),
    kind: "reaction",
    actorId,
    recipientId: comment.authorId,
    postId: comment.postId,
    commentId,
    text: "Огонёк на ваш ответ",
    createdAt: Date.now(),
  });
}

function addStackedNotification(
  notifications: NotificationItem[],
  notification: NotificationItem,
): NotificationItem[] {
  const parsed = parseNotificationStackText(notification.text);
  const existingIndex = notifications.findIndex((item) => {
    if (item.readAt) return false;
    const existingText = parseNotificationStackText(item.text).text;
    return item.recipientId === notification.recipientId &&
      item.actorId === notification.actorId &&
      item.kind === notification.kind &&
      (item.postId ?? "") === (notification.postId ?? "") &&
      (item.commentId ?? "") === (notification.commentId ?? "") &&
      existingText === parsed.text;
  });

  if (existingIndex === -1) return [notification, ...notifications];

  const existing = notifications[existingIndex];
  const count = parseNotificationStackText(existing.text).count + parsed.count;
  return [
    {
      ...notification,
      text: count > 1 ? `${parsed.text} ×${count}` : parsed.text,
    },
    ...notifications.filter((_, index) => index !== existingIndex),
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

let anonymousGuestCache: UserProfile | null = null;

function getAnonymousGuestUser(): UserProfile {
  if (anonymousGuestCache) return anonymousGuestCache;

  const stored = readStoredAnonymousGuestUser();
  anonymousGuestCache = stored ?? createAnonymousGuestUser();
  writeStoredAnonymousGuestUser(anonymousGuestCache);
  return anonymousGuestCache;
}

function createAnonymousGuestUser(existing?: Partial<UserProfile>): UserProfile {
  const token = getAnonymousGuestToken(existing?.id);
  const visibleCode = token.slice(0, 4).toUpperCase();
  const name = typeof existing?.name === "string" && existing.name.trim() && existing.name.trim() !== "Гость"
    ? existing.name.trim().slice(0, 32)
    : `Гость ${visibleCode}`;

  return {
    id: `${anonymousGuestPrefix}${token}`,
    name,
    handle: `@guest-${token.slice(0, 6)}`,
    bio: typeof existing?.bio === "string" && existing.bio.trim()
      ? existing.bio.trim().slice(0, 160)
      : "Пишет без привязки к Discord.",
    status: typeof existing?.status === "string" && existing.status.trim() && existing.status.trim() !== "Онлайн"
      ? existing.status.trim().slice(0, 40)
      : undefined,
    joinedAt: Number(existing?.joinedAt) || Date.now(),
    lastSeenAt: Number(existing?.lastSeenAt) || Date.now(),
    timeOnSiteMinutes: Math.max(0, Number(existing?.timeOnSiteMinutes) || 0),
    avatarUrl: typeof existing?.avatarUrl === "string" ? existing.avatarUrl : undefined,
    provider: "local",
  };
}

function getAnonymousGuestToken(candidateId: unknown): string {
  if (typeof candidateId === "string" && candidateId.startsWith(anonymousGuestPrefix)) {
    const token = candidateId.slice(anonymousGuestPrefix.length).replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (token.length >= 6) return token.slice(0, 12);
  }

  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function readStoredAnonymousGuestUser(): UserProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(anonymousGuestStorageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    if (typeof parsed.id !== "string" || !parsed.id.startsWith(anonymousGuestPrefix)) return null;
    return createAnonymousGuestUser(parsed);
  } catch {
    return null;
  }
}

function writeStoredAnonymousGuestUser(user: UserProfile): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(anonymousGuestStorageKey, JSON.stringify(user));
  } catch {
    // A missing cached anonymous profile should not block the app.
  }
}

function ensureGuestUser(users: UserProfile[]): UserProfile[] {
  if (users.some((user) => user.id === guestUserId)) return users;
  return [createGuestUser(), ...users];
}

function ensureAnonymousGuestUser(users: UserProfile[], anonymousGuest = getAnonymousGuestUser()): UserProfile[] {
  return upsertUser(users, anonymousGuest);
}

function ensureLocalGuestUsers(users: UserProfile[], anonymousGuest = getAnonymousGuestUser()): UserProfile[] {
  return ensureAnonymousGuestUser(ensureGuestUser(users), anonymousGuest);
}

function upsertUser(users: UserProfile[], user: UserProfile): UserProfile[] {
  const existingIndex = users.findIndex((item) => item.id === user.id);
  if (existingIndex === -1) return [user, ...users];

  return users.map((item, index) => index === existingIndex ? { ...item, ...user } : item);
}

function touchActiveUserPresence(current: SocialState, now = Date.now(), minutesToAdd = 0): SocialState {
  let changed = false;
  const users = current.users.map((user) => {
    if (user.id !== current.activeUserId) return user;
    changed = true;
    const nextUser = {
      ...user,
      lastSeenAt: now,
      timeOnSiteMinutes: user.timeOnSiteMinutes + minutesToAdd,
    };
    if (nextUser.id.startsWith(anonymousGuestPrefix)) {
      anonymousGuestCache = nextUser;
      writeStoredAnonymousGuestUser(nextUser);
    }
    return nextUser;
  });

  return changed ? { ...current, users } : current;
}

function readFieldLayouts(): FieldLayoutState {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(fieldLayoutStorageKey);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.entries(parsed).reduce<FieldLayoutState>((layouts, [userId, value]) => {
      if (!userId || !value || typeof value !== "object" || Array.isArray(value)) return layouts;

      const positions = Object.entries(value).reduce<Record<string, PostPosition>>((items, [postId, position]) => {
        const normalized = normalizeFieldLayoutPosition(position);
        if (normalized) items[postId] = normalized;
        return items;
      }, {});

      if (Object.keys(positions).length > 0) layouts[userId] = positions;
      return layouts;
    }, {});
  } catch {
    return {};
  }
}

function writeFieldLayouts(layouts: FieldLayoutState): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(fieldLayoutStorageKey, JSON.stringify(layouts));
  } catch {
    // The field layout is personal UI state; losing it must not block publishing.
  }
}

function readPinnedWalls(): PinnedWallState {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(pinnedWallStorageKey);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.entries(parsed).reduce<PinnedWallState>((state, [userId, value]) => {
      if (!userId || !Array.isArray(value)) return state;
      const ids = value
        .filter((id): id is string => typeof id === "string" && id.startsWith("space:"))
        .slice(0, 12);
      if (ids.length > 0) state[userId] = Array.from(new Set(ids));
      return state;
    }, {});
  } catch {
    return {};
  }
}

function writePinnedWalls(pinned: PinnedWallState): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(pinnedWallStorageKey, JSON.stringify(pinned));
  } catch {
    // Pinned boards are a personal navigation preference.
  }
}

function getScopedIdList(scoped: Record<string, string[]> | undefined, userId: string): string[] {
  return scoped?.[userId] ?? [];
}

function toggleScopedId(scoped: Record<string, string[]>, userId: string, id: string): Record<string, string[]> {
  const currentIds = scoped[userId] ?? [];
  const nextIds = currentIds.includes(id)
    ? currentIds.filter((item) => item !== id)
    : [id, ...currentIds];

  return {
    ...scoped,
    [userId]: nextIds,
  };
}

function addScopedId(scoped: Record<string, string[]>, userId: string, id: string): Record<string, string[]> {
  const currentIds = scoped[userId] ?? [];
  if (currentIds.includes(id)) return scoped;

  return {
    ...scoped,
    [userId]: [id, ...currentIds],
  };
}

function removeScopedIds(scoped: Record<string, string[]>, idsToRemove: Set<string>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(scoped)
      .map(([userId, ids]) => [userId, ids.filter((id) => !idsToRemove.has(id))])
      .filter(([, ids]) => ids.length > 0),
  );
}

function normalizeFieldLayoutPosition(value: unknown): PostPosition | null {
  if (!value || typeof value !== "object") return null;
  const position = value as Partial<PostPosition>;
  const x = Number(position.x);
  const y = Number(position.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return clampPostPosition({ x, y });
}

function normalizeLocalSession(current: SocialState): SocialState {
  const anonymousGuest = getAnonymousGuestUser();
  const users = ensureLocalGuestUsers(current.users, anonymousGuest);
  const hasDiscordSession = Boolean(readStoredDiscordSession());
  const activeUserId = hasDiscordSession
    ? current.activeUserId
    : current.activeUserId === "rub1kub"
      ? anonymousGuest.id
      : current.activeUserId.startsWith("discord:")
        ? anonymousGuest.id
        : current.activeUserId === guestUserId
          ? anonymousGuest.id
          : current.activeUserId;

  return {
    ...current,
    users,
    activeUserId: users.some((user) => user.id === activeUserId) ? activeUserId : anonymousGuest.id,
  };
}

function mergeSharedStateWithLocalSession(current: SocialState, shared: SocialState): SocialState {
  const anonymousGuest = getAnonymousGuestUser();
  const currentUsers = ensureLocalGuestUsers(current.users, anonymousGuest);
  const sharedUsers = ensureLocalGuestUsers(shared.users, anonymousGuest);
  const activeUser = currentUsers.find((user) => user.id === current.activeUserId) ?? anonymousGuest;
  const users = upsertUser(sharedUsers, activeUser);
  const activeUserId = users.some((user) => user.id === current.activeUserId)
    ? current.activeUserId
    : anonymousGuest.id;

  return {
    ...shared,
    users,
    posts: mergeSharedPostsWithLocalOptimism(current.posts, shared.posts),
    activeUserId,
  };
}

function mergeSharedPostsWithLocalOptimism(currentPosts: Post[], sharedPosts: Post[]): Post[] {
  const currentById = new Map(currentPosts.map((post) => [post.id, post]));

  return sharedPosts.map((post) => {
    const currentPost = currentById.get(post.id);
    if (!currentPost) return post;
    const reactions = Math.max(post.reactions, currentPost.reactions);
    if (reactions === post.reactions) return post;
    return { ...post, reactions };
  });
}

function prepareSharedStateForWrite(current: SocialState): SocialState {
  return {
    ...current,
    users: ensureLocalGuestUsers(current.users),
    activeUserId: guestUserId,
  };
}

function activateDiscordProfile(current: SocialState, session: DiscordSession): SocialState {
  const profileId = `discord:${session.user.id}`;
  const existing = current.users.find((user) => user.id === profileId);
  const profile = discordSessionToProfile(session, existing);
  const currentUsers = ensureLocalGuestUsers(current.users);
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

function getUserStatus(user: UserProfile | undefined, forceOnline = false): string {
  if (user && forceOnline) return "Онлайн";

  const lastSeenAt = Number(user?.lastSeenAt);
  if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) {
    return "Не заходил";
  }

  const diff = Date.now() - lastSeenAt;
  if (diff <= userOnlineWindowMs) return "Онлайн";
  if (diff <= userRecentlySeenWindowMs) return `Был ${formatRelativeTime(lastSeenAt)}`;
  return `Был ${formatRelativeTime(lastSeenAt)}`;
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

function createDefaultPostDraftOptions(): PostDraftOptions {
  return {
    appearance: { ...defaultPostAppearance },
    checklist: [],
    kind: "note",
    settings: { ...defaultPostSettings },
    sketch: [],
  };
}

function createDefaultPoll(text = ""): PostPoll {
  return {
    question: text.trim().slice(0, 160) || "Голосование",
    multi: false,
    options: [
      { id: crypto.randomUUID(), text: "Да", voterIds: [] },
      { id: crypto.randomUUID(), text: "Нет", voterIds: [] },
    ],
  };
}

function buildPostDraftOptionsFromPost(post: Post): PostDraftOptions {
  return normalizePostDraftOptions({
    appearance: post.appearance,
    checklist: post.checklist,
    kind: post.kind,
    poll: post.poll,
    settings: post.settings,
    sketch: post.sketch,
  }, post.attachments);
}

function normalizePostDraftOptions(
  options: Partial<PostDraftOptions> | undefined,
  _attachments: MediaAttachment[] = [],
): PostDraftOptions {
  const kind = getAllowedPostKind(options?.kind) ?? "note";
  const settings = {
    ...defaultPostSettings,
    ...(options?.settings ?? {}),
  };
  const appearance = {
    ...defaultPostAppearance,
    ...(options?.appearance ?? {}),
  };
  const checklist = (options?.checklist ?? [])
    .map((item) => ({
      id: item.id || crypto.randomUUID(),
      text: item.text.trim().slice(0, 120),
      checkedBy: Array.from(new Set(item.checkedBy ?? [])),
    }))
    .filter((item) => item.text)
    .slice(0, 24);
  const sketch = (options?.sketch ?? [])
    .filter((stroke) => stroke.points.length > 1)
    .slice(0, 80);
  const poll = normalizeDraftPoll(options?.poll);

  return {
    appearance: {
      accentColor: normalizeOptionalWallAccentValue(appearance.accentColor),
      background: ["plain", "soft", "glass", "gradient", "paper"].includes(appearance.background)
        ? appearance.background
        : "plain",
      shape: ["soft", "round", "sharp", "ticket"].includes(appearance.shape) ? appearance.shape : "soft",
      size: ["compact", "normal", "wide", "tall"].includes(appearance.size) ? appearance.size : "normal",
    },
    checklist,
    kind,
    poll,
    settings,
    sketch,
  };
}

function normalizeDraftPoll(poll: PostPoll | undefined): PostPoll | undefined {
  if (!poll) return undefined;
  const options = poll.options
    .map((option) => ({
      id: option.id || crypto.randomUUID(),
      text: option.text.trim().slice(0, 90),
      voterIds: Array.from(new Set(option.voterIds ?? [])),
    }))
    .filter((option) => option.text)
    .slice(0, 8);

  if (options.length < 2) return undefined;

  return {
    question: poll.question.trim().slice(0, 160) || "Голосование",
    multi: poll.multi,
    options,
  };
}

function hasPublishablePostDraft(
  text: string,
  attachments: MediaAttachment[],
  options: PostDraftOptions,
): boolean {
  return Boolean(
    text.trim() ||
      attachments.length > 0 ||
      options.sketch.length > 0 ||
      options.checklist.some((item) => item.text.trim()) ||
      (options.poll && options.poll.options.length >= 2),
  );
}

function getAllowedPostKind(kind: unknown): PostKind | undefined {
  return postKindOptions.some((item) => item.id === kind) ? kind as PostKind : undefined;
}

function getPostKind(post: Post): PostKind {
  return getAllowedPostKind(post.kind) ?? "note";
}

function getPostSettings(post: Post | undefined): PostInteractionSettings {
  return {
    ...defaultPostSettings,
    ...(post?.settings ?? {}),
  };
}

function getPostAppearance(post: Post | undefined): PostAppearance {
  return {
    ...defaultPostAppearance,
    ...(post?.appearance ?? {}),
  };
}

function getPostAccentStyle(appearance: PostAppearance, wall: Wall | undefined): CSSProperties {
  const accentOption = getWallAccentOption(appearance.accentColor ?? wall?.accentColor ?? wallAccentOptions[0].id);

  return {
    "--post-accent": accentOption.accent,
    "--post-accent-2": accentOption.accent2,
    "--post-accent-soft": accentOption.soft,
  } as CSSProperties;
}

function strokeToPath(points: SketchPoint[]): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function normalizeRuntimeBoardCopy(current: SocialState): SocialState {
  let changed = false;
  const users = current.users.map((user) => {
    const bio = normalizeBoardCopyText(user.bio);
    const status = user.status?.trim() === "Онлайн" ? undefined : user.status?.trim();
    if (bio === user.bio && status === user.status) return user;
    changed = true;
    return { ...user, bio, status };
  });
  const walls = current.walls.map((wall) => {
    const description = normalizeBoardCopyText(wall.description ?? "");
    const rules = normalizeBoardCopyText(wall.rules ?? "");
    if (description === (wall.description ?? "") && rules === (wall.rules ?? "")) return wall;
    changed = true;
    return { ...wall, description, rules };
  });
  const wallsWithMinecraft = ensureMinecraftWallExists(walls);
  if (wallsWithMinecraft !== walls) changed = true;
  const normalizedPosts = current.posts.map((post) => {
    const text = normalizeBoardCopyText(post.text);
    if (text === post.text) return post;
    changed = true;
    return { ...post, text };
  });
  const posts = ensureMinecraftDownloadPost(normalizedPosts, current.utilityPositions, current.users);
  if (posts !== normalizedPosts) changed = true;
  const utilityPositions = current.utilityPositions[minecraftDownloadObjectId]
    ? current.utilityPositions
    : {
        ...current.utilityPositions,
        [minecraftDownloadObjectId]: getDefaultMinecraftDownloadPosition(),
      };
  if (utilityPositions !== current.utilityPositions) changed = true;

  return changed ? { ...current, users, walls: wallsWithMinecraft, posts, utilityPositions } : current;
}

function normalizeBoardCopyText(text: string): string {
  return text
    .replaceAll("Ведёт свою стену", "Ведёт свою доску")
    .replaceAll("Общая стена", "Общая доска")
    .replaceAll("Заметка на стене", "Заметка на доске")
    .replaceAll("Пост на стене", "Заметка на доске")
    .replaceAll("Профильная стена", "Профильная доска");
}

function ensureMinecraftDownloadPost(
  posts: Post[],
  utilityPositions: SocialState["utilityPositions"],
  users: UserProfile[],
): Post[] {
  const position = utilityPositions[minecraftDownloadObjectId] ?? getDefaultMinecraftDownloadPosition();
  const authorId = users.some((user) => user.id === minecraftOwnerUserId) ? minecraftOwnerUserId : guestUserId;
  const existing = posts.find((post) => post.id === minecraftDownloadPostId);

  if (existing) {
    let changed = false;
    const nextPosts = posts.map((post) => {
      if (post.id !== minecraftDownloadPostId) return post;

      const nextPost: Post = {
        ...post,
        wallId: minecraftWallId,
        authorId: users.some((user) => user.id === post.authorId) ? post.authorId : authorId,
        text: "мод пак для игры на WhiteShield",
        position: post.position ?? position,
      };
      changed ||= nextPost.wallId !== post.wallId ||
        nextPost.authorId !== post.authorId ||
        nextPost.text !== post.text ||
        nextPost.position !== post.position;
      return nextPost;
    });

    return changed ? nextPosts : posts;
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

function getBoardColumnCount(maxX = 1800, offsetX = 0): number {
  const availableWidth = Math.max(0, maxX - offsetX);
  return Math.max(1, Math.min(3, Math.floor(availableWidth / (boardCardWidth + boardGap)) + 1));
}

function getDefaultBoardPosition(index: number, offsetX = 0, maxX = 1800, offsetY = 0): PostPosition {
  const columns = getBoardColumnCount(maxX, offsetX);
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: offsetX + column * (boardCardWidth + boardGap),
    y: offsetY + row * (boardCardHeight + boardGap),
  };
}

function getEstimatedBoardCardHeight(post: Post): number {
  return getEstimatedDraftPostHeight(post);
}

function getEstimatedBoardCardWidth(post: Post): number {
  if (post.id === minecraftDownloadPostId && post.wallId === minecraftWallId) return 540;

  switch (getPostAppearance(post).size) {
    case "compact":
      return 276;
    case "wide":
      return 480;
    case "tall":
      return 342;
    default:
      return boardCardWidth;
  }
}

function getEstimatedDraftPostWidth(
  post: Partial<Pick<Post, "appearance" | "id" | "wallId">>,
): number {
  if (post.id === minecraftDownloadPostId && post.wallId === minecraftWallId) return 540;

  switch (getPostAppearance(post as Post).size) {
    case "compact":
      return 276;
    case "wide":
      return 480;
    case "tall":
      return 342;
    default:
      return boardCardWidth;
  }
}

function getBoardMaxXForWidth(maxX: number, width = boardCardWidth): number {
  return Math.max(0, maxX - Math.max(0, width - boardCardWidth));
}

function getEstimatedDraftPostHeight(
  post: Pick<Post, "attachments" | "text"> &
    Partial<Pick<Post, "appearance" | "checklist" | "id" | "poll" | "repostOfId" | "sketch" | "wallId">>,
): number {
  if (post.id === minecraftDownloadPostId && post.wallId === minecraftWallId) return 332;

  let height = boardCardHeight;
  const textLength = post.text.trim().length;
  const appearance = getPostAppearance(post as Post);

  if (textLength > 90) {
    height += Math.min(120, Math.ceil((textLength - 90) / 44) * 22);
  }

  if (appearance.size === "compact") height -= 24;
  if (appearance.size === "tall") height += 120;

  if (post.attachments.length > 0) {
    height += post.attachments.length === 1 ? 230 : 190;
  }

  if ((post.sketch?.length ?? 0) > 0) {
    height += 170;
  }

  if ((post.checklist?.length ?? 0) > 0) {
    height += Math.min(220, 42 + (post.checklist?.length ?? 0) * 36);
  }

  if (post.poll) {
    height += 86 + post.poll.options.length * 44;
  }

  if (post.repostOfId) {
    height += 118;
  }

  return Math.max(boardCardHeight, Math.min(680, height));
}

function resolveBoardPostLayout(
  posts: Post[],
  {
    defaultOffsetX = 0,
    defaultOffsetY = 0,
    maxX = 1800,
    positionOverrides,
    usePostPositions = true,
  }: BoardLayoutOptions = {},
): BoardLayoutItem[] {
  const placed: BoardRect[] = [];

  return posts.map((post, index) => {
    const height = getEstimatedBoardCardHeight(post);
    const width = getEstimatedBoardCardWidth(post);
    const savedPosition = positionOverrides?.[post.id] ?? (usePostPositions ? post.position : undefined);
    const desiredPosition = clampPostPosition(
      savedPosition ?? getDefaultBoardPosition(index, defaultOffsetX, maxX, defaultOffsetY),
      getBoardMaxXForWidth(maxX, width),
    );
    const position = savedPosition
      ? desiredPosition
      : findOpenBoardPosition(
          desiredPosition,
          placed,
          index,
          maxX,
          defaultOffsetX,
          defaultOffsetY,
          height,
          width,
        );
    placed.push(postPositionToRect(position, height, width));

    return { height, post, position, width };
  });
}

function getNewBoardPostPosition(
  existingPosts: Post[],
  draft: Pick<Post, "attachments" | "text"> &
    Partial<Pick<Post, "appearance" | "checklist" | "poll" | "repostOfId" | "sketch">> = {
    attachments: [],
    text: "",
  },
): PostPosition {
  const nextHeight = getEstimatedDraftPostHeight(draft);
  const nextWidth = getEstimatedDraftPostWidth(draft);
  const board = typeof document !== "undefined"
    ? document.querySelector<HTMLElement>(".field-board")
    : null;
  if (!board) {
    const maxX = typeof window !== "undefined"
      ? Math.max(0, window.innerWidth - boardCardWidth - boardGap)
      : 1800;
    const placed = resolveBoardPostLayout(existingPosts, { maxX }).map(({ height, position, width }) =>
      postPositionToRect(position, height, width),
    );
    return findOpenBoardPosition(
      getFallbackNewBoardPosition(existingPosts.length),
      placed,
      existingPosts.length,
      maxX,
      0,
      0,
      nextHeight,
      nextWidth,
    );
  }

  const boardWidth = board?.getBoundingClientRect().width ?? 0;
  const maxX = boardWidth > 0 ? Math.max(0, boardWidth - boardCardWidth - boardGap) : 1800;
  const protectedRects = board ? getFieldProtectedRects(board) : [];
  const placed = resolveBoardPostLayout(existingPosts, { maxX }).map(({ height, position, width }) =>
    postPositionToRect(position, height, width),
  );
  const desiredPosition =
    getComposerDropPosition(board) ??
    findOpenBoardPosition(
      getDefaultBoardPosition(existingPosts.length, 0, maxX),
      placed,
      existingPosts.length,
      maxX,
      0,
      0,
      nextHeight,
      nextWidth,
    );

  return resolveSafeBoardPosition(desiredPosition, protectedRects, placed, maxX, nextHeight, nextWidth);
}

function getFallbackNewBoardPosition(index: number): PostPosition {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 760;
  return {
    x: isMobile ? 24 : 274 + (index % 2) * (boardCardWidth + boardGap),
    y: isMobile ? 320 : 360 + Math.floor(index / 2) * (boardCardHeight + boardGap),
  };
}

function getComposerDropPosition(board: HTMLElement | null): PostPosition | null {
  if (!board || typeof document === "undefined") return null;

  const composer = document.querySelector<HTMLElement>(".board-composer, .field-create-popover .field-composer");
  if (!composer) return null;

  const boardRect = board.getBoundingClientRect();
  const composerRect = composer.getBoundingClientRect();
  return clampPostPosition({
    x: composerRect.left - boardRect.left,
    y: composerRect.bottom - boardRect.top + boardGap,
  }, Math.max(0, boardRect.width - boardCardWidth - boardGap));
}

function resolveSafeBoardLayout(
  layout: BoardLayoutItem[],
  protectedRects: BoardRect[],
  maxX = 1800,
): BoardLayoutItem[] {
  if (protectedRects.length === 0) return layout;

  return layout.map((item) => {
    const safePosition = resolveSafeBoardPosition(item.position, protectedRects, [], maxX, item.height, item.width);
    return { ...item, position: safePosition };
  });
}

function resolveSafeBoardPosition(
  position: PostPosition,
  protectedRects: BoardRect[],
  placed: BoardRect[] = [],
  maxX = 1800,
  height = boardCardHeight,
  width = boardCardWidth,
): PostPosition {
  let candidate = clampPostPosition(position, getBoardMaxXForWidth(maxX, width));

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const blocker = findBoardPositionBlocker(candidate, protectedRects, placed, height, width);
    if (!blocker) return candidate;

    const variants = [
      { x: blocker.x + blocker.width, y: candidate.y },
      { x: candidate.x, y: blocker.y + blocker.height },
      { x: blocker.x + blocker.width, y: blocker.y + blocker.height },
    ]
      .map((item) => clampPostPosition(item, getBoardMaxXForWidth(maxX, width)))
      .sort((a, b) => getPositionDistance(position, a) - getPositionDistance(position, b));

    candidate = variants.find((item) => !doesBoardRectOverlap(postPositionToRect(item, height, width), blocker)) ?? variants[0];
  }

  return candidate;
}

function findBoardPositionBlocker(
  position: PostPosition,
  protectedRects: BoardRect[],
  placed: BoardRect[],
  height = boardCardHeight,
  width = boardCardWidth,
): BoardRect | undefined {
  const rect = postPositionToRect(position, height, width);
  const protectedBlocker = protectedRects.find((item) => doesBoardRectOverlap(rect, item));
  if (protectedBlocker) return protectedBlocker;

  return placed.find((item) => doesBoardRectOverlap(rect, item));
}

function postPositionToRect(position: PostPosition, height = boardCardHeight, width = boardCardWidth): BoardRect {
  return {
    x: position.x,
    y: position.y,
    width,
    height,
  };
}

function doesBoardRectOverlap(a: BoardRect, b: BoardRect): boolean {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function getPositionDistance(origin: PostPosition, candidate: PostPosition): number {
  return Math.abs(origin.x - candidate.x) + Math.abs(origin.y - candidate.y);
}

function getInitialFieldBoardDefaultX(): number {
  if (typeof window === "undefined" || window.innerWidth < 760) return 0;
  return 250;
}

function getInitialFieldBoardDefaultY(hasDirectory = true): number {
  if (typeof window === "undefined" || window.innerWidth < 760) return hasDirectory ? 320 : 230;
  return hasDirectory ? 360 : 250;
}

function getFieldBoardContentStartY(board: HTMLElement): number {
  const boardRect = board.getBoundingClientRect();
  const selectors = [
    ".field-create-popover",
    ".board-directory",
    ".field-toolbelt",
    ".field-filterbar",
    ".field-command",
    ".topbar",
  ];
  const bottom = selectors.reduce((maxBottom, selector) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return maxBottom;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return maxBottom;
    return Math.max(maxBottom, rect.bottom - boardRect.top + boardGap);
  }, 0);

  return Math.max(0, Math.round(bottom));
}

function getFieldProtectedRects(board: HTMLElement): BoardRect[] {
  const boardRect = board.getBoundingClientRect();
  const selectors = [
    ".site-panel",
    ".topbar .search",
    ".field-command",
    ".field-filterbar",
    ".field-toolbelt",
    ".field-create-popover",
    ".board-directory > .field-object",
    ".field-wall-cover",
    ".board-composer",
    ".profile-bio",
    ".mobile-tabbar",
    ".mobile-fab",
  ];
  const padding = 12;

  return selectors.flatMap((selector) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return [];
      return [{
        x: Math.round(rect.left - boardRect.left - padding),
        y: Math.round(rect.top - boardRect.top - padding),
        width: Math.round(rect.width + padding * 2),
        height: Math.round(rect.height + padding * 2),
      }];
    }),
  );
}

function findOpenBoardPosition(
  desiredPosition: PostPosition,
  placed: BoardRect[],
  index: number,
  maxX = 1800,
  defaultOffsetX = 0,
  defaultOffsetY = 0,
  height = boardCardHeight,
  width = boardCardWidth,
): PostPosition {
  if (!hasBoardPositionOverlap(desiredPosition, placed, height, width)) return desiredPosition;

  const defaultPosition = clampPostPosition(getDefaultBoardPosition(index, defaultOffsetX, maxX, defaultOffsetY), getBoardMaxXForWidth(maxX, width));
  if (!hasBoardPositionOverlap(defaultPosition, placed, height, width)) return defaultPosition;

  const columns = getBoardColumnCount(maxX, defaultOffsetX);
  const startRow = Math.floor(index / columns);
  const rowStep = boardGridSize;

  for (let rowOffset = 0; rowOffset < 220; rowOffset += 1) {
    for (let column = 0; column < columns; column += 1) {
      const candidate = clampPostPosition({
        x: defaultOffsetX + column * (boardCardWidth + boardGap),
        y: defaultOffsetY + (startRow * Math.ceil((boardCardHeight + boardGap) / rowStep) + rowOffset) * rowStep,
      }, getBoardMaxXForWidth(maxX, width));

      if (!hasBoardPositionOverlap(candidate, placed, height, width)) return candidate;
    }
  }

  return clampPostPosition({
    x: defaultOffsetX,
    y: defaultOffsetY + (startRow + 220) * rowStep,
  }, getBoardMaxXForWidth(maxX, width));
}

function hasBoardPositionOverlap(position: PostPosition, placed: BoardRect[], height = boardCardHeight, width = boardCardWidth): boolean {
  const rect = postPositionToRect(position, height, width);
  const paddedRect = {
    ...rect,
    x: rect.x - boardGap,
    y: rect.y - boardGap,
    width: rect.width + boardGap * 2,
    height: rect.height + boardGap * 2,
  };

  return placed.some((other) => doesBoardRectOverlap(paddedRect, other));
}

function getBoardCanvasHeight(posts: Post[], options?: BoardLayoutOptions): number {
  const postLayout = resolveBoardPostLayout(posts, options);

  return Math.max(
    720,
    ...postLayout.map(({ height, position }) => position.y + height + boardGap),
  );
}

function isPostOpenIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button, a, input, textarea, select, audio, video, .post-menu, .media-grid, [data-no-open]"));
}

function isPostConnectionClickIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, audio, video, .post-menu, .post-menu-trigger, [data-no-open]"));
}

function getDefaultMinecraftDownloadPosition(): PostPosition {
  if (typeof window !== "undefined" && window.innerWidth < 900) {
    return { x: 24, y: 44 };
  }
  return { x: 274, y: 44 };
}

function formatWallChannelName(wall: Wall): string {
  return wall.name.trim() || "доска";
}

function formatWallTextName(wall: Wall): string {
  return formatWallChannelName(wall);
}

function formatWallInitial(value: string): string {
  return value.trim().slice(0, 1).toUpperCase() || "#";
}

function getWallAccentOption(value: string | undefined): WallAccentOption {
  const preset = wallAccentOptions.find((option) => option.id === value);
  if (preset) return preset;

  const customColor = normalizeHexColor(value);
  if (!customColor) return wallAccentOptions[0];

  return {
    id: customColor,
    label: "Свой",
    accent: customColor,
    accent2: getReadableAccentColor(customColor),
    soft: hexToRgba(customColor, 0.17),
  };
}

function getWallAccentCssVars(option: WallAccentOption): CSSProperties {
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

function normalizeWallAccentValue(value: string | undefined): string {
  return normalizeOptionalWallAccentValue(value) ?? wallAccentOptions[0].id;
}

function normalizeOptionalWallAccentValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (wallAccentOptions.some((option) => option.id === trimmed)) return trimmed;
  return normalizeHexColor(trimmed);
}

function normalizeHexColor(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  const shortMatch = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : undefined;
}

function hexToRgb(color: string): { b: number; g: number; r: number } {
  const normalized = normalizeHexColor(color) ?? wallAccentOptions[0].accent;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function mixHexColor(color: string, target: string, amount: number): string {
  const from = hexToRgb(color);
  const to = hexToRgb(target);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);

  return `#${[mix(from.r, to.r), mix(from.g, to.g), mix(from.b, to.b)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getReadableAccentColor(color: string): string {
  const { r, g, b } = hexToRgb(color);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? mixHexColor(color, "#111318", 0.46) : mixHexColor(color, "#ffffff", 0.22);
}

function hexToRgba(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    return route.view === "spaceHub" || route.view === "spaceBoards";
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

function createWallInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function buildWallInviteSettings(
  code: string,
  ttlDays: string,
  maxUses: string,
  usedBy: string[] = [],
): WallInviteSettings {
  const normalizedCode = code.trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || createWallInviteCode();
  const ttl = Number.parseInt(ttlDays, 10);
  const limit = Number.parseInt(maxUses, 10);

  return {
    code: normalizedCode,
    expiresAt: Number.isFinite(ttl) && ttl > 0 ? Date.now() + ttl * 24 * 60 * 60 * 1000 : undefined,
    maxUses: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    usedBy: Array.from(new Set(usedBy.filter((id) => typeof id === "string"))).slice(0, 200),
  };
}

function normalizeWallInviteSettings(value: WallInviteSettings | undefined): WallInviteSettings | undefined {
  if (!value?.code) return undefined;
  return {
    code: value.code.trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || createWallInviteCode(),
    expiresAt: Number.isFinite(Number(value.expiresAt)) && Number(value.expiresAt) > 0 ? Number(value.expiresAt) : undefined,
    maxUses: Number.isFinite(Number(value.maxUses)) && Number(value.maxUses) > 0 ? Math.round(Number(value.maxUses)) : undefined,
    usedBy: Array.from(new Set(Array.isArray(value.usedBy) ? value.usedBy.filter((id) => typeof id === "string") : [])).slice(0, 200),
  };
}

function formatInviteTtlDays(expiresAt: number | undefined): string {
  if (!expiresAt) return "30";
  const days = Math.max(1, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
  return String(days);
}

function getWallInvitePreview(wallId: string, code: string): string {
  const path = routeToPath({ view: "space", spaceId: wallId }, new Map(), []);
  return `${window.location.origin}${path}?invite=${encodeURIComponent(code.trim())}`;
}

function canManageWall(wall: Wall | undefined, userId: string): boolean {
  if (!wall) return false;
  if (wall.id.startsWith(profileWallPrefix)) return wall.id === getProfileWallId(userId);
  if (wall.id === minecraftWallId) return isMinecraftAdminUserId(userId) || wall.ownerId === userId;
  return wall.ownerId === userId;
}

function canViewWall(
  wall: Wall,
  userId: string | undefined,
  followedWallIds: Set<string>,
  inviteCode: string,
): boolean {
  if (wall.privacyMode !== "link" && wall.privacyMode !== "invite") return true;
  if (userId && canManageWall(wall, userId)) return true;
  if (followedWallIds.has(wall.id)) return true;
  return isWallInviteActive(wall.invite, inviteCode);
}

function isWallInviteActive(invite: WallInviteSettings | undefined, code: string): boolean {
  if (!invite || !code || invite.code !== code.trim()) return false;
  if (invite.expiresAt && invite.expiresAt < Date.now()) return false;
  if (invite.maxUses && invite.usedBy.length >= invite.maxUses) return false;
  return true;
}

function canMoveSharedPost(post: Post | undefined, walls: Wall[], userId: string | undefined): boolean {
  if (!post || !userId) return false;
  if (post.wallId.startsWith(profileWallPrefix)) return post.wallId === getProfileWallId(userId);

  return canManageWall(walls.find((wall) => wall.id === post.wallId), userId);
}

function canPublishToWall(wall: Wall | undefined, userId: string): boolean {
  if (!wall) return false;
  if (wall.id.startsWith(profileWallPrefix)) return true;
  return wall.publishMode !== "owner" || canManageWall(wall, userId);
}

function isMinecraftAdminUserId(userId: string): boolean {
  return minecraftAdminUserIds.has(userId);
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

function createMinecraftWall(): Wall {
  return {
    id: minecraftWallId,
    siteSectionId: spaceSectionId,
    name: cyberKotletaModpackName,
    ownerId: minecraftOwnerUserId,
    description: "мод пак для игры на WhiteShield",
    rules: "",
    accentColor: "green",
    publishMode: "owner",
  };
}

function ensureMinecraftWallExists(walls: Wall[]): Wall[] {
  return walls.some((wall) => wall.id === minecraftWallId) ? walls : [createMinecraftWall(), ...walls];
}

function readRouteFromPath(pathname: string, users: UserProfile[], walls: Wall[]): AppRoute {
  const parts = pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const first = parts[0]?.toLowerCase();

  if (!first || first === "main") return { view: "feed" };
  if (first === "feed") return { view: "feed" };
  if (first === "top") return { view: "top" };
  if (first === "mine") return { view: "space", spaceId: minecraftWallId };
  if (first === "space" && !parts[1]) return { view: "spaceHub" };
  if (first === "space" && parts[1]?.toLowerCase() === "minecraft") return { view: "space", spaceId: minecraftWallId };
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
