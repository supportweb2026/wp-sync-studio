import type { Page } from "playwright";
import type { ActorArticle } from "./types.js";
import { setFeaturedImageFromUrl } from "./uploadImage.js";

export interface CreatedPost {
  postId: number;
  postUrl: string;
}

export async function createOrUpdatePost(
  page: Page,
  siteUrl: string,
  cptSlug: string,
  article: ActorArticle,
  existingPostId: number | null,
): Promise<CreatedPost> {
  const base = siteUrl.replace(/\/+$/, "");
  const target = existingPostId
    ? `${base}/wp-admin/post.php?post=${existingPostId}&action=edit`
    : `${base}/wp-admin/post-new.php?post_type=${encodeURIComponent(cptSlug)}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const isGutenberg = (await page.locator(".block-editor").count()) > 0;

  if (isGutenberg) {
    await fillGutenberg(page, article);
  } else {
    await fillClassic(page, article);
  }

  if (article.featuredImageUrl) {
    await setFeaturedImageFromUrl(page, article.featuredImageUrl).catch((e: unknown) => {
      console.warn("Featured image:", e instanceof Error ? e.message : String(e));
    });
  }

  // Publish / Update
  const publishLabel = existingPostId ? /mettre à jour|update/i : /publier|publish/i;
  await page.getByRole("button", { name: publishLabel }).first().click();

  // Gutenberg often shows a confirmation modal
  if (isGutenberg) {
    await page.getByRole("button", { name: /publier|publish/i }).nth(1).click().catch(() => null);
  }

  await page.waitForSelector("a.post-edit-link, .post-publish-panel__postpublish, #message.updated", {
    timeout: 60_000,
  });

  const url = page.url();
  const m = url.match(/post=(\d+)/);
  const postId = existingPostId ?? (m ? Number(m[1]) : 0);

  // Try to get the permalink
  let postUrl = "";
  const permalink = page.locator("#sample-permalink a, .editor-post-permalink__link").first();
  if ((await permalink.count()) > 0) {
    postUrl = (await permalink.getAttribute("href")) ?? "";
  }

  return { postId, postUrl };
}

async function fillClassic(page: Page, article: ActorArticle): Promise<void> {
  await page.fill("#title", article.title);
  // Switch to Text tab to inject HTML
  await page.click("#content-html").catch(() => null);
  await page.fill("#content", article.content);
  if (article.excerpt) {
    await page.fill("#excerpt", article.excerpt).catch(() => null);
  }
  if (article.slug) {
    await page.click("#edit-slug-buttons button.edit-slug").catch(() => null);
    await page.fill("#new-post-slug", article.slug).catch(() => null);
    await page.click("#edit-slug-buttons button.save").catch(() => null);
  }
  if (article.tagSlug) {
    await page.fill(".tagsdiv .newtag", article.tagSlug).catch(() => null);
    await page.click(".tagsdiv input.tagadd").catch(() => null);
  }
}

async function fillGutenberg(page: Page, article: ActorArticle): Promise<void> {
  const title = page.getByRole("textbox", { name: /ajouter un titre|add title/i });
  await title.fill(article.title);
  // Code editor for raw HTML
  await page.keyboard.press("Control+Shift+Alt+M").catch(() => null);
  const codeArea = page.locator("textarea.editor-post-text-editor");
  if ((await codeArea.count()) > 0) {
    await codeArea.fill(article.content);
    await page.keyboard.press("Control+Shift+Alt+M").catch(() => null);
  }
}
