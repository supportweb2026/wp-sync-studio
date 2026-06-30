import { Actor } from "apify";
import { chromium } from "playwright";
import type {
  ActorInput,
  ActorOutput,
  ActorLoginCheckOutput,
  ActorListPostsOutput,
  ListedPost,
} from "./types.js";
import { login } from "./login.js";
import { findBySlug } from "./findBySlug.js";
import { createOrUpdatePost } from "./createPost.js";

await Actor.init();

const input = (await Actor.getInput<ActorInput>()) ?? null;
if (!input) {
  await Actor.pushData({ ok: false, error: "Input manquant" });
  await Actor.exit();
}

const cfg = input as ActorInput;
const mode = cfg.mode ?? "publish";
const loginPath = cfg.loginPath ?? "/wp-admin";
const cptSlug = cfg.cptSlug ?? "actualite";
const dupStrategy = cfg.duplicateStrategy ?? "skip";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();

let output: ActorOutput = { ok: false, error: "unknown" } as ActorOutput;
try {
  await login(page, cfg.siteUrl, loginPath, cfg.username, cfg.password);

  if (mode === "login-check") {
    const out: ActorLoginCheckOutput = {
      ok: true,
      loginOk: true,
      dashboardReachable: true,
    };
    output = out;
  } else if (mode === "list-posts") {
    const posts = await listAllPosts(page, cfg.siteUrl, cptSlug);
    const out: ActorListPostsOutput = { ok: true, posts };
    output = out;
  } else {
    if (!cfg.article) throw new Error("Champ 'article' manquant pour mode publish");
    const existing = await findBySlug(page, cfg.siteUrl, cptSlug, cfg.article.slug);

    if (existing && dupStrategy === "skip") {
      output = { ok: true, skipped: true, postId: existing.postId };
    } else {
      let articleToPost = cfg.article;
      if (existing && dupStrategy === "copy") {
        articleToPost = { ...cfg.article, slug: `${cfg.article.slug}-copie` };
      }
      const targetId = existing && dupStrategy === "overwrite" ? existing.postId : null;
      const created = await createOrUpdatePost(page, cfg.siteUrl, cptSlug, articleToPost, targetId);
      output = { ok: true, skipped: false, postId: created.postId, postUrl: created.postUrl };
    }
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[actor]", message);
  try {
    const buf = await page.screenshot({ fullPage: true });
    await Actor.setValue("error-screenshot.png", buf, { contentType: "image/png" });
    const html = await page.content();
    await Actor.setValue("error-page.html", html, { contentType: "text/html" });
  } catch {
    /* ignore */
  }
  if (mode === "login-check") {
    output = { ok: false, loginOk: false, dashboardReachable: false, error: message };
  } else if (mode === "list-posts") {
    output = { ok: false, posts: [], error: message };
  } else {
    output = { ok: false, error: message };
  }
} finally {
  await context.close().catch(() => null);
  await browser.close().catch(() => null);
}

await Actor.pushData(output);
await Actor.exit();

async function listAllPosts(
  page: import("playwright").Page,
  siteUrl: string,
  cptSlug: string,
): Promise<ListedPost[]> {
  const base = siteUrl.replace(/\/+$/, "");
  const postType = cptSlug === "post" ? "post" : cptSlug;
  const posts: ListedPost[] = [];
  let pageNum = 1;
  // Limite raisonnable pour éviter les runs infinis
  while (pageNum <= 50) {
    const url = `${base}/wp-admin/edit.php?post_type=${encodeURIComponent(postType)}&paged=${pageNum}&posts_per_page=100`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const rows = await page
      .locator("table.wp-list-table tbody tr")
      .evaluateAll((trs) =>
        trs
          .map((tr) => {
            const idAttr = tr.getAttribute("id") ?? "";
            const idMatch = idAttr.match(/post-(\d+)/);
            const titleEl = tr.querySelector(".row-title");
            const dateEl = tr.querySelector(".date.column-date");
            const stateEl = tr.querySelector(".post-state");
            const viewLink = tr.querySelector('span.view a') as HTMLAnchorElement | null;
            const editLink = tr.querySelector('.row-title') as HTMLAnchorElement | null;
            const href = editLink?.href ?? "";
            const slugMatch = href.match(/post=(\d+)/);
            return {
              postId: idMatch ? Number(idMatch[1]) : (slugMatch ? Number(slugMatch[1]) : 0),
              title: titleEl?.textContent?.trim() ?? "",
              date: dateEl?.textContent?.trim() ?? "",
              status: stateEl?.textContent?.trim().replace(/^—\s*/, "") || "publish",
              link: viewLink?.href ?? "",
              slugFromLink: viewLink?.href?.split("/").filter(Boolean).pop() ?? "",
            };
          })
          .filter((r) => r.title.length > 0),
      );
    if (rows.length === 0) break;
    for (const r of rows) {
      posts.push({
        slug: r.slugFromLink || `post-${r.postId}`,
        title: r.title,
        date: r.date,
        status: r.status,
        postId: r.postId,
        link: r.link,
      });
    }
    if (rows.length < 100) break;
    pageNum += 1;
  }
  return posts;
}
