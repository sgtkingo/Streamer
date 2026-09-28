import { createHash } from "node:crypto";

const CRYPT_ALPHABET =
  "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function md5(...values: Uint8Array[]): Buffer {
  const hash = createHash("md5");
  for (const value of values) hash.update(value);
  return hash.digest();
}

function encodeCrypt64(value: number, length: number): string {
  let current = value;
  let encoded = "";
  for (let index = 0; index < length; index += 1) {
    encoded += CRYPT_ALPHABET[current & 0x3f];
    current >>>= 6;
  }
  return encoded;
}

/** Standard Unix md5-crypt used by Webshare's documented legacy login flow. */
export function md5Crypt(password: string, rawSalt: string): string {
  const salt =
    rawSalt
      .replace(/^\$1\$/u, "")
      .split("$")[0]
      ?.slice(0, 8) ?? "";
  if (!/^[./0-9A-Za-z]{1,8}$/u.test(salt)) {
    throw new Error("Webshare returned an invalid password salt.");
  }

  const passwordBytes = Buffer.from(password, "utf8");
  const saltBytes = Buffer.from(salt, "ascii");
  const magic = Buffer.from("$1$", "ascii");
  const initial = createHash("md5")
    .update(passwordBytes)
    .update(magic)
    .update(saltBytes);
  const alternate = md5(passwordBytes, saltBytes, passwordBytes);

  for (let remaining = passwordBytes.length; remaining > 0; remaining -= 16) {
    initial.update(alternate.subarray(0, Math.min(16, remaining)));
  }
  for (let bits = passwordBytes.length; bits > 0; bits >>>= 1) {
    initial.update(bits & 1 ? Buffer.from([0]) : passwordBytes.subarray(0, 1));
  }

  let digest = initial.digest();
  for (let round = 0; round < 1_000; round += 1) {
    const hash = createHash("md5");
    hash.update(round & 1 ? passwordBytes : digest);
    if (round % 3 !== 0) hash.update(saltBytes);
    if (round % 7 !== 0) hash.update(passwordBytes);
    hash.update(round & 1 ? digest : passwordBytes);
    digest = hash.digest();
  }

  const encoded =
    encodeCrypt64((digest[0]! << 16) | (digest[6]! << 8) | digest[12]!, 4) +
    encodeCrypt64((digest[1]! << 16) | (digest[7]! << 8) | digest[13]!, 4) +
    encodeCrypt64((digest[2]! << 16) | (digest[8]! << 8) | digest[14]!, 4) +
    encodeCrypt64((digest[3]! << 16) | (digest[9]! << 8) | digest[15]!, 4) +
    encodeCrypt64((digest[4]! << 16) | (digest[10]! << 8) | digest[5]!, 4) +
    encodeCrypt64(digest[11]!, 2);
  return `$1$${salt}$${encoded}`;
}
