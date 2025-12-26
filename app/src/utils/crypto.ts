const encoder = new TextEncoder();
const decoder = new TextDecoder();

function xorBytes(data: Uint8Array, key: Uint8Array): Uint8Array {
  const output = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    output[i] = data[i] ^ key[i % key.length];
  }
  return output;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encryptWithKey(key: string, message: string): string {
  if (!key) {
    throw new Error("Missing key");
  }
  const keyBytes = encoder.encode(key);
  const dataBytes = encoder.encode(message);
  const encrypted = xorBytes(dataBytes, keyBytes);
  return toBase64(encrypted);
}

export function decryptWithKey(key: string, ciphertext: string): string {
  if (!key) {
    throw new Error("Missing key");
  }
  const keyBytes = encoder.encode(key);
  const encryptedBytes = fromBase64(ciphertext);
  const decrypted = xorBytes(encryptedBytes, keyBytes);
  return decoder.decode(decrypted);
}
