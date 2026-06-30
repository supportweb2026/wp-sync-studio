// IMPORTANT : ce fichier ne doit JAMAIS modifier l'auteur du post côté Site B.
// Aucune interaction avec le panneau "Auteur" / boîte "Author" ne doit être
// ajoutée. Site B conserve son auteur par défaut.

import type { Page } from "playwright-core";
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
  await page.waitForSelector("#title, .block-editor, .editor-post-title__input, [name='post_title']", {
    timeout: 60_000,
  });

  const isGutenberg =
    (await page.locator(".block-editor, .editor-styles-wrapper, .edit-post-layout").count()) > 0;

  if (isGutenberg) {
    await fillGutenberg(page, article);
  } else {
    await fillClassic(page, article);
  }

  let imageWarning: string | null = null;
  if (article.featuredImageUrl) {
    await setFeaturedImageFromUrl(page, article.featuredImageUrl).catch((e: unknown) => {
      imageWarning = e instanceof Error ? e.message : String(e);
      console.warn("[actor] Image à la une non définie:", imageWarning);
    });
  }

  await publishOrUpdate(page, isGutenberg, Boolean(existingPostId));

  const url = page.url();
  const m = url.match(/post=(\d+)/);
  const postId = existingPostId ?? (m ? Number(m[1]) : 0);

  // Try to get the permalink
  let postUrl = "";
  const permalink = page.locator("#sample-permalink a, .editor-post-permalink__link").first();
  if ((await permalink.count()) > 0) {
    postUrl = (await permalink.getAttribute("href")) ?? "";
  }

  if (imageWarning) console.warn(`[actor] Article publié, mais image à la une ignorée: ${imageWarning}`);
  return { postId, postUrl };
}

async function fillClassic(page: Page, article: ActorArticle): Promise<void> {
  await page.fill("#title, [name='post_title']", article.title);
  // Switch to Text tab to inject HTML
  await page.click("#content-html").catch(() => null);
  await page.fill("#content", article.content);
  if (article.excerpt) {
    await page.fill("#excerpt", article.excerpt).catch(() => null);
  }
  if (article.slug) {
    await page.locator("input[name='post_name']").first().evaluate((el, value) => {
      (el as HTMLInputElement).value = value as string;
    }, article.slug).catch(() => null);
    await page.click("#edit-slug-buttons button.edit-slug").catch(() => null);
    await page.fill("#new-post-slug", article.slug).catch(() => null);
    await page.click("#edit-slug-buttons button.save").catch(() => null);
  }
  if (article.date) await setClassicDate(page, article.date);
  if (article.tagSlug) {
    await page.fill(".tagsdiv .newtag", article.tagSlug).catch(() => null);
    await page.click(".tagsdiv input.tagadd").catch(() => null);
  }
}

async function fillGutenberg(page: Page, article: ActorArticle): Promise<void> {
  await dismissGutenbergOverlays(page);
  const editedViaWpData = await page.evaluate((payload) => {
    const w = window as typeof window & {
      wp?: {
        data?: { dispatch?: (store: string) => { editPost?: (data: Record<string, unknown>) => void } };
      };
    };
    const editPost = w.wp?.data?.dispatch?.("core/editor")?.editPost;
    if (!editPost) return false;
    editPost({
      title: payload.title,
      content: payload.content,
      excerpt: payload.excerpt || "",
      slug: payload.slug,
      date: payload.date,
    });
    return true;
  }, article).catch(() => false);

  if (!editedViaWpData) {
    const title = page.locator(".editor-post-title__input, [aria-label*='Ajouter un titre'], [aria-label*='Add title']").first();
    await title.fill(article.title);
    await page.keyboard.press("Control+Shift+Alt+M").catch(() => null);
    const codeArea = page.locator("textarea.editor-post-text-editor");
    if ((await codeArea.count()) > 0) {
      await codeArea.fill(article.content);
      await page.keyboard.press("Control+Shift+Alt+M").catch(() => null);
    }
  }
}

async function dismissGutenbergOverlays(page: Page): Promise<void> {
  await page.getByRole("button", { name: /fermer|close/i }).click({ timeout: 2_000 }).catch(() => null);
  await page.getByRole("button", { name: /désactiver le mode plein écran|disable fullscreen/i }).click({ timeout: 2_000 }).catch(() => null);
}

async function publishOrUpdate(page: Page, isGutenberg: boolean, isUpdate: boolean): Promise<void> {
  if (isGutenberg) {
    await dismissGutenbergOverlays(page);
    const primary = page.getByRole("button", {
      name: isUpdate ? /mettre à jour|update/i : /publier|publish/i,
    });
    await primary.first().click({ timeout: 30_000 });
    if (!isUpdate) {
      await page
        .locator(".editor-post-publish-panel button, .components-modal__frame button")
        .filter({ hasText: /publier|publish/i })
        .last()
        .click({ timeout: 15_000 })
        .catch(async () => {
          await page.getByRole("button", { name: /publier|publish/i }).last().click({ timeout: 15_000 });
        });
    }
    await page.waitForSelector(
      ".components-snackbar, .post-publish-panel__postpublish, .editor-post-publish-panel__postpublish, a.post-edit-link",
      { timeout: 90_000 },
    );
    return;
  }

  const button = isUpdate ? page.locator("#publish") : page.locator("#publish");
  await button.click({ timeout: 30_000 });
  await page.waitForSelector("#message.updated, a.post-edit-link, #publish[value*='Mettre'], #publish[value*='Update']", {
    timeout: 90_000,
  });
}

async function setClassicDate(page: Page, isoDate: string): Promise<void> {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return;
  await page.click("a.edit-timestamp").catch(() => null);
  await page.fill("#aa", String(d.getFullYear())).catch(() => null);
  await page.selectOption("#mm", String(d.getMonth() + 1).padStart(2, "0")).catch(() => null);
  await page.fill("#jj", String(d.getDate()).padStart(2, "0")).catch(() => null);
  await page.fill("#hh", String(d.getHours()).padStart(2, "0")).catch(() => null);
  await page.fill("#mn", String(d.getMinutes()).padStart(2, "0")).catch(() => null);
  await page.click(".save-timestamp").catch(() => null);
}
