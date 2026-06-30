import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId?: string;
  statusMessage?: string;
  exitCode?: number;
}

interface ApifyApiResponse<T> {
  data?: T;
  error?: { type?: string; message?: string };
}

const APIFY_TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

function apifyEndpoint(path: string, token: string, params: Record<string, string | number | boolean> = {}) {
  const url = new URL(`https://api.apify.com/v2/${path}`);
  url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function readApifyResponse<T>(res: Response, fallback: string): Promise<T> {
  const text = await res.text();
  let parsed: ApifyApiResponse<T> | null = null;
  try {
    parsed = text ? (JSON.parse(text) as ApifyApiResponse<T>) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const message = parsed?.error?.message ?? text.slice(0, 500) ?? fallback;
    throw new Error(`Apify ${res.status}: ${message}`);
  }
  const data = parsed?.data;
  if (!data) throw new Error(fallback);
  return data;
}

async function startApifyRun(token: string, actorId: string, input: unknown): Promise<ApifyRun> {
  const actorPath = encodeURIComponent(actorId);
  const res = await fetch(apifyEndpoint(`acts/${actorPath}/runs`, token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const run = await readApifyResponse<ApifyRun>(res, "Réponse Apify invalide au démarrage du run");
  if (!run.id) throw new Error("Apify n'a pas renvoyé d'identifiant de run");
  return run;
}

async function getApifyRun(token: string, runId: string): Promise<ApifyRun> {
  const res = await fetch(apifyEndpoint(`actor-runs/${encodeURIComponent(runId)}`, token));
  return readApifyResponse<ApifyRun>(res, "Réponse Apify invalide pendant le suivi du run");
}

async function getApifyDatasetItems(token: string, datasetId?: string): Promise<ApifyDatasetItem[]> {
  if (!datasetId) return [];
  const res = await fetch(apifyEndpoint(`datasets/${encodeURIComponent(datasetId)}/items`, token, { clean: true }));
  if (!res.ok) return [];
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? (items as ApifyDatasetItem[]) : [];
}

async function getApifyLogTail(token: string, runId: string): Promise<string | null> {
  const res = await fetch(apifyEndpoint(`logs/${encodeURIComponent(runId)}`, token));
  if (!res.ok) return null;
  const text = await res.text();
  const useful = text
    .split("\n")
    .filter((line) => /\[actor\]|error|failed|exception|timeout|wordpress|publish|login/i.test(line))
    .slice(-25)
    .join("\n")
    .trim();
  return useful ? useful.slice(-1800) : text.split("\n").slice(-20).join("\n").trim().slice(-1200);
}

async function waitForApifyRun(token: string, started: ApifyRun): Promise<ApifyRun> {
  let current = started;
  const deadline = Date.now() + 5 * 60_000;
  while (!APIFY_TERMINAL_STATUSES.has(current.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    current = await getApifyRun(token, started.id);
  }
  if (!APIFY_TERMINAL_STATUSES.has(current.status)) {
    throw new Error(`Apify: délai dépassé, le run ${started.id} est encore ${current.status}`);
  }
  return current;
}

async function buildApifyFailureMessage(token: string, run: ApifyRun): Promise<string> {
  const items = await getApifyDatasetItems(token, run.defaultDatasetId);
  const itemError = items.find((item) => item.error)?.error;
  const logTail = await getApifyLogTail(token, run.id);
  const parts = [
    `Run Apify ${run.status}`,
    run.statusMessage,
    itemError,
    logTail ? `Journal Apify:\n${logTail}` : null,
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, 2500);
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
    const { loadDestAuthFromDb } = await import("@/lib/site-b/apify-internal.server");
    const dest = await loadDestAuthFromDb(context.supabase, context.userId);
    const siteUrl = dest?.siteUrl ?? process.env.SITE_B_URL;
    const username = dest?.username ?? process.env.SITE_B_USERNAME;
    const password = dest?.password ?? process.env.SITE_B_PASSWORD;
    const loginPath = dest?.loginPath ?? process.env.SITE_B_LOGIN_PATH ?? "";
    if (!siteUrl || !username || !password) {
      throw new Error("Connexion Site B introuvable (configurez-la dans Connexions)");
    }

    const input = {
      mode: "publish",
      siteUrl,
      username,
      password,
      loginPath,
      cptSlug: process.env.SITE_B_CPT_SLUG ?? "actualites",
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

    const safeStoredInput = { ...input, password: "[secret]" };

    const { data: pubRow } = await context.supabase
      .from("site_b_publications")
      .insert({
        user_id: context.userId,
        source_post_id: data.sourcePostId ?? null,
        source_slug: data.slug,
        status: "running",
        input: safeStoredInput as never,
      })
      .select("id")
      .single();

    const pubId = (pubRow as { id: string } | null)?.id ?? null;

    let runId: string | null = null;
    try {
      const started = await startApifyRun(token, actorId, input);
      runId = started.id;
      if (pubId) {
        await context.supabase
          .from("site_b_publications")
          .update({ apify_run_id: runId })
          .eq("id", pubId);
      }

      const finished = await waitForApifyRun(token, started);
      const items = await getApifyDatasetItems(token, finished.defaultDatasetId);
      if (finished.status !== "SUCCEEDED") {
        throw new Error(await buildApifyFailureMessage(token, finished));
      }
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
            output: { run: finished, items } as never,
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
      return { ready: false, actorId: null, source: "none" as const, message: "Actor Apify non configuré : ajoutez le secret APIFY_ACTOR_ID après avoir fait apify push." };
    }
    if (!token) {
      return { ready: false, actorId, source: "none" as const, message: "Token Apify manquant (APIFY_API_TOKEN)." };
    }
    const { loadDestAuthFromDb } = await import("@/lib/site-b/apify-internal.server");
    const dest = await loadDestAuthFromDb(context.supabase, context.userId);
    if (dest) {
      return { ready: true, actorId, source: "db" as const, message: "Prêt à publier (connexion utilisateur)." };
    }
    const envSiteUrl = process.env.SITE_B_URL;
    const envUser = process.env.SITE_B_USERNAME;
    const envPass = process.env.SITE_B_PASSWORD;
    if (envSiteUrl && envUser && envPass) {
      return { ready: true, actorId, source: "env" as const, message: "Prêt à publier (secrets globaux). Pour le multi-utilisateur, sauvegardez Site B dans Connexions." };
    }
    return { ready: false, actorId, source: "none" as const, message: "Connexion Site B non configurée (Connexions → Site B)." };
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
