import { wpPostSchema, type WpPost } from "@/schemas/wordpress";
import { wpFetchAll, wpRequest, type WpAuth } from "./client.server";

export async function listAllPosts(auth: WpAuth): Promise<WpPost[]> {
  const raw = await wpFetchAll<unknown>(auth, "/wp-json/wp/v2/posts", {
    status: "publish,draft,pending,future,private",
    context: "edit",
  });
  const out: WpPost[] = [];
  for (const item of raw) {
    const parsed = wpPostSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function createPost(
  auth: WpAuth,
  payload: Record<string, unknown>,
): Promise<WpPost> {
  const res = await wpRequest<unknown>(auth, "/wp-json/wp/v2/posts", {
    method: "POST",
    body: payload,
  });
  return wpPostSchema.parse(res.data);
}

export async function updatePost(
  auth: WpAuth,
  id: number,
  payload: Record<string, unknown>,
): Promise<WpPost> {
  const res = await wpRequest<unknown>(auth, `/wp-json/wp/v2/posts/${id}`, {
    method: "POST",
    body: payload,
  });
  return wpPostSchema.parse(res.data);
}
