export type Theme = "light" | "dark";

export type SiteSectionKind = "social" | "leaderboard" | "minecraft";

export type MediaKind = "image" | "video" | "audio";

export type MediaAttachment = {
  id: string;
  type: MediaKind;
  name: string;
  size: number;
  url: string;
};

export type MediaFocus = {
  x: number;
  y: number;
};

export type WallPrivacyMode = "public" | "link" | "invite";

export type WallInviteSettings = {
  code: string;
  expiresAt?: number;
  maxUses?: number;
  usedBy: string[];
};

export type UserProfile = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  status?: string;
  joinedAt: number;
  lastSeenAt?: number;
  timeOnSiteMinutes: number;
  avatarUrl?: string;
  provider?: "local" | "discord";
  discordId?: string;
};

export type PostViewStats = {
  total: number;
  uniqueUserIds: string[];
};

export type PostPosition = {
  x: number;
  y: number;
};

export type PostKind =
  | "note"
  | "media"
  | "sketch"
  | "idea"
  | "list"
  | "question"
  | "poll"
  | "checklist"
  | "link"
  | "signal";

export type PostInteractionSettings = {
  comments: boolean;
  reactions: boolean;
  reposts: boolean;
  saves: boolean;
  views: boolean;
};

export type PostAppearance = {
  accentColor?: string;
  background: "plain" | "soft" | "glass" | "gradient" | "paper";
  shape: "soft" | "round" | "sharp" | "ticket";
  size: "compact" | "normal" | "wide" | "tall";
};

export type SketchPoint = {
  x: number;
  y: number;
};

export type SketchStroke = {
  id: string;
  color: string;
  width: number;
  points: SketchPoint[];
};

export type ChecklistItem = {
  id: string;
  text: string;
  checkedBy: string[];
};

export type PollOption = {
  id: string;
  text: string;
  voterIds: string[];
};

export type PostPoll = {
  question: string;
  multi: boolean;
  options: PollOption[];
};

export type PostConnection = {
  id: string;
  fromPostId: string;
  toPostId: string;
  authorId: string;
  label?: string;
  createdAt: number;
};

export type Post = {
  id: string;
  wallId: string;
  authorId: string;
  kind?: PostKind;
  text: string;
  attachments: MediaAttachment[];
  reactions: number;
  views: PostViewStats;
  position?: PostPosition;
  appearance?: PostAppearance;
  settings?: PostInteractionSettings;
  sketch?: SketchStroke[];
  checklist?: ChecklistItem[];
  poll?: PostPoll;
  repostOfId?: string;
  editedAt?: number;
  createdAt: number;
};

export type Comment = {
  id: string;
  postId: string;
  parentId?: string;
  authorId: string;
  text: string;
  attachments: MediaAttachment[];
  reactions: number;
  createdAt: number;
  editedAt?: number;
};

export type SiteSection = {
  id: string;
  name: string;
  kind: SiteSectionKind;
};

export type Wall = {
  id: string;
  siteSectionId: string;
  name: string;
  ownerId?: string;
  description?: string;
  rules?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  coverUrl?: string;
  avatarFocus?: MediaFocus;
  bannerFocus?: MediaFocus;
  accentColor?: string;
  actionButtons?: WallActionButton[];
  privacyMode?: WallPrivacyMode;
  invite?: WallInviteSettings;
  publishMode?: "open" | "owner";
};

export type WallActionButton = {
  id: string;
  label: string;
  url: string;
};

export type Follow = {
  id: string;
  targetId: string;
  targetType: "user" | "wall";
  createdAt: number;
};

export type NotificationKind = "reaction" | "comment" | "reply" | "mention" | "repost" | "follow" | "report";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  actorId: string;
  recipientId: string;
  postId?: string;
  commentId?: string;
  wallId?: string;
  text: string;
  createdAt: number;
  readAt?: number;
};

export type Report = {
  id: string;
  postId?: string;
  commentId?: string;
  reporterId: string;
  reason: string;
  createdAt: number;
};

export type PixelCell = {
  x: number;
  y: number;
  color: string;
  authorId: string;
  updatedAt: number;
};

export type SocialState = {
  siteSections: SiteSection[];
  users: UserProfile[];
  activeUserId: string;
  walls: Wall[];
  posts: Post[];
  comments: Comment[];
  utilityPositions: Record<string, PostPosition>;
  postConnections: PostConnection[];
  follows: Follow[];
  savedPostIds: string[];
  pinnedPostIds: string[];
  hiddenPostIds: string[];
  hiddenCommentIds: string[];
  notifications: NotificationItem[];
  pixelCells: PixelCell[];
  pixelCooldowns: Record<string, number>;
  reports: Report[];
};
