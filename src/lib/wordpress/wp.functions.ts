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
      const { runApifyLoginCheck } = await import(
        "@/lib/site-b/apify-internal.server"
      );
      caps = await runApifyLoginCheck({
        siteUrl: data.credentials.siteUrl,
        username: data.credentials.username,
        password: appPassword,
        loginPath: data.credentials.loginPath ?? "",
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

export interface SourceArticleRow {
  id: number;
  slug: string;
  title: string;
  date: string;
  status: string;
  link: string;
  featuredMediaId: number;
  featuredImageUrl: string | null;
}

export const listSourcePosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const src = await loadAuthForRole(context.supabase, context.userId, "source");
    if (!src) {
      return {
        notConfigured: true as const,
        posts: [] as SourceArticleRow[],
        total: 0,
      };
    }
    const { listAllPosts } = await import("@/services/wordpress/posts.server");
    const { getMedia } = await import("@/services/wordpress/media.server");
    const posts: WpPost[] = await listAllPosts({
      siteUrl: src.siteUrl,
      username: src.username,
      appPassword: src.appPassword,
    });

    // Résolution image à la une (en parallèle, sans bloquer la liste)
    const mediaIds = Array.from(
      new Set(posts.map((p) => p.featured_media).filter((id) => id > 0)),
    );
    const mediaMap = new Map<number, string>();
    await Promise.all(
      mediaIds.map(async (id) => {
        const m = await getMedia(
          { siteUrl: src.siteUrl, username: src.username, appPassword: src.appPassword },
          id,
        );
        if (m?.source_url) mediaMap.set(id, m.source_url);
      }),
    );

    const rows: SourceArticleRow[] = posts.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title.rendered,
      date: p.date,
      status: p.status,
      link: p.link,
      featuredMediaId: p.featured_media,
      featuredImageUrl: p.featured_media ? (mediaMap.get(p.featured_media) ?? null) : null,
    }));

    return {
      notConfigured: false as const,
      posts: rows,
      total: rows.length,
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
