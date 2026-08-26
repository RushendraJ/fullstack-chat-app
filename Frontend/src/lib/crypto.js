// End-to-end encryption utilities.
//
// Scheme: hybrid RSA-OAEP + AES-GCM, using the browser's native Web Crypto API.
//   - Each user has an RSA-OAEP keypair. The PUBLIC key is uploaded to the
//     server (via user.publicKey) so anyone can encrypt a message FOR them.
//     The PRIVATE key never leaves the browser (kept in localStorage, scoped
//     per userId).
//   - For every message we generate a fresh random AES-GCM key, encrypt the
//     message text with it, then "wrap" (encrypt) that AES key twice — once
//     with the receiver's RSA public key, once with the sender's RSA public
//     key. That's what lets BOTH people decrypt their own conversation
//     history, while the server only ever sees ciphertext.

const RSA_ALGO = { name: "RSA-OAEP", hash: "SHA-256" };
const AES_ALGO = { name: "AES-GCM", length: 256 };

// ---------- base64 helpers ----------

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---------- keypair generation / import / export ----------

export async function generateRsaKeyPair() {
  return crypto.subtle.generateKey(
    { ...RSA_ALGO, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

export async function exportPublicKey(key) {
  const raw = await crypto.subtle.exportKey("spki", key);
  return bufToBase64(raw);
}

export async function exportPrivateKey(key) {
  const raw = await crypto.subtle.exportKey("pkcs8", key);
  return bufToBase64(raw);
}

export async function importPublicKey(base64) {
  return crypto.subtle.importKey("spki", base64ToBuf(base64), RSA_ALGO, true, ["encrypt"]);
}

export async function importPrivateKey(base64) {
  return crypto.subtle.importKey("pkcs8", base64ToBuf(base64), RSA_ALGO, true, ["decrypt"]);
}

// ---------- local private-key storage ----------
// Scoped per userId so multiple accounts can share a browser without
// clobbering each other's keys.

const storageKey = (userId) => `e2ee_private_key_${userId}`;

export function savePrivateKey(userId, base64PrivateKey) {
  localStorage.setItem(storageKey(userId), base64PrivateKey);
}

export function loadPrivateKeyBase64(userId) {
  return localStorage.getItem(storageKey(userId));
}

export function hasPrivateKey(userId) {
  return !!loadPrivateKeyBase64(userId);
}

/**
 * Ensures the current browser has a keypair for this user.
 * - If a private key already exists locally, reuse it (returns null for
 *   publicKeyBase64 since nothing needs to change server-side).
 * - Otherwise generates a fresh keypair, stores the private key locally,
 *   and returns the new public key so the caller can upload it.
 */
export async function ensureKeyPair(userId) {
  const existing = loadPrivateKeyBase64(userId);
  if (existing) {
    return { isNew: false, publicKeyBase64: null };
  }
  const { publicKey, privateKey } = await generateRsaKeyPair();
  const [pubB64, privB64] = await Promise.all([
    exportPublicKey(publicKey),
    exportPrivateKey(privateKey),
  ]);
  savePrivateKey(userId, privB64);
  return { isNew: true, publicKeyBase64: pubB64 };
}

// ---------- message encryption / decryption ----------

/**
 * Encrypts `plaintext` so that BOTH the sender and receiver can later
 * decrypt it, using only their own private key.
 *
 * Returns a JSON string — this is what gets stored in Message.text.
 */
export async function encryptMessage(plaintext, senderPublicKeyBase64, receiverPublicKeyBase64) {
  const aesKey = await crypto.subtle.generateKey(AES_ALGO, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

  const [senderPubKey, receiverPubKey] = await Promise.all([
    importPublicKey(senderPublicKeyBase64),
    importPublicKey(receiverPublicKeyBase64),
  ]);

  const [keyForSender, keyForReceiver] = await Promise.all([
    crypto.subtle.encrypt(RSA_ALGO, senderPubKey, rawAesKey),
    crypto.subtle.encrypt(RSA_ALGO, receiverPubKey, rawAesKey),
  ]);

  return JSON.stringify({
    v: 1, // payload version, in case the scheme changes later
    iv: bufToBase64(iv),
    ciphertext: bufToBase64(ciphertext),
    keyForSender: bufToBase64(keyForSender),
    keyForReceiver: bufToBase64(keyForReceiver),
  });
}

/**
 * Decrypts a message payload produced by encryptMessage().
 *
 * @param payload        the JSON string from Message.text
 * @param myUserId        the logged-in user's id
 * @param senderId        message.senderID
 * @param privateKeyBase64 the caller's own private key (from loadPrivateKeyBase64)
 */
export async function decryptMessage(payload, myUserId, senderId, privateKeyBase64) {
  // Messages sent before this feature existed are plain text, not JSON —
  // fail open and just show them as-is.
  let parsed;
  try {
    parsed = JSON.parse(payload);
    if (!parsed || !parsed.ciphertext) return payload;
  } catch {
    return payload;
  }

  if (!privateKeyBase64) return "🔒 Encrypted message (no key on this device)";

  try {
    const wrappedKey = String(myUserId) === String(senderId)
      ? parsed.keyForSender
      : parsed.keyForReceiver;

    const privateKey = await importPrivateKey(privateKeyBase64);
    const rawAesKey = await crypto.subtle.decrypt(RSA_ALGO, privateKey, base64ToBuf(wrappedKey));
    const aesKey = await crypto.subtle.importKey("raw", rawAesKey, AES_ALGO, false, ["decrypt"]);

    const plaintextBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuf(parsed.iv) },
      aesKey,
      base64ToBuf(parsed.ciphertext)
    );

    return new TextDecoder().decode(plaintextBuf);
  } catch (err) {
    console.error("Failed to decrypt message:", err);
    return "🔒 Unable to decrypt this message";
  }
}

// ---------- safety numbers (key verification) ----------
//
// The server hands out public keys with zero verification, which means a
// compromised or malicious server could swap a user's public key for one it
// controls and silently man-in-the-middle every "encrypted" message. This
// is the same weakness that Signal's "safety numbers" and WhatsApp's
// "verify security code" screens exist to close: two users compare a short
// fingerprint of their combined public keys out-of-band (in person, on a
// call, whatever channel the server doesn't control). If it matches, they
// know there's no one in the middle.

/**
 * Deterministically derives a human-comparable "safety number" from two
 * users' public keys. Order-independent (sorted first) so both sides of a
 * conversation compute the exact same value.
 */
export async function computeSafetyNumber(publicKeyBase64A, publicKeyBase64B) {
  const combined = [publicKeyBase64A, publicKeyBase64B].sort().join("|");
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(combined));
  const bytes = new Uint8Array(hashBuffer);

  // Turn hash bytes into a 60-digit numeric string, then chunk into groups
  // of 5 for readability — same idea as Signal's 60-digit safety number.
  let digits = "";
  for (let i = 0; i < bytes.length && digits.length < 60; i++) {
    digits += bytes[i].toString().padStart(3, "0");
  }
  digits = digits.slice(0, 60);

  const groups = [];
  for (let i = 0; i < digits.length; i += 5) groups.push(digits.slice(i, i + 5));
  return groups.join(" ");
}

// ---------- key pinning (trust-on-first-use) ----------
// The first time we see a contact's public key, we "pin" it locally. If it
// ever changes afterwards without the contact re-verifying, that's a signal
// worth surfacing to the user instead of silently re-encrypting to a new key.

const knownKeyStorageKey = (userId) => `e2ee_known_pubkey_${userId}`;
const verifiedStorageKey = (userId) => `e2ee_verified_${userId}`;

export function getKnownPublicKey(userId) {
  return localStorage.getItem(knownKeyStorageKey(userId));
}

export function pinPublicKey(userId, publicKeyBase64) {
  localStorage.setItem(knownKeyStorageKey(userId), publicKeyBase64);
}

export function isVerified(userId) {
  return localStorage.getItem(verifiedStorageKey(userId)) === "true";
}

export function setVerified(userId, verified) {
  localStorage.setItem(verifiedStorageKey(userId), verified ? "true" : "false");
}

/**
 * Compares a contact's current public key against the one we last pinned.
 * Returns "new" (first time seeing them — pin it), "unchanged", or
 * "changed" (their key rotated since we last talked — needs re-verification).
 */
export function checkKeyStatus(userId, currentPublicKeyBase64) {
  const known = getKnownPublicKey(userId);
  if (!known) {
    pinPublicKey(userId, currentPublicKeyBase64);
    return "new";
  }
  if (known !== currentPublicKeyBase64) {
    setVerified(userId, false); // old verification no longer applies
    return "changed";
  }
  return "unchanged";
}

