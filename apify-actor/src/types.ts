export interface ActorArticle {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  tagSlug?: string;
  date?: string;
  featuredImageUrl?: string;
}

export type ActorMode = "publish" | "login-check";

export interface ActorInput {
  mode?: ActorMode;
  siteUrl: string;
  username: string;
  password: string;
  loginPath?: string;
  cptSlug?: string;
  duplicateStrategy?: "skip" | "overwrite" | "copy";
  article?: ActorArticle;
}

export interface ActorPublishOutput {
  ok: boolean;
  skipped?: boolean;
  postUrl?: string;
  postId?: number;
  error?: string;
}

export interface ActorLoginCheckOutput {
  ok: boolean;
  loginOk: boolean;
  dashboardReachable: boolean;
  error?: string;
}

export type ActorOutput = ActorPublishOutput | ActorLoginCheckOutput;
