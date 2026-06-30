import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  apifyCapabilitiesSchema,
  capabilitiesSchema,
  destinationCredentialsSchema,
  roleSchema,
  sourceCredentialsSchema,
  type ApifyCapabilities,
  type Capabilities,
  type Role,
  type WpPost,
} from "@/schemas/wordpress";

export interface PublicConnection {
  id: string;
  role: Role;
  siteUrl: string;
  username: string;
  loginPath: string | null;
  lastTestedAt: string | null;
  capabilities: Capabilities | ApifyCapabilities | null;
}

interface LoadedAuth {
  siteUrl: string;
  username: string;
  appPassword: string;
  loginPath: string | null;
}

async function loadAuthForRole(
  supabase: ReturnType<typeof Object>,
  userId: string,
  role: Role,
): Promise<LoadedAuth | null> {
  const sb = supabase as unknown as {
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
  const { data, error } = await sb
    .from("wp_connections")
    .select("site_url,username,app_password_encrypted,last_capabilities")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    site_url: string;
    username: string;
    app_password_encrypted: string;
    last_capabilities: unknown;
  };
  const { decryptSecret } = await import(
    "@/services/wordpress/crypto.server"
  );
  // loginPath éventuellement stocké dans last_capabilities.loginPath
  const caps = row.last_capabilities as { loginPath?: string } | null;
  return {
    siteUrl: row.site_url,
    username: row.username,
    appPassword: await decryptSecret(row.app_password_encrypted),
    loginPath: caps?.loginPath ?? null,
  };
}

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wp_connections")
      .select("id,role,site_url,username,last_tested_at,last_capabilities")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      id: string;
      role: string;
      site_url: string;
      username: string;
      last_tested_at: string | null;
      last_capabilities: unknown;
    }>;
    const out: PublicConnection[] = rows.map((r) => {
      const apify = apifyCapabilitiesSchema.safeParse(r.last_capabilities);
      const rest = capabilitiesSchema.safeParse(r.last_capabilities);
      const caps = apify.success
        ? apify.data
        : rest.success
          ? rest.data
          : null;
      const loginPath =
        apify.success ? apify.data.loginPath : null;
      return {
        id: r.id,
        role: r.role as Role,
        siteUrl: r.site_url,
        username: r.username,
        loginPath,
        lastTestedAt: r.last_tested_at,
        capabilities: caps,
      };
    });
    return out;
  });

const saveSourceInput = z.object({
  role: z.literal("source"),
  credentials: sourceCredentialsSchema,
});
const saveDestinationInput = z.object({
  role: z.literal("destination"),
  credentials: destinationCredentialsSchema,
});
const saveInput = z.discriminatedUnion("role", [
  saveSourceInput,
  saveDestinationInput,
]);

export const saveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { encryptSecret } = await import(
      "@/services/wordpress/crypto.server"
    );
    let appPassword = data.credentials.appPassword;
    if (!appPassword) {
      const existing = await loadAuthForRole(
        context.supabase,
        context.userId,
        data.role,
      );
      if (!existing) {
        throw new Error("Mot de passe requis");
      }
      appPassword = existing.appPassword;
    }
    const minLen = data.role === "source" ? 8 : 1;
    if (appPassword.length < minLen) {
      throw new Error(
        data.role === "source"
          ? "Mot de passe d'application trop court"
          : "Mot de passe administrateur requis",
      );
    }

    let caps: Capabilities | ApifyCapabilities;
    if (data.role === "source") {
      const { probeCapabilities } = await import(
        "@/services/wordpress/capabilities.server"
      );
      caps = await probeCapabilities({
        siteUrl: data.credentials.siteUrl,
        username: data.credentials.username,
        appPassword,
      });
    } else {
      // destination → Apify login-check
      const { runApifyLoginCheck } = await import(
        "@/lib/site-b/apify-internal.server"
      );
      caps = await runApifyLoginCheck({
        siteUrl: data.credentials.siteUrl,
        username: data.credentials.username,
        password: appPassword,
        loginPath: data.credentials.loginPath ?? "/wp-admin",
      });
    }

    const encrypted = await encryptSecret(appPassword);
    const { error } = await context.supabase
      .from("wp_connections")
      .upsert(
        {
          user_id: context.userId,
          role: data.role,
          site_url: data.credentials.siteUrl,
          username: data.credentials.username,
          app_password_encrypted: encrypted,
          last_tested_at: new Date().toISOString(),
          last_capabilities: caps,
        },
        { onConflict: "user_id,role" },
      );
    if (error) throw new Error(error.message);
    return caps;
  });

export const deleteConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ role: roleSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wp_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const testConnectionRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ role: roleSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const auth = await loadAuthForRole(
      context.supabase,
      context.userId,
      data.role,
    );
    if (!auth) throw new Error("Connexion introuvable");
    let caps: Capabilities | ApifyCapabilities;
    if (data.role === "source") {
      const { probeCapabilities } = await import(
        "@/services/wordpress/capabilities.server"
      );
      caps = await probeCapabilities({
        siteUrl: auth.siteUrl,
        username: auth.username,
        appPassword: auth.appPassword,
      });
    } else {
      const { runApifyLoginCheck } = await import(
        "@/lib/site-b/apify-internal.server"
      );
      caps = await runApifyLoginCheck({
        siteUrl: auth.siteUrl,
        username: auth.username,
        password: auth.appPassword,
        loginPath: auth.loginPath ?? "/wp-admin",
      });
    }
    await context.supabase
      .from("wp_connections")
      .update({
        last_tested_at: new Date().toISOString(),
        last_capabilities: caps,
      })
      .eq("user_id", context.userId)
      .eq("role", data.role);
    return caps;
  });

export const fetchComparison = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [src, dst] = await Promise.all([
      loadAuthForRole(context.supabase, context.userId, "source"),
      loadAuthForRole(context.supabase, context.userId, "destination"),
    ]);
    if (!src) {
      return {
        notConfigured: true as const,
        missingSource: true,
        missingDestination: !dst,
        rows: [],
        sourceTotal: 0,
        destinationTotal: 0,
        destinationSource: "none" as const,
        users: [],
        categories: [],
        tags: [],
      };
    }


    const { listAllPosts } = await import(
      "@/services/wordpress/posts.server"
    );
    const { listAllUsers } = await import(
      "@/services/wordpress/users.server"
    );
    const { listAllTerms } = await import(
      "@/services/wordpress/terms.server"
    );
    const { buildComparison } = await import(
      "@/services/comparison/matcher"
    );
    const { runApifyListPosts } = await import(
      "@/lib/site-b/apify-internal.server"
    );

    const destPromise = runApifyListPosts({
      siteUrl: dst.siteUrl,
      username: dst.username,
      password: dst.appPassword,
      loginPath: dst.loginPath ?? "/wp-admin",
    }).catch((e: unknown) => ({
      ok: false as const,
      posts: [] as WpPost[],
      error: e instanceof Error ? e.message : String(e),
    }));

    const [sourcePosts, sourceUsers, sourceCats, sourceTags, destResult] =
      await Promise.all([
        listAllPosts(src),
        listAllUsers(src).catch(() => []),
        listAllTerms(src, "categories").catch(() => []),
        listAllTerms(src, "tags").catch(() => []),
        destPromise,
      ]);

    let destinationPosts: WpPost[] = [];
    let destinationSource: "apify" | "cache" | "none" = "none";
    let destinationError: string | null = null;

    if (destResult.ok && destResult.posts.length > 0) {
      destinationPosts = destResult.posts;
      destinationSource = "apify";
    } else {
      // Fallback : utilise les publications déjà enregistrées dans cette app
      destinationError = destResult.ok ? null : destResult.error;
      const { data: pubs } = await context.supabase
        .from("site_b_publications")
        .select("source_slug,post_id,post_url,created_at,status")
        .eq("user_id", context.userId)
        .eq("status", "succeeded");
      const rows = (pubs ?? []) as Array<{
        source_slug: string | null;
        post_id: number | null;
        post_url: string | null;
        created_at: string;
      }>;
      destinationPosts = rows
        .filter((r) => r.source_slug)
        .map(
          (r): WpPost => ({
            id: r.post_id ?? 0,
            slug: r.source_slug as string,
            title: { rendered: r.source_slug as string },
            content: { rendered: "" },
            excerpt: { rendered: "" },
            date: r.created_at,
            modified: r.created_at,
            status: "publish",
            author: 0,
            categories: [],
            tags: [],
            featured_media: 0,
            link: r.post_url ?? "",
          }),
        );
      destinationSource = destinationPosts.length > 0 ? "cache" : "none";
    }

    const rows = await buildComparison(sourcePosts, destinationPosts);
    return {
      notConfigured: false as const,
      rows,
      sourceTotal: sourcePosts.length,
      destinationTotal: destinationPosts.length,
      destinationSource,
      destinationError,
      users: sourceUsers,
      categories: sourceCats,
      tags: sourceTags,
    };
  });

export const listMigrationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("migration_runs")
      .select("id,started_at,ended_at,total,succeeded,failed")
      .eq("user_id", context.userId)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      started_at: string;
      ended_at: string | null;
      total: number;
      succeeded: number;
      failed: number;
    }>;
  });

export const getMigrationRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("migration_runs")
      .select("*")
      .eq("user_id", context.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
