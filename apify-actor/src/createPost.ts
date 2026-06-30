// IMPORTANT : ce fichier ne doit JAMAIS modifier l'auteur du post côté Site B.
// Aucune interaction avec le panneau "Auteur" / boîte "Author" ne doit être
// ajoutée. Site B conserve son auteur par défaut.
//
// Site B utilise l'éditeur Classique (TinyMCE) + ACF (champ Date + champ Image)
// + Étiquettes en cases à cocher. Pas de Gutenberg.

import type { Page, Frame } from "playwright-core";
import type { ActorArticle } from "./types.js";
import { setAcfImageFromUrl, setFeaturedImageFromUrl } from "./uploadImage.js";

export interface CreatedPost {
  postId: number;
  postUrl: string;
}

export async function createOrUpdatePost(
  page: Page,
  adminBaseUrl: string,
  cptSlug: string,
  article: ActorArticle,
  existingPostId: number | null,
): Promise<CreatedPost> {
  const base = adminBaseUrl.replace(/\/+$/, "");

  if (existingPostId) {
    const target = `${base}/wp-admin/post.php?post=${existingPostId}&action=edit`;
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } else {
    await openNewPostForm(page, base, cptSlug);
  }

  // Attendre le formulaire d'édition (Classique).
  try {
    await page.waitForSelector(
      "form#post, input[name='post_title'], input[placeholder*='titre' i], input[placeholder*='title' i]",
      { timeout: 45_000 },
    );
    console.log(`[actor] Formulaire actualité détecté (url=${page.url()})`);
  } catch (err) {
    await dumpPageDiagnostics(page);
    throw err;
  }

  await fillTitle(page, article.title);
  await fillContent(page, article.content);
  await fillSlug(page, article.slug);
  if (article.excerpt) await page.fill("#excerpt", article.excerpt).catch(() => null);

  // Champs ACF
  if (article.date) await fillAcfDate(page, article.date);

  let imageWarning: string | null = null;
  if (article.featuredImageUrl) {
    const acfHandled = await setAcfImageFromUrl(page, article.featuredImageUrl).catch((e: unknown) => {
      console.warn("[actor] ACF image échoué, tentative image à la une standard:", e instanceof Error ? e.message : e);
      return false;
    });
    if (!acfHandled) {
      await setFeaturedImageFromUrl(page, article.featuredImageUrl).catch((e: unknown) => {
        imageWarning = e instanceof Error ? e.message : String(e);
        console.warn("[actor] Image à la une non définie:", imageWarning);
      });
    }
  }

  if (article.tagSlug) await checkTagBoxes(page, [article.tagSlug]);

  await publishOrUpdate(page, Boolean(existingPostId));

  const url = page.url();
  const m = url.match(/post=(\d+)/);
  const postId = existingPostId ?? (m ? Number(m[1]) : 0);

  let postUrl = "";
  const permalink = page.locator("#sample-permalink a, #sample-permalink").first();
  if ((await permalink.count()) > 0) {
    postUrl = (await permalink.getAttribute("href")) ?? (await permalink.innerText().catch(() => "")) ?? "";
  }

  if (imageWarning) console.warn(`[actor] Article publié, mais image à la une ignorée: ${imageWarning}`);
  return { postId, postUrl };
}

async function fillTitle(page: Page, title: string): Promise<void> {
  const selectors = [
    "input[name='post_title']",
    "#title",
    "input[placeholder*='titre' i]",
    "input[placeholder*='title' i]",
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    try {
      await loc.fill(title, { timeout: 5_000 });
      console.log(`[actor] Titre rempli via fill() sur ${sel}`);
      return;
    } catch {
      await loc.evaluate((el, value) => {
        const input = el as HTMLInputElement;
        input.value = value as string;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, title);
      console.log(`[actor] Titre rempli via JS (champ masqué) sur ${sel}`);
      return;
    }
  }
  throw new Error("Champ titre introuvable");
}

function stripWpBakeryShortcodes(html: string): string {
  const re = /\[\/?(vc_|wpb_)[^\]]*\]/gi;
  const matches = html.match(re);
  const count = matches ? matches.length : 0;
  const cleaned = html
    .replace(re, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (count > 0) console.log(`[actor] Shortcodes WPBakery supprimés (${count} occurrences)`);
  return cleaned;
}

async function fillContent(page: Page, rawContent: string): Promise<void> {
  const content = stripWpBakeryShortcodes(rawContent);
  // Le contenu Site A est du HTML brut. On bascule sur l'onglet "Code"
  // (mode Texte) et on colle dans textarea#content tel quel, pour que
  // WordPress enregistre le HTML sans le re-encoder via TinyMCE/Visuel.

  // 1) Cliquer l'onglet "Code" (Texte). Plusieurs sélecteurs possibles selon la version WP.
  const codeTabSelectors = [
    "button#content-html",
    "#content-html",
    ".wp-switch-editor.switch-html",
    "button.switch-html",
  ];
  let switched = false;
  for (const sel of codeTabSelectors) {
    const tab = page.locator(sel).first();
    if ((await tab.count()) > 0) {
      await tab.click({ timeout: 5_000 }).catch(() => null);
      switched = true;
      break;
    }
  }
  if (!switched) {
    const byText = page.getByRole("button", { name: /^code$/i }).first();
    if ((await byText.count()) > 0) {
      await byText.click({ timeout: 5_000 }).catch(() => null);
      switched = true;
    }
  }
  if (switched) console.log("[actor] Onglet Code (Texte) activé");
  else console.warn("[actor] Onglet Code introuvable, tentative directe sur textarea#content");

  // 2) Attendre le textarea visible en mode Code, puis coller le HTML.
  const textarea = page.locator("textarea#content, textarea[name='content']").first();
  try {
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill(content, { timeout: 10_000 });
    console.log("[actor] Contenu collé via onglet Code (fill)");
    return;
  } catch {
    if ((await textarea.count()) > 0) {
      await textarea.evaluate((el, value) => {
        const ta = el as HTMLTextAreaElement;
        ta.value = value as string;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.dispatchEvent(new Event("change", { bubbles: true }));
      }, content);
      console.log("[actor] Contenu collé via onglet Code (js)");
      return;
    }
  }

  console.warn("[actor] textarea#content introuvable, contenu non inséré");
  void ({} as Frame);
}

async function fillSlug(page: Page, slug: string): Promise<void> {
  if (!slug) return;
  await page.locator("input[name='post_name']").first().evaluate((el, value) => {
    (el as HTMLInputElement).value = value as string;
  }, slug).catch(() => null);
  if ((await page.locator("#edit-slug-buttons button.edit-slug").count()) > 0) {
    await page.click("#edit-slug-buttons button.edit-slug").catch(() => null);
    await page.fill("#new-post-slug", slug).catch(() => null);
    await page.click("#edit-slug-buttons button.save").catch(() => null);
  }
}

async function fillAcfDate(page: Page, isoDate: string): Promise<void> {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const display = `${dd}/${mm}/${yyyy}`;
  const hidden = `${yyyy}${mm}${dd}`;

  const candidates = [
    page.locator(".acf-field-date-picker").first(),
    page.locator(".acf-field[data-name*='date' i]").first(),
    page.locator(".acf-field").filter({ hasText: /^date$/i }).first(),
  ];
  let field = null as null | (typeof candidates)[number];
  for (const c of candidates) {
    if ((await c.count()) > 0) { field = c; break; }
  }
  if (!field) {
    const generic = page.getByLabel(/^date$/i).first();
    if ((await generic.count()) > 0) {
      await generic.evaluate((el, v) => {
        const i = el as HTMLInputElement;
        i.value = v as string;
        i.dispatchEvent(new Event("input", { bubbles: true }));
        i.dispatchEvent(new Event("change", { bubbles: true }));
      }, display).catch(() => null);
      console.log(`[actor] Date écrite via label générique: ${display}`);
    } else {
      console.warn("[actor] Champ Date ACF introuvable");
    }
    return;
  }

  const visible = field.locator("input.input, input[type='text']").first();
  if ((await visible.count()) > 0) {
    await visible.evaluate((el, v) => {
      const i = el as HTMLInputElement;
      i.value = v as string;
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
    }, display).catch(() => null);
  }
  await field.locator("input.input-alt, input[type='hidden']").first().evaluate((el, val) => {
    const i = el as HTMLInputElement;
    i.value = val as string;
    i.dispatchEvent(new Event("change", { bubbles: true }));
  }, hidden).catch(() => null);
  console.log(`[actor] Date ACF écrite: visible=${display} hidden=${hidden}`);
}

async function checkTagBoxes(page: Page, tags: string[]): Promise<string[]> {
  const ignored: string[] = [];
  for (const tag of tags) {
    const label = page
      .locator(".categorydiv label, .inside label, .tagsdiv label")
      .filter({ hasText: new RegExp(`^\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") })
      .first();
    if ((await label.count()) > 0) {
      await label.locator("input[type='checkbox']").check({ force: true }).catch(() => null);
      console.log(`[actor] Étiquette cochée: ${tag}`);
      continue;
    }
    ignored.push(tag);
    console.warn(`[actor] Étiquette introuvable côté Site B, ignorée: ${tag}`);
  }
  return ignored;
}


async function publishOrUpdate(page: Page, isUpdate: boolean): Promise<void> {
  const button = page.locator("#publish").first();
  await button.click({ timeout: 30_000 });
  await page.waitForSelector(
    "#message.updated, #message.notice-success, a.post-edit-link, #publish[value*='Mettre'], #publish[value*='Update']",
    { timeout: 90_000 },
  );
  void isUpdate;
}

/**
 * Ouvre le formulaire "Ajouter un article" en essayant d'abord l'URL directe,
 * puis en cliquant dans le menu WordPress (Actualités → Ajouter un article)
 * si l'URL directe n'affiche pas le formulaire (Sucuri, redirection, etc.).
 */
async function openNewPostForm(page: Page, base: string, cptSlug: string): Promise<void> {
  const directUrl = `${base}/wp-admin/post-new.php?post_type=${encodeURIComponent(cptSlug)}`;
  console.log("[actor] Ouverture Actualités via le menu WordPress");
  console.log(`[actor] URL Ajouter un article attendue: ${directUrl}`);
  await page.goto(`${base}/wp-admin/`, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const menuItem = page.locator(`#adminmenu a[href*='post_type=${cptSlug}']`).first();
  const byText = page.locator("#adminmenu a").filter({ hasText: /actualit/i }).first();
  if ((await menuItem.count()) > 0) await menuItem.hover().catch(() => null);
  else if ((await byText.count()) > 0) await byText.hover().catch(() => null);

  const addLink = page.locator(`#adminmenu a[href*='post-new.php?post_type=${cptSlug}']`).first();
  if ((await addLink.count()) > 0) {
    console.log("[actor] Clic menu: Actualités → Ajouter un article");
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 60_000 }).catch(() => null),
      addLink.click({ timeout: 10_000 }),
    ]).catch(() => null);
    try {
      await page.waitForSelector("form#post input[name='post_title'], input[placeholder*='titre' i]", { timeout: 12_000 });
      return;
    } catch {
      console.warn("[actor] Le clic menu n'a pas affiché le formulaire, fallback URL directe");
    }
  } else {
    console.warn("[actor] Lien 'Ajouter un article' introuvable dans le menu, fallback URL directe");
  }

  console.log(`[actor] Ouverture directe fallback: ${directUrl}`);
  await page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
}

async function dumpPageDiagnostics(page: Page): Promise<void> {
  try {
    const url = page.url();
    const title = await page.title().catch(() => "");
    const bodyClass = await page.locator("body").first().getAttribute("class").catch(() => "");
    const hasForm = (await page.locator("form#post").count()) > 0;
    const inputs = await page
      .locator("input, textarea")
      .evaluateAll((els) =>
        els.slice(0, 30).map((e) => {
          const el = e as HTMLInputElement;
          return `${el.tagName.toLowerCase()}[name=${el.name || ""}|id=${el.id || ""}|ph=${el.placeholder || ""}]`;
        }),
      )
      .catch(() => [] as string[]);
    const sucuri = /sucuri|access denied|blocked/i.test(
      (await page.content().catch(() => "")).slice(0, 5000),
    );
    console.error(`[actor] Diagnostic page: url=${url}`);
    console.error(`[actor] Diagnostic page: title="${title}" bodyClass="${bodyClass}"`);
    console.error(`[actor] Diagnostic page: form#post=${hasForm} sucuriDetected=${sucuri}`);
    console.error(`[actor] Diagnostic page inputs: ${inputs.join(" | ") || "(aucun)"}`);
  } catch (e) {
    console.error("[actor] Diagnostic échoué:", e instanceof Error ? e.message : e);
  }
}
