import type { Page } from "playwright-core";

export async function login(
  page: Page,
  siteUrl: string,
  loginPath: string,
  username: string,
  password: string,
): Promise<void> {
  const base = siteUrl.replace(/\/+$/, "");
  await page.goto(`${base}${loginPath}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#user_login, #wpadminbar", { timeout: 30_000 });
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
  await page.waitForSelector("#wpadminbar", { timeout: 30_000 });
}
