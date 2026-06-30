import type { ApifyCapabilities, WpPost } from "@/schemas/wordpress";

interface DestAuth {
  siteUrl: string;
  username: string;
  password: string;
  loginPath: string;
}

interface ApifyRunOptions {
  mode: "publish" | "login-check" | "list-posts";
  timeoutSec?: number;
}

async function callApifySync<T>(
  input: Record<string, unknown>,
  opts: ApifyRunOptions,
): Promise<{ items: T[]; runId: string | null }> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");
  if (!actorId)
    throw new Error("APIFY_ACTOR_ID manquant (déployez l'Actor puis ajoutez le secret)");
  const actorPath = encodeURIComponent(actorId);
  const timeout = opts.timeoutSec ?? 180;
  const url = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?token=${token}&timeout=${timeout}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, mode: opts.mode }),
  });
  const runId = res.headers.get("x-apify-run-id");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify ${res.status}: ${text.slice(0, 400)}`);
  }
  const items = (await res.json()) as T[];
  return { items, runId };
}

export async function runApifyLoginCheck(
  auth: DestAuth,
): Promise<ApifyCapabilities> {
  try {
    const { items, runId } = await callApifySync<{
      ok?: boolean;
      loginOk?: boolean;
      dashboardReachable?: boolean;
      error?: string;
    }>(
      {
        siteUrl: auth.siteUrl,
        username: auth.username,
        password: auth.password,
        loginPath: auth.loginPath,
      },
      { mode: "login-check", timeoutSec: 120 },
    );
    const item = items[0] ?? {};
    return {
      kind: "apify",
      loginOk: item.loginOk === true || item.ok === true,
      dashboardReachable: item.dashboardReachable === true,
      loginPath: auth.loginPath,
      runId,
      errors: item.error ? [item.error] : [],
    };
  } catch (e) {
    return {
      kind: "apify",
      loginOk: false,
      dashboardReachable: false,
      loginPath: auth.loginPath,
      runId: null,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }
}

interface ListItem {
  slug?: string;
  title?: string;
  date?: string;
  status?: string;
  postId?: number;
  link?: string;
}

export async function runApifyListPosts(
  auth: DestAuth,
): Promise<{ ok: true; posts: WpPost[] } | { ok: false; posts: WpPost[]; error: string }> {
  try {
    const { items } = await callApifySync<
      | { posts?: ListItem[] }
      | ListItem
    >(
      {
        siteUrl: auth.siteUrl,
        username: auth.username,
        password: auth.password,
        loginPath: auth.loginPath,
      },
      { mode: "list-posts", timeoutSec: 240 },
    );
    // Le mode list-posts peut renvoyer soit [{posts:[...]}], soit la liste à plat.
    const flat: ListItem[] = [];
    for (const entry of items) {
      if (entry && typeof entry === "object" && "posts" in entry && Array.isArray(entry.posts)) {
        flat.push(...(entry.posts as ListItem[]));
      } else if (entry && typeof entry === "object" && "slug" in entry) {
        flat.push(entry as ListItem);
      }
    }
    const posts: WpPost[] = flat
      .filter((p) => p.slug)
      .map((p, i) => ({
        id: p.postId ?? -(i + 1),
        slug: p.slug as string,
        title: { rendered: p.title ?? (p.slug as string) },
        content: { rendered: "" },
        excerpt: { rendered: "" },
        date: p.date ?? new Date().toISOString(),
        modified: p.date,
        status: p.status ?? "publish",
        author: 0,
        categories: [],
        tags: [],
        featured_media: 0,
        link: p.link ?? "",
      }));
    return { ok: true, posts };
  } catch (e) {
    return {
      ok: false,
      posts: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function loadDestAuthFromDb(
  supabase: unknown,
  userId: string,
): Promise<DestAuth | null> {
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };
  const { data } = await sb
    .from("wp_connections")
    .select("site_url,username,app_password_encrypted,last_capabilities")
    .eq("user_id", userId)
    .eq("role", "destination")
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    site_url: string;
    username: string;
    app_password_encrypted: string;
    last_capabilities: { loginPath?: string } | null;
  };
  const { decryptSecret } = await import("@/services/wordpress/crypto.server");
  return {
    siteUrl: row.site_url,
    username: row.username,
    password: await decryptSecret(row.app_password_encrypted),
    loginPath: row.last_capabilities?.loginPath ?? "/wp-admin",
  };
}
