import { Actor } from "apify";
import { chromium } from "playwright";
import type {
  ActorInput,
  ActorOutput,
  ActorLoginCheckOutput,
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
page.setDefaultTimeout(30_000);
page.setDefaultNavigationTimeout(60_000);

let output: ActorOutput = { ok: false, error: "unknown" } as ActorOutput;
let stage = "initialisation";
try {
  stage = "connexion au back-office WordPress";
  await login(page, cfg.siteUrl, loginPath, cfg.username, cfg.password);

  if (mode === "login-check") {
    const out: ActorLoginCheckOutput = {
      ok: true,
      loginOk: true,
      dashboardReachable: true,
    };
    output = out;
  } else {
    if (!cfg.article) throw new Error("Champ 'article' manquant pour mode publish");
    stage = `recherche d'un doublon pour le slug ${cfg.article.slug}`;
    const existing = await findBySlug(page, cfg.siteUrl, cptSlug, cfg.article.slug);

    if (existing && dupStrategy === "skip") {
      output = { ok: true, skipped: true, postId: existing.postId };
    } else {
      let articleToPost = cfg.article;
      if (existing && dupStrategy === "copy") {
        articleToPost = { ...cfg.article, slug: `${cfg.article.slug}-copie` };
      }
      const targetId = existing && dupStrategy === "overwrite" ? existing.postId : null;
      // NOTE: l'auteur du post n'est jamais modifié — Site B garde son auteur par défaut.
      stage = targetId ? `mise à jour de l'actualité ${targetId}` : "création de l'actualité";
      const created = await createOrUpdatePost(page, cfg.siteUrl, cptSlug, articleToPost, targetId);
      output = { ok: true, skipped: false, postId: created.postId, postUrl: created.postUrl };
    }
  }
} catch (err) {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const message = `Étape "${stage}" échouée: ${rawMessage}`;
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
  } else {
    output = { ok: false, error: message };
  }
} finally {
  await context.close().catch(() => null);
  await browser.close().catch(() => null);
}

await Actor.pushData(output);
await Actor.exit();
