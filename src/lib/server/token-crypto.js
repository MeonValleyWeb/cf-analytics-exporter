// AES-256-GCM encryption for Cloudflare API tokens at rest, using Web Crypto
// so it runs on both the Cloudflare Workers runtime and local Node dev.
// Encrypted values are stored as "v1:" + base64(iv || ciphertext); values
// without the prefix are legacy plaintext rows written before encryption
// existed and are returned as-is until re-saved.

const ENCRYPTED_PREFIX = 'v1:';
const IV_LENGTH = 12;

async function importKey(base64Key) {
  let raw;
  try {
    raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  } catch {
    throw new Error('TOKEN_ENCRYPTION_KEY is not valid base64.');
  }

  if (raw.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be 32 bytes (generate with: openssl rand -base64 32).'
    );
  }

  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function encryptToken(plaintext, base64Key) {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  );

  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);

  return ENCRYPTED_PREFIX + toBase64(combined);
}

export async function decryptToken(stored, base64Key) {
  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    return stored;
  }

  const key = await importKey(base64Key);
  const combined = Uint8Array.from(atob(stored.slice(ENCRYPTED_PREFIX.length)), (c) =>
    c.charCodeAt(0)
  );
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Failed to decrypt stored token. Was TOKEN_ENCRYPTION_KEY changed?');
  }
}
