import type { Page } from "playwright";

export interface ExistingPost {
  editUrl: string;
  postId: number;
}

export async function findBySlug(
  page: Page,
  siteUrl: string,
  cptSlug: string,
  slug: string,
): Promise<ExistingPost | null> {
  const base = siteUrl.replace(/\/+$/, "");
  const url = `${base}/wp-admin/edit.php?post_type=${encodeURIComponent(cptSlug)}&s=${encodeURIComponent(slug)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const link = page.locator(`a.row-title`).first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute("href");
  if (!href) return null;
  const m = href.match(/post=(\d+)/);
  if (!m) return null;
  return { editUrl: href, postId: Number(m[1]) };
}
