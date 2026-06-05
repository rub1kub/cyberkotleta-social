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

export type UserProfile = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  joinedAt: number;
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

export type Post = {
  id: string;
  wallId: string;
  authorId: string;
  text: string;
  attachments: MediaAttachment[];
  reactions: number;
  views: PostViewStats;
  position?: PostPosition;
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
