import type { Page } from "playwright-core";

/**
 * Télécharge une image depuis son URL publique (Site A) puis l'uploade
 * dans la bibliothèque média de Site B via le back-office WordPress,
 * et la définit comme image à la une de l'article actuellement ouvert.
 *
 * Couvre les éditeurs Gutenberg et Classique.
 */
export async function setFeaturedImageFromUrl(page: Page, imageUrl: string): Promise<void> {
  // 1. Download from Site A
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 WordPress migration image transfer" },
  });
  if (!res.ok) throw new Error(`Téléchargement image échoué: ${res.status} ${imageUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const rawName = imageUrl.split("/").pop()?.split("?")[0] ?? `image-${Date.now()}.${ext}`;
  const filename = /\.[a-z0-9]{3,4}$/i.test(rawName) ? rawName : `${rawName}.${ext}`;

  // 2. Ouvre le panneau "Image à la une"
  const classicTrigger = page.locator("#set-post-thumbnail");
  const isClassic = (await classicTrigger.count()) > 0;

  if (isClassic) {
    await classicTrigger.click({ timeout: 10_000 });
  } else {
    // Gutenberg : ouvrir le panneau document si replié
    await page
      .getByRole("button", { name: /réglages|settings/i })
      .first()
      .click({ timeout: 2_000 })
      .catch(() => null);
    await page
      .getByRole("button", { name: /article|post/i })
      .first()
      .click({ timeout: 2_000 })
      .catch(() => null);

    const featuredPanel = page.getByRole("button", { name: /image (mise en avant|à la une)|featured image/i }).first();
    await featuredPanel.click({ timeout: 5_000 }).catch(() => null);

    const setButton = page
      .getByRole("button", { name: /définir l['’]?image (mise en avant|à la une)|set featured image/i })
      .first();
    if ((await setButton.count()) > 0) {
      await setButton.click({ timeout: 10_000 });
    } else {
      await page.locator(".editor-post-featured-image__toggle, .components-button.editor-post-featured-image__toggle").first().click({ timeout: 10_000 });
    }
  }

  // 3. Onglet "Téléverser des fichiers"
  await page
    .getByRole("tab", { name: /téléverser|upload/i })
    .first()
    .click({ timeout: 10_000 })
    .catch(() => null);

  // 4. Injecte le fichier
  const input = page.locator('input[type="file"]').first();
  await input.waitFor({ state: "attached", timeout: 30_000 });
  await input.setInputFiles({ name: filename, mimeType: contentType, buffer });

  // 5. Attend la fin de l'upload (item sélectionné dans la modale média)
  await page.waitForSelector(".upload-error, .attachment.selected, .attachments li.selected, .media-frame .selected", {
    timeout: 90_000,
  });
  if ((await page.locator(".upload-error").count()) > 0) {
    const error = (await page.locator(".upload-error").first().innerText()).trim();
    throw new Error(error || "Upload image refusé par WordPress");
  }

  // 6. Confirme la sélection
  await page
    .getByRole("button", { name: /définir l['’]?image|set featured image|use as featured image/i })
    .first()
    .click({ timeout: 10_000 });
}
