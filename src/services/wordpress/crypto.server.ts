// Server-only AES-GCM encryption for WordPress application passwords.
// The key never leaves the server; values are stored as
// `${ivBase64}:${cipherBase64}` so they're self-contained per row.

const ALG = "AES-GCM";

function getKeyMaterial(): Uint8Array {
  const raw = process.env.WP_CREDENTIALS_KEY;
  if (!raw) throw new Error("WP_CREDENTIALS_KEY missing");
  // Derive a 32-byte key by SHA-256 over the secret string.
  const bytes = new TextEncoder().encode(raw);
  return bytes;
}

async function importKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", getKeyMaterial() as BufferSource);
  return crypto.subtle.importKey("raw", digest, ALG, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function encryptSecret(plain: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: ALG, iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `${toBase64(iv)}:${toBase64(cipher)}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [ivB64, cipherB64] = payload.split(":");
  if (!ivB64 || !cipherB64) throw new Error("Invalid encrypted payload");
  const key = await importKey();
  const plain = await crypto.subtle.decrypt(
    { name: ALG, iv: fromBase64(ivB64) as BufferSource },
    key,
    fromBase64(cipherB64) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}
