// SHA-256 of a text's UTF-8 bytes, as lowercase hex. Node and the page both have globalThis.crypto.
export async function sha256(text) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
