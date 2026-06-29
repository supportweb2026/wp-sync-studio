import type {
  MigrationOptions,
  MigrationReportItem,
  WpPost,
  WpTerm,
} from "@/schemas/wordpress";
import { type WpAuth, WpHttpError } from "@/services/wordpress/client.server";
import { uploadMediaFromUrl, getMedia } from "@/services/wordpress/media.server";
import {
  createPost,
  updatePost,
  listAllPosts,
} from "@/services/wordpress/posts.server";
import {
  findOrCreateTerm,
  listAllTerms,
} from "@/services/wordpress/terms.server";
import { extractImageUrls, rewriteImageUrls } from "./image-rewriter";

export interface LogEntry {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
  httpStatus?: number;
}

export interface MigrationResult {
  report: MigrationReportItem[];
  log: LogEntry[];
}

function nowStamp(): string {
  return new Date().toISOString();
}

async function resolveTermIds(
  src: WpAuth,
  dst: WpAuth,
  kind: "categories" | "tags",
  ids: number[],
  cache: Map<string, WpTerm[]>,
  log: LogEntry[],
): Promise<number[]> {
  if (ids.length === 0) return [];
  if (!cache.has(`src-${kind}`))
    cache.set(`src-${kind}`, await listAllTerms(src, kind));
  const srcTerms = cache.get(`src-${kind}`) ?? [];
  const out: number[] = [];
  for (const id of ids) {
    const term = srcTerms.find((t) => t.id === id);
    if (!term) continue;
    try {
      const dstId = await findOrCreateTerm(dst, kind, term);
      out.push(dstId);
    } catch (e) {
      log.push({
        ts: nowStamp(),
        level: "warn",
        message: `Échec ${kind} "${term.slug}": ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return out;
}

export async function migratePost(
  src: WpAuth,
  dst: WpAuth,
  post: WpPost,
  destinationExisting: WpPost | null,
  options: MigrationOptions,
  termCache: Map<string, WpTerm[]>,
  log: LogEntry[],
): Promise<MigrationReportItem> {
  const base: MigrationReportItem = {
    sourceId: post.id,
    slug: post.slug,
    title: post.title.rendered,
    ok: false,
    destinationId: null,
    step: "init",
    httpStatus: null,
    message: null,
  };

  try {
    // duplicate strategy
    if (destinationExisting) {
      if (options.duplicateStrategy === "skip") {
        log.push({
          ts: nowStamp(),
          level: "info",
          message: `Doublon ignoré: ${post.slug}`,
        });
        return {
          ...base,
          ok: true,
          destinationId: destinationExisting.id,
          step: "skipped",
          message: "Doublon ignoré",
        };
      }
    }

    base.step = "terms";
    const [categoryIds, tagIds] = await Promise.all([
      resolveTermIds(src, dst, "categories", post.categories, termCache, log),
      resolveTermIds(src, dst, "tags", post.tags, termCache, log),
    ]);

    base.step = "featured";
    let featuredMediaId = 0;
    const urlMap = new Map<string, string>();
    if (options.migrateFeaturedImage && post.featured_media) {
      const media = await getMedia(src, post.featured_media);
      if (media) {
        const uploaded = await uploadMediaFromUrl(
          dst,
          media.source_url,
          media.alt_text ?? "",
        );
        if (uploaded) {
          featuredMediaId = uploaded.id;
          urlMap.set(media.source_url, uploaded.source_url);
        } else {
          log.push({
            ts: nowStamp(),
            level: "warn",
            message: `Image principale non transférée pour ${post.slug}`,
          });
        }
      }
    }

    let content = post.content.rendered;
    if (options.migrateInlineImages) {
      base.step = "images";
      const inline = extractImageUrls(content);
      for (const url of inline) {
        if (urlMap.has(url)) continue;
        const uploaded = await uploadMediaFromUrl(dst, url, "");
        if (uploaded) urlMap.set(url, uploaded.source_url);
      }
      content = rewriteImageUrls(content, urlMap);
    }

    base.step = "post";
    const payload: Record<string, unknown> = {
      title: post.title.rendered,
      content,
      categories: categoryIds,
      tags: tagIds,
    };
    if (options.preserveSlug) payload.slug = post.slug;
    if (options.preserveDate) payload.date = post.date;
    if (options.preserveStatus) payload.status = post.status;
    if (options.preserveExcerpt) payload.excerpt = post.excerpt.rendered;
    if (featuredMediaId) payload.featured_media = featuredMediaId;
    if (post.comment_status) payload.comment_status = post.comment_status;
    if (post.ping_status) payload.ping_status = post.ping_status;

    if (destinationExisting && options.duplicateStrategy === "overwrite") {
      const updated = await updatePost(dst, destinationExisting.id, payload);
      log.push({
        ts: nowStamp(),
        level: "info",
        message: `Mis à jour: ${updated.slug}`,
      });
      return { ...base, ok: true, destinationId: updated.id, step: "done" };
    }
    if (destinationExisting && options.duplicateStrategy === "copy") {
      payload.slug = `${post.slug}-copie`;
    }
    const created = await createPost(dst, payload);
    log.push({
      ts: nowStamp(),
      level: "info",
      message: `Créé: ${created.slug}`,
    });
    return { ...base, ok: true, destinationId: created.id, step: "done" };
  } catch (e) {
    const status = e instanceof WpHttpError ? e.status : null;
    const message = e instanceof Error ? e.message : String(e);
    log.push({
      ts: nowStamp(),
      level: "error",
      message: `Échec ${post.slug} (${base.step}): ${message}`,
      httpStatus: status ?? undefined,
    });
    return { ...base, httpStatus: status, message };
  }
}

export async function runMigration(
  src: WpAuth,
  dst: WpAuth,
  sourcePosts: WpPost[],
  options: MigrationOptions,
): Promise<MigrationResult> {
  const log: LogEntry[] = [];
  const report: MigrationReportItem[] = [];
  const termCache = new Map<string, WpTerm[]>();

  log.push({
    ts: nowStamp(),
    level: "info",
    message: `Lecture des articles du site destination...`,
  });
  const destinationPosts = await listAllPosts(dst);
  const dstBySlug = new Map(destinationPosts.map((p) => [p.slug, p]));

  log.push({
    ts: nowStamp(),
    level: "info",
    message: `Migration de ${sourcePosts.length} article(s)...`,
  });

  for (const post of sourcePosts) {
    const existing = dstBySlug.get(post.slug) ?? null;
    const item = await migratePost(
      src,
      dst,
      post,
      existing,
      options,
      termCache,
      log,
    );
    report.push(item);
  }

  log.push({
    ts: nowStamp(),
    level: "info",
    message: `Migration terminée: ${report.filter((r) => r.ok).length}/${report.length}`,
  });
  return { report, log };
}
