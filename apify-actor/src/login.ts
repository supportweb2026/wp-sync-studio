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

async function isAdminReady(page: Page): Promise<boolean> {
  if (/\/wp-admin\//i.test(page.url())) return true;
  return (
    (await page.locator("#wpadminbar, #adminmenu, body.wp-admin, a[href*='post-new.php']").count().catch(() => 0)) > 0
  );
}

async function dumpLoginDiagnostics(page: Page, target: string): Promise<void> {
  try {
    const title = await page.title().catch(() => "");
    const forms = await page
      .locator("form")
      .evaluateAll((els) =>
        els.slice(0, 10).map((form) => {
          const f = form as HTMLFormElement;
          return `form[id=${f.id || ""}|name=${f.getAttribute("name") || ""}|action=${f.action || ""}]`;
        }),
      )
      .catch(() => [] as string[]);
    const fields = await page
      .locator("input, button, a")
      .evaluateAll((els) =>
        els.slice(0, 40).map((node) => {
          const el = node as HTMLInputElement | HTMLButtonElement | HTMLAnchorElement;
          const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
          return `${el.tagName.toLowerCase()}[type=${(el as HTMLInputElement).type || ""}|name=${(el as HTMLInputElement).name || ""}|id=${el.id || ""}|ph=${(el as HTMLInputElement).placeholder || ""}|text=${text}]`;
        }),
      )
      .catch(() => [] as string[]);
    console.error(`[actor] Diagnostic login: target=${target}`);
    console.error(`[actor] Diagnostic login: url=${page.url()} title="${title}"`);
    console.error(`[actor] Diagnostic login forms: ${forms.join(" | ") || "(aucun)"}`);
    console.error(`[actor] Diagnostic login champs/liens: ${fields.join(" | ") || "(aucun)"}`);
  } catch (e) {
    console.error("[actor] Diagnostic login échoué:", e instanceof Error ? e.message : e);
  }
}

async function fillWordPressOrGenericLogin(page: Page, username: string, password: string): Promise<void> {
  const wpUser = page.locator("#user_login").first();
  const wpPass = page.locator("#user_pass").first();
  if ((await wpUser.count()) > 0 && (await wpPass.count()) > 0) {
    await wpUser.fill(username);
    await wpPass.fill(password);
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 60_000 }).catch(() => null),
      page.locator("#wp-submit, input[type='submit'], button[type='submit']").first().click({ timeout: 15_000 }),
    ]);
    return;
  }

  const passwordInput = page.locator("input[type='password']:visible").first();
  await passwordInput.waitFor({ state: "visible", timeout: 20_000 });

  const userCandidates = [
    "input[name*='user' i]:visible",
    "input[name*='login' i]:visible",
    "input[name*='email' i]:visible",
    "input[type='email']:visible",
    "input[type='text']:visible",
  ];
  let userFilled = false;
  for (const selector of userCandidates) {
    const input = page.locator(selector).first();
    if ((await input.count()) > 0) {
      await input.fill(username);
      userFilled = true;
      break;
    }
  }
  if (!userFilled) throw new Error("Champ utilisateur introuvable sur le formulaire de connexion");

  await passwordInput.fill(password);
  const submit = page
    .locator(
      "button[type='submit']:visible, input[type='submit']:visible, button:visible, input[value*='Connexion' i]:visible, input[value*='Log' i]:visible",
    )
    .filter({ hasText: /connexion|connecter|login|log in|submit/i })
    .first();

  if ((await submit.count()) > 0) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 60_000 }).catch(() => null),
      submit.click({ timeout: 15_000 }),
    ]);
  } else {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 60_000 }).catch(() => null),
      passwordInput.press("Enter"),
    ]);
  }
}

export async function login(
  page: Page,
  siteUrl: string,
  loginPath: string,
  username: string,
  password: string,
): Promise<void> {
  const target = buildLoginUrl(siteUrl, loginPath);
  console.log(`[actor] URL de connexion utilisée: ${target}`);
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);

  try {
    await page.waitForSelector(
      "#user_login, #user_pass, form#loginform, #wpadminbar, #adminmenu, input[type='password']:visible",
      { timeout: 60_000 },
    );
  } catch (err) {
    const sucuri = await detectSucuri(page);
    if (sucuri) throw new Error(sucuri);
    await dumpLoginDiagnostics(page, target);
    throw new Error(
      `Formulaire de connexion WordPress introuvable sur ${target}. ` +
        `Vérifiez le champ "Chemin de connexion" dans Connexions (laissez vide si le login est directement sur l'URL du site, ou essayez /wp-login.php). ` +
        `Détail: ${(err as Error).message}`,
    );
  }

  if (await isAdminReady(page)) return;
  await fillWordPressOrGenericLogin(page, username, password);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);
  if ((await page.locator("#login_error").count()) > 0) {
    const text = (await page.locator("#login_error").innerText()).trim();
    throw new Error(text || "Identifiants WordPress refusés");
  }
  try {
    await page.waitForSelector("#wpadminbar, #adminmenu, body.wp-admin, a[href*='post-new.php']", { timeout: 60_000 });
  } catch (err) {
    const sucuri = await detectSucuri(page);
    if (sucuri) throw new Error(sucuri);
    await dumpLoginDiagnostics(page, target);
    throw new Error(`Connexion soumise mais back-office WordPress non détecté. Détail: ${(err as Error).message}`);
  }
}
