import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadDestAuthFromDb } from "@/lib/site-b/apify-internal.server";

const articleInput = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.string(),
  excerpt: z.string().optional(),
  tagSlug: z.string().optional(),
  date: z.string().optional(),
  featuredImageUrl: z.string().url().optional(),
  duplicateStrategy: z.enum(["skip", "overwrite", "copy"]).default("skip"),
  sourcePostId: z.number().int().optional(),
});

export type ApifyPublishInput = z.infer<typeof articleInput>;

export interface ApifyPublishResult {
  ok: boolean;
  runId: string | null;
  postUrl: string | null;
  postId: number | null;
  skipped: boolean;
  error: string | null;
}

interface ApifyDatasetItem {
  ok?: boolean;
  skipped?: boolean;
  postUrl?: string;
  postId?: number;
  error?: string;
}

export const publishToSiteB = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => articleInput.parse(data))
  .handler(async ({ data, context }): Promise<ApifyPublishResult> => {
    const token = process.env.APIFY_API_TOKEN;
    const actorId = process.env.APIFY_ACTOR_ID;
    if (!token) throw new Error("APIFY_API_TOKEN manquant");
    if (!actorId) throw new Error("APIFY_ACTOR_ID manquant (déployez l'Actor puis ajoutez le secret)");

    // Charge les creds Site B depuis la connexion de l'utilisateur (fallback env)
    const dest = await loadDestAuthFromDb(context.supabase, context.userId);
    const siteUrl = dest?.siteUrl ?? process.env.SITE_B_URL;
    const username = dest?.username ?? process.env.SITE_B_USERNAME;
    const password = dest?.password ?? process.env.SITE_B_PASSWORD;
    const loginPath = dest?.loginPath ?? process.env.SITE_B_LOGIN_PATH ?? "/wp-admin";
    if (!siteUrl || !username || !password) {
      throw new Error("Connexion Site B introuvable (configurez-la dans Connexions)");
    }

    const input = {
      mode: "publish",
      siteUrl,
      username,
      password,
      loginPath,
      cptSlug: process.env.SITE_B_CPT_SLUG ?? "actualite",
      duplicateStrategy: data.duplicateStrategy,
      article: {
        title: data.title,
        slug: data.slug,
        content: data.content,
        excerpt: data.excerpt,
        tagSlug: data.tagSlug,
        date: data.date,
        featuredImageUrl: data.featuredImageUrl,
      },
    };

    const { data: pubRow } = await context.supabase
      .from("site_b_publications")
      .insert({
        user_id: context.userId,
        source_post_id: data.sourcePostId ?? null,
        source_slug: data.slug,
        status: "running",
        input: input as never,
      })
      .select("id")
      .single();

    const pubId = (pubRow as { id: string } | null)?.id ?? null;

    const actorPath = encodeURIComponent(actorId);
    const url = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?token=${token}&timeout=300`;

    let runId: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      runId = res.headers.get("x-apify-run-id");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Apify ${res.status}: ${text.slice(0, 500)}`);
      }
      const items = (await res.json()) as ApifyDatasetItem[];
      const item = items[0] ?? {};
      const result: ApifyPublishResult = {
        ok: item.ok === true || item.skipped === true,
        runId,
        postUrl: item.postUrl ?? null,
        postId: item.postId ?? null,
        skipped: item.skipped === true,
        error: item.error ?? null,
      };

      if (pubId) {
        await context.supabase
          .from("site_b_publications")
          .update({
            apify_run_id: runId,
            status: result.skipped ? "skipped" : result.ok ? "succeeded" : "failed",
            post_url: result.postUrl,
            post_id: result.postId,
            error: result.error,
            output: items as never,
          })
          .eq("id", pubId);
      }
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (pubId) {
        await context.supabase
          .from("site_b_publications")
          .update({ apify_run_id: runId, status: "failed", error: message })
          .eq("id", pubId);
      }
      return { ok: false, runId, postUrl: null, postId: null, skipped: false, error: message };
    }
  });

export const getApifyActorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actorId = process.env.APIFY_ACTOR_ID;
    const token = process.env.APIFY_API_TOKEN;
    if (!actorId) {
      return { ready: false, actorId: null, message: "Actor Apify non configuré : ajoutez le secret APIFY_ACTOR_ID après avoir fait apify push." };
    }
    if (!token) {
      return { ready: false, actorId, message: "Token Apify manquant (APIFY_API_TOKEN)." };
    }
    const dest = await loadDestAuthFromDb(context.supabase, context.userId);
    if (!dest) {
      return { ready: false, actorId, message: "Connexion Site B non configurée (Connexions → Site B)." };
    }
    return { ready: true, actorId, message: "Prêt à publier." };
  });

export const listSiteBPublications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("site_b_publications")
      .select("id,source_slug,status,post_url,post_id,error,apify_run_id,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      source_slug: string | null;
      status: string;
      post_url: string | null;
      post_id: number | null;
      error: string | null;
      apify_run_id: string | null;
      created_at: string;
    }>;
  });
