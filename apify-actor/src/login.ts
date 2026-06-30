import type { Page } from "playwright-core";

function buildLoginUrl(siteUrl: string, loginPath: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const clean = (loginPath ?? "").trim();
  if (!clean || clean === "/") return base;
  return `${base}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

async function detectSucuri(page: Page): Promise<string | null> {
  try {
    const html = await page.content();
    if (/sucuri|cloudproxy|access denied/i.test(html) && !/user_login|wpadminbar/i.test(html)) {
      return "Sucuri (WAF) bloque l'accès au back-office. Autorisez l'IP de l'Actor Apify ou vérifiez l'URL de connexion.";
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function login(
  page: Page,
  siteUrl: string,
  loginPath: string,
  username: string,
  password: string,
): Promise<void> {
  const target = buildLoginUrl(siteUrl, loginPath);
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });

  try {
    await page.waitForSelector("#user_login, #user_pass, form#loginform, #wpadminbar", { timeout: 60_000 });
  } catch (err) {
    const sucuri = await detectSucuri(page);
    if (sucuri) throw new Error(sucuri);
    throw new Error(
      `Formulaire de connexion WordPress introuvable sur ${target}. ` +
        `Vérifiez le champ "Chemin de connexion" dans Connexions (laissez vide si le login est directement sur l'URL du site, ou essayez /wp-login.php). ` +
        `Détail: ${(err as Error).message}`,
    );
  }

  if ((await page.locator("#wpadminbar").count()) > 0) return;
  await page.fill("#user_login", username);
  await page.fill("#user_pass", password);
  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: 60_000 }).catch(() => null),
    page.click("#wp-submit"),
  ]);
  if ((await page.locator("#login_error").count()) > 0) {
    const text = (await page.locator("#login_error").innerText()).trim();
    throw new Error(text || "Identifiants WordPress refusés");
  }
  await page.waitForSelector("#wpadminbar", { timeout: 60_000 });
}
