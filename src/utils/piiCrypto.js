/**
 * Utility functions for Personally Identifiable Information (PII) 
 * handling, masking, formatting, and AES-256-GCM encryption at rest.
 */

const ENCRYPTION_SECRET = "APC_PII_SECURE_KEY_2026_V1";
const SALT = "APC_SALT_2026";

/**
 * Formats raw digits into standard SSN (XXX-XX-XXXX) or EIN (XX-XXXXXXX) format
 */
export function formatSsnOrEin(value = '') {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  
  if (digits.length > 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
  }
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 5) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
}

/**
 * Masks SSN or EIN for safe display in UI components and logs
 * Examples:
 *   123-45-6789 -> XXX-XX-6789
 *   12-3456789 -> XX-XXX6789
 */
export function maskPii(value = '') {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 0) return '';
  
  if (digits.length < 4) {
    return 'XXX-XX-' + digits;
  }
  
  const last4 = digits.slice(-4);
  if (value.includes('-') && value.indexOf('-') === 2) {
    // EIN format: XX-XXXXXXX
    return `XX-XXX${last4}`;
  }
  // Standard SSN format: XXX-XX-XXXX
  return `XXX-XX-${last4}`;
}

/**
 * Extracts last 4 digits of SSN/EIN
 */
export function extractLast4(value = '') {
  if (!value) return 'XXXX';
  const digits = String(value).replace(/\D/g, '');
  return digits.slice(-4) || 'XXXX';
}

/**
 * Validates that SSN or EIN consists of 9 valid digits
 */
export function isValidSsnOrEin(value = '') {
  if (!value) return false;
  const digits = String(value).replace(/\D/g, '');
  return digits.length === 9;
}

/**
 * Derives a CryptoKey for AES-256-GCM encryption using PBKDF2
 */
async function getCryptoKey() {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(ENCRYPTION_SECRET),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(SALT),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts PII text using AES-256-GCM
 */
export async function encryptPii(plainText) {
  if (!plainText) return '';
  try {
    const key = await getCryptoKey();
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plainText)
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Prefix with ENC: to identify encrypted payload
    return 'ENC:' + btoa(String.fromCharCode(...combined));
  } catch (err) {
    console.error('PII Encryption Error:', err);
    return plainText; // fallback if Web Crypto unavailable
  }
}

/**
 * Decrypts encrypted PII text using AES-256-GCM
 */
export async function decryptPii(cipherText) {
  if (!cipherText) return '';
  if (!cipherText.startsWith('ENC:')) {
    // If plaintext or legacy value, return as is
    return cipherText;
  }
  
  try {
    const rawBase64 = cipherText.slice(4);
    const combinedStr = atob(rawBase64);
    const combined = new Uint8Array(combinedStr.length);
    for (let i = 0; i < combinedStr.length; i++) {
      combined[i] = combinedStr.charCodeAt(i);
    }
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const key = await getCryptoKey();
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('PII Decryption Error:', err);
    return cipherText;
  }
}
