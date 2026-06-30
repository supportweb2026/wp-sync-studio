import type { Page } from "playwright";

export async function login(
  page: Page,
  siteUrl: string,
  loginPath: string,
  username: string,
  password: string,
): Promise<void> {
  const base = siteUrl.replace(/\/+$/, "");
  await page.goto(`${base}${loginPath}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.fill("#user_login", username);
  await page.fill("#user_pass", password);
  await Promise.all([
    page.waitForURL(/wp-admin/, { timeout: 60_000 }),
    page.click("#wp-submit"),
  ]);
  await page.waitForSelector("#wpadminbar", { timeout: 30_000 });
}
