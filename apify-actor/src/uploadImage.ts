import type { Page } from "playwright";

/**
 * Uploads an image from a URL as the featured image of the currently open post.
 * Works against the Classic Editor "Set featured image" panel.
 * For Gutenberg, the panel is similar but opened via the document sidebar.
 */
export async function setFeaturedImageFromUrl(page: Page, imageUrl: string): Promise<void> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Téléchargement image échoué: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = imageUrl.split("/").pop()?.split("?")[0] ?? `image-${Date.now()}.jpg`;

  // Open featured image modal (Classic)
  await page.click("#set-post-thumbnail", { timeout: 10_000 }).catch(async () => {
    // Gutenberg path
    await page.getByRole("button", { name: /image (mise en avant|à la une)/i }).click();
    await page.getByRole("button", { name: /définir|définir l'image/i }).click();
  });

  // Switch to "Upload files" tab
  await page.getByRole("tab", { name: /téléverser|upload/i }).click().catch(() => null);

  // Set file via hidden input
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({ name: filename, mimeType: "image/jpeg", buffer });

  // Wait for upload to finish and select first item
  await page.waitForSelector(".attachment.selected, .attachments li.selected", { timeout: 60_000 });

  // Confirm
  await page.getByRole("button", { name: /définir l'image|set featured image/i }).click();
}
