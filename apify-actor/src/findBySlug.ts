import type { Page } from "playwright-core";

export interface ExistingPost {
  editUrl: string;
  postId: number;
}

export async function findBySlug(
  page: Page,
  adminBaseUrl: string,
  cptSlug: string,
  slug: string,
): Promise<ExistingPost | null> {
  const base = adminBaseUrl.replace(/\/+$/, "");
  const url = `${base}/wp-admin/edit.php?post_type=${encodeURIComponent(cptSlug)}&s=${encodeURIComponent(slug)}`;
  console.log(`[actor] Recherche doublon via: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const link = page.locator(`a.row-title`).first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute("href");
  if (!href) return null;
  const m = href.match(/post=(\d+)/);
  if (!m) return null;
  return { editUrl: href, postId: Number(m[1]) };
}
