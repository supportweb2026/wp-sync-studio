export interface ActorArticle {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  tagSlug?: string;
  date?: string;
  featuredImageUrl?: string;
}

export interface ActorInput {
  siteUrl: string;
  username: string;
  password: string;
  loginPath?: string;
  cptSlug?: string;
  duplicateStrategy?: "skip" | "overwrite" | "copy";
  article: ActorArticle;
}

export interface ActorOutput {
  ok: boolean;
  skipped?: boolean;
  postUrl?: string;
  postId?: number;
  error?: string;
}
