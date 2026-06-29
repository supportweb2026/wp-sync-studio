import { z } from "zod";

export const credentialsSchema = z.object({
  siteUrl: z
    .string()
    .trim()
    .url("URL invalide")
    .refine((u) => /^https?:\/\//.test(u), "Doit commencer par http(s)://")
    .transform((u) => u.replace(/\/+$/, "")),
  username: z.string().trim().min(1).max(120),
  appPassword: z.string().trim().max(200),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const roleSchema = z.enum(["source", "destination"]);
export type Role = z.infer<typeof roleSchema>;

export const capabilitiesSchema = z.object({
  reachable: z.boolean(),
  wpVersion: z.string().nullable(),
  user: z
    .object({ id: z.number(), name: z.string(), slug: z.string().optional() })
    .nullable(),
  totalPosts: z.number().nullable(),
  totalCategories: z.number().nullable(),
  totalTags: z.number().nullable(),
  totalMedia: z.number().nullable(),
  canEditPosts: z.boolean(),
  canPublishPosts: z.boolean(),
  canManageCategories: z.boolean(),
  canUploadFiles: z.boolean(),
  errors: z.array(z.string()),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;

export const wpTermSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional().default(""),
  count: z.number().optional(),
  parent: z.number().optional(),
});
export type WpTerm = z.infer<typeof wpTermSchema>;

export const wpMediaSchema = z.object({
  id: z.number(),
  slug: z.string(),
  source_url: z.string(),
  mime_type: z.string().optional(),
  alt_text: z.string().optional().default(""),
  title: z.object({ rendered: z.string() }).partial().optional(),
});
export type WpMedia = z.infer<typeof wpMediaSchema>;

export const wpUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().optional(),
});
export type WpUser = z.infer<typeof wpUserSchema>;

export const wpPostSchema = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.object({ rendered: z.string() }),
  content: z.object({ rendered: z.string(), protected: z.boolean().optional() }),
  excerpt: z.object({ rendered: z.string() }),
  date: z.string(),
  date_gmt: z.string().optional().nullable(),
  modified: z.string().optional(),
  status: z.string(),
  author: z.number(),
  categories: z.array(z.number()).default([]),
  tags: z.array(z.number()).default([]),
  featured_media: z.number().default(0),
  comment_status: z.string().optional(),
  ping_status: z.string().optional(),
  link: z.string(),
});
export type WpPost = z.infer<typeof wpPostSchema>;

export const migrationOptionsSchema = z.object({
  postIds: z.array(z.number()).default([]),
  scope: z.enum(["selection", "missing", "different", "all"]).default("selection"),
  duplicateStrategy: z.enum(["skip", "overwrite", "copy"]).default("skip"),
  preserveSlug: z.boolean().default(true),
  preserveDate: z.boolean().default(true),
  preserveStatus: z.boolean().default(true),
  preserveExcerpt: z.boolean().default(true),
  migrateFeaturedImage: z.boolean().default(true),
  migrateInlineImages: z.boolean().default(true),
});
export type MigrationOptions = z.infer<typeof migrationOptionsSchema>;

export const migrationReportItemSchema = z.object({
  sourceId: z.number(),
  slug: z.string(),
  title: z.string(),
  ok: z.boolean(),
  destinationId: z.number().nullable(),
  step: z.string(),
  httpStatus: z.number().nullable(),
  message: z.string().nullable(),
});
export type MigrationReportItem = z.infer<typeof migrationReportItemSchema>;
