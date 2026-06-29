import { wpMediaSchema, type WpMedia } from "@/schemas/wordpress";
import { wpRequest, type WpAuth } from "./client.server";

export async function getMedia(
  auth: WpAuth,
  id: number,
): Promise<WpMedia | null> {
  try {
    const res = await wpRequest<unknown>(auth, `/wp-json/wp/v2/media/${id}`, {
      retries: 1,
    });
    const parsed = wpMediaSchema.safeParse(res.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function uploadMediaFromUrl(
  auth: WpAuth,
  url: string,
  altText: string,
): Promise<WpMedia | null> {
  try {
    const dl = await fetch(url);
    if (!dl.ok) return null;
    const blob = await dl.blob();
    const filename =
      url.split("/").pop()?.split("?")[0] ?? `image-${Date.now()}.jpg`;
    const contentType = dl.headers.get("content-type") ?? "image/jpeg";

    const base = auth.siteUrl.replace(/\/+$/, "");
    const buf = await blob.arrayBuffer();
    const res = await fetch(`${base}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${auth.username}:${auth.appPassword}`)}`,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: buf,
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = wpMediaSchema.safeParse(json);
    if (!parsed.success) return null;
    if (altText) {
      await wpRequest(auth, `/wp-json/wp/v2/media/${parsed.data.id}`, {
        method: "POST",
        body: { alt_text: altText },
      }).catch(() => null);
    }
    return parsed.data;
  } catch {
    return null;
  }
}
