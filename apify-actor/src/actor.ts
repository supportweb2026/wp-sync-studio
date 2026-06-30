import { Actor } from "apify";
import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type {
  ActorInput,
  ActorMode,
  ActorOutput,
  ActorLoginCheckOutput,
} from "./types.js";
import { login } from "./login.js";
import { findBySlug } from "./findBySlug.js";
import { createOrUpdatePost } from "./createPost.js";

export async function runActor(): Promise<void> {
  let actorInitialized = false;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let output: ActorOutput = { ok: false, error: "unknown" } as ActorOutput;
  let stage = "initialisation";
  let mode: ActorMode = "publish";

  try {
    console.log("[actor] Initialisation Apify");
    await Actor.init();
    actorInitialized = true;

    stage = "lecture de l'input Apify";
    const input = (await Actor.getInput<ActorInput>()) ?? null;
    if (!input) throw new Error("Input manquant");

    const cfg = input;
    mode = cfg.mode ?? "publish";
    const loginPath = cfg.loginPath ?? "";
    let cptSlug = cfg.cptSlug ?? "actualite";
    const dupStrategy = cfg.duplicateStrategy ?? "skip";
    console.log(`[actor] Input chargé: mode=${mode}, site=${cfg.siteUrl}, cpt=${cptSlug}`);

    stage = "lancement du navigateur Playwright";
    const chromeExecutablePath = process.env.APIFY_CHROME_EXECUTABLE_PATH ?? "/usr/bin/google-chrome";
    console.log(`[actor] Chemin Chrome utilisé: ${chromeExecutablePath}`);
    if (!existsSync(chromeExecutablePath)) {
      throw new Error(`Chrome introuvable à ${chromeExecutablePath}`);
    }
    browser = await chromium.launch({
      executablePath: chromeExecutablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    console.log("[actor] Navigateur Playwright lancé");

    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      viewport: { width: 1366, height: 900 },
    });
    page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    stage = "connexion au back-office WordPress";
    await login(page, cfg.siteUrl, loginPath, cfg.username, cfg.password);
    cptSlug = await resolveActualitesPostType(page, cptSlug);

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
      if (page && actorInitialized) {
        const buf = await page.screenshot({ fullPage: true });
        await Actor.setValue("error-screenshot.png", buf, { contentType: "image/png" });
        const html = await page.content();
        await Actor.setValue("error-page.html", html, { contentType: "text/html" });
      }
    } catch {
      /* ignore */
    }
    if (mode === "login-check") {
      output = { ok: false, loginOk: false, dashboardReachable: false, error: message };
    } else {
      output = { ok: false, error: message };
    }
  } finally {
    await context?.close().catch(() => null);
    await browser?.close().catch(() => null);
  }

  if (actorInitialized) {
    await Actor.pushData(output);
    console.log("[actor] Résultat écrit dans le dataset", output.ok ? "ok" : "failed");
    await Actor.exit();
  }
}

async function resolveActualitesPostType(page: Page, requested: string): Promise<string> {
  const links = await page.locator("#adminmenu a[href*='post_type='], a[href*='post-new.php']").evaluateAll((anchors) =>
    anchors.map((a) => ({
      text: (a.textContent ?? "").trim().toLowerCase(),
      href: (a as HTMLAnchorElement).href,
    })),
  ).catch(() => [] as Array<{ text: string; href: string }>);

  const slugs = links
    .map((link) => {
      const url = new URL(link.href);
      return { text: link.text, slug: url.searchParams.get("post_type") };
    })
    .filter((item): item is { text: string; slug: string } => Boolean(item.slug));

  if (slugs.some((item) => item.slug === requested)) return requested;
  const actualites = slugs.find((item) => /actualit|news/i.test(`${item.text} ${item.slug}`));
  if (actualites) {
    console.log(`[actor] Type de contenu Site B détecté: ${actualites.slug} (au lieu de ${requested})`);
    return actualites.slug;
  }
  return requested;
}