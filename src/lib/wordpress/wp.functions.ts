import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  capabilitiesSchema,
  credentialsSchema,
  roleSchema,
  type Capabilities,
  type Role,
  type WpPost,
} from "@/schemas/wordpress";

export interface PublicConnection {
  id: string;
  role: Role;
  siteUrl: string;
  username: string;
  lastTestedAt: string | null;
  capabilities: Capabilities | null;
}

async function loadAuthForRole(
  supabase: ReturnType<typeof Object>,
  userId: string,
  role: Role,
): Promise<{ siteUrl: string; username: string; appPassword: string } | null> {
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
    .select("site_url,username,app_password_encrypted")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    site_url: string;
    username: string;
    app_password_encrypted: string;
  };
  const { decryptSecret } = await import(
    "@/services/wordpress/crypto.server"
  );
  return {
    siteUrl: row.site_url,
    username: row.username,
    appPassword: await decryptSecret(row.app_password_encrypted),
  };
}

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wp_connections")
      .select(
        "id,role,site_url,username,last_tested_at,last_capabilities",
      )
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
      const caps = capabilitiesSchema.safeParse(r.last_capabilities);
      return {
        id: r.id,
        role: r.role as Role,
        siteUrl: r.site_url,
        username: r.username,
        lastTestedAt: r.last_tested_at,
        capabilities: caps.success ? caps.data : null,
      };
    });
    return out;
  });

const saveInput = z.object({
  role: roleSchema,
  credentials: credentialsSchema,
});

export const saveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { probeCapabilities } = await import(
      "@/services/wordpress/capabilities.server"
    );
    const { encryptSecret, decryptSecret } = await import(
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
        throw new Error("Mot de passe d'application requis");
      }
      appPassword = existing.appPassword;
    }
    if (appPassword.length < 8) {
      throw new Error("Mot de passe d'application trop court");
    }
    void decryptSecret;
    const caps = await probeCapabilities({
      siteUrl: data.credentials.siteUrl,
      username: data.credentials.username,
      appPassword,
    });
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
    const { probeCapabilities } = await import(
      "@/services/wordpress/capabilities.server"
    );
    const caps = await probeCapabilities(auth);
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
    if (!src || !dst) {
      throw new Error("Configurez les deux connexions");
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
    const [
      sourcePosts,
      destinationPosts,
      sourceUsers,
      sourceCats,
      sourceTags,
    ] = await Promise.all([
      listAllPosts(src),
      listAllPosts(dst),
      listAllUsers(src).catch(() => []),
      listAllTerms(src, "categories").catch(() => []),
      listAllTerms(src, "tags").catch(() => []),
    ]);
    const rows = await buildComparison(sourcePosts, destinationPosts);
    return {
      rows,
      sourceTotal: sourcePosts.length,
      destinationTotal: destinationPosts.length,
      users: sourceUsers,
      categories: sourceCats,
      tags: sourceTags,
    };
  });

const migrateInput = z.object({
  postIds: z.array(z.number()).min(1).max(500),
  options: z.object({
    duplicateStrategy: z.enum(["skip", "overwrite", "copy"]),
    preserveSlug: z.boolean(),
    preserveDate: z.boolean(),
    preserveStatus: z.boolean(),
    preserveExcerpt: z.boolean(),
    migrateFeaturedImage: z.boolean(),
    migrateInlineImages: z.boolean(),
  }),
});

export const runMigrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => migrateInput.parse(data))
  .handler(async ({ data, context }) => {
    const [src, dst] = await Promise.all([
      loadAuthForRole(context.supabase, context.userId, "source"),
      loadAuthForRole(context.supabase, context.userId, "destination"),
    ]);
    if (!src || !dst) throw new Error("Configurez les deux connexions");

    const { listAllPosts } = await import(
      "@/services/wordpress/posts.server"
    );
    const { runMigration } = await import(
      "@/services/migration/pipeline.server"
    );
    const sourcePosts = await listAllPosts(src);
    const toMigrate: WpPost[] = sourcePosts.filter((p) =>
      data.postIds.includes(p.id),
    );

    const startedAt = new Date().toISOString();
    const { report, log } = await runMigration(src, dst, toMigrate, {
      ...data.options,
      postIds: data.postIds,
      scope: "selection",
    });
    const succeeded = report.filter((r) => r.ok).length;
    const failed = report.length - succeeded;

    await context.supabase.from("migration_runs").insert({
      user_id: context.userId,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      total: report.length,
      succeeded,
      failed,
      options: data.options as never,
      report: report as never,
      log: log as never,
    });

    return { report, log, succeeded, failed, total: report.length };
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
