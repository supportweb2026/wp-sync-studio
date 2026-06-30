import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  postIds: z.array(z.number()).min(1).max(50),
  duplicateStrategy: z.enum(["skip", "overwrite", "copy"]).default("skip"),
});

export interface ApifyBatchItemResult {
  sourceId: number;
  slug: string;
  ok: boolean;
  skipped: boolean;
  postUrl: string | null;
  postId: number | null;
  runId: string | null;
  error: string | null;
}

export const runSiteBApifyBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    // Load source connection and posts
    const { data: row, error } = await context.supabase
      .from("wp_connections")
      .select("site_url,username,app_password_encrypted")
      .eq("user_id", context.userId)
      .eq("role", "source")
      .maybeSingle();
    if (error || !row) throw new Error("Connexion source introuvable");
    const src = row as {
      site_url: string;
      username: string;
      app_password_encrypted: string;
    };
    const { decryptSecret } = await import("@/services/wordpress/crypto.server");
    const auth = {
      siteUrl: src.site_url,
      username: src.username,
      appPassword: await decryptSecret(src.app_password_encrypted),
    };
    const { listAllPosts } = await import("@/services/wordpress/posts.server");
    const all = await listAllPosts(auth);
    const selected = all.filter((p) => data.postIds.includes(p.id));

    const { publishToSiteB } = await import("@/lib/site-b/apify.functions");
    const results: ApifyBatchItemResult[] = [];
    for (const post of selected) {
      const res = await publishToSiteB({
        data: {
          title: post.title.rendered,
          slug: post.slug,
          content: post.content.rendered,
          excerpt: post.excerpt.rendered,
          date: post.date,
          duplicateStrategy: data.duplicateStrategy,
          sourcePostId: post.id,
        },
      }).catch((e: unknown) => ({
        ok: false,
        runId: null,
        postUrl: null,
        postId: null,
        skipped: false,
        error: e instanceof Error ? e.message : String(e),
      }));
      results.push({
        sourceId: post.id,
        slug: post.slug,
        ok: res.ok,
        skipped: res.skipped,
        postUrl: res.postUrl,
        postId: res.postId,
        runId: res.runId,
        error: res.error,
      });
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { results, succeeded, total: results.length };
  });
