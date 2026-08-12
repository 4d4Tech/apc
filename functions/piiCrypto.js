/**
 * Node.js backend PII cryptography, masking, and formatting utility file.
 */

const { webcrypto } = require('crypto');
const crypto = webcrypto;

const ENCRYPTION_SECRET = "APC_PII_SECURE_KEY_2026_V1";
const SALT = "APC_SALT_2026";

function formatSsnOrEin(value = '') {
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

function maskPii(value = '') {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 0) return '';
  
  if (digits.length < 4) {
    return 'XXX-XX-' + digits;
  }
  
  const last4 = digits.slice(-4);
  if (value.includes('-') && value.indexOf('-') === 2) {
    return `XX-XXX${last4}`;
  }
  return `XXX-XX-${last4}`;
}

function extractLast4(value = '') {
  if (!value) return 'XXXX';
  const digits = String(value).replace(/\D/g, '');
  return digits.slice(-4) || 'XXXX';
}

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

async function encryptPii(plainText) {
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
    return 'ENC:' + Buffer.from(combined).toString('base64');
  } catch (err) {
    console.error('Functions PII Encryption Error:', err);
    return plainText;
  }
}

async function decryptPii(cipherText) {
  if (!cipherText) return '';
  if (!cipherText.startsWith('ENC:')) {
    return cipherText;
  }
  
  try {
    const rawBase64 = cipherText.slice(4);
    const combined = Buffer.from(rawBase64, 'base64');
    
    const iv = combined.subarray(0, 12);
    const data = combined.subarray(12);
    const key = await getCryptoKey();
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('Functions PII Decryption Error:', err);
    return cipherText;
  }
}

module.exports = {
  formatSsnOrEin,
  maskPii,
  extractLast4,
  encryptPii,
  decryptPii
};
