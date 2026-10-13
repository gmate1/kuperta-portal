// Mezőszintű titkosítás érzékeny adatokhoz (pl. adószám).
// AES-256-GCM: titkosít ÉS hitelesít – a módosított titkosított szöveget elutasítja.
// Tárolt formátum: v1:<iv>:<authTag>:<ciphertext> (base64)
import crypto from 'node:crypto';
import { config } from '../config.js';

const key = Buffer.from(config.encryptionKey, 'hex');

export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12); // GCM-hez 96 bites, minden titkosításnál új
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decrypt(stored) {
  if (!stored) return null;
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1') throw new Error('Ismeretlen titkosítási formátum');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Adószám maszkolása listákhoz: 12345678-1-42 → ********-1-42 */
export function maskTaxNumber(tax) {
  if (!tax) return null;
  return tax.replace(/^\d{8}/, '********');
}
