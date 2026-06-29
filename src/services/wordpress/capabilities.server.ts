import type { Capabilities } from "@/schemas/wordpress";
import { wpRequest, type WpAuth, WpHttpError } from "./client.server";

interface RootInfo { name?: string; description?: string; url?: string; }
interface MeInfo {
  id: number;
  name: string;
  slug?: string;
  capabilities?: Record<string, boolean>;
}

async function safeHead(
  auth: WpAuth,
  path: string,
): Promise<number | null> {
  try {
    const r = await wpRequest<unknown>(auth, path, {
      method: "GET",
      query: { per_page: 1, _fields: "id" },
      retries: 1,
    });
    const total = Number(r.headers.get("x-wp-total") ?? "");
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

export async function probeCapabilities(auth: WpAuth): Promise<Capabilities> {
  const errors: string[] = [];
  let reachable = false;
  let wpVersion: string | null = null;
  let user: Capabilities["user"] = null;
  let canEditPosts = false;
  let canPublishPosts = false;
  let canManageCategories = false;
  let canUploadFiles = false;

  try {
    const root = await wpRequest<RootInfo & { gmt_offset?: number }>(
      auth,
      "/wp-json/",
      { retries: 1 },
    );
    reachable = true;
    // WordPress doesn't expose version on /wp-json root for non-admin.
    // Try /wp-json/wp/v2/ → no version; try /?rest_route=/ headers; fallback unknown.
    wpVersion = (root.headers.get("x-powered-by") ?? null) || null;
  } catch (e) {
    errors.push(
      `API injoignable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    const me = await wpRequest<MeInfo>(auth, "/wp-json/wp/v2/users/me", {
      query: { context: "edit" },
      retries: 1,
    });
    user = { id: me.data.id, name: me.data.name, slug: me.data.slug };
    const caps = me.data.capabilities ?? {};
    canEditPosts = Boolean(caps.edit_posts);
    canPublishPosts = Boolean(caps.publish_posts);
    canManageCategories = Boolean(
      caps.manage_categories || caps.edit_categories,
    );
    canUploadFiles = Boolean(caps.upload_files);
  } catch (e) {
    const status = e instanceof WpHttpError ? e.status : 0;
    errors.push(
      status === 401
        ? "Authentification refusée (vérifiez le mot de passe d'application)"
        : `Lecture utilisateur impossible: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const [totalPosts, totalCategories, totalTags, totalMedia] = await Promise.all([
    safeHead(auth, "/wp-json/wp/v2/posts"),
    safeHead(auth, "/wp-json/wp/v2/categories"),
    safeHead(auth, "/wp-json/wp/v2/tags"),
    safeHead(auth, "/wp-json/wp/v2/media"),
  ]);

  return {
    reachable,
    wpVersion,
    user,
    totalPosts,
    totalCategories,
    totalTags,
    totalMedia,
    canEditPosts,
    canPublishPosts,
    canManageCategories,
    canUploadFiles,
    errors,
  };
}
