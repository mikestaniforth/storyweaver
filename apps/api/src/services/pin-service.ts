import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export function hashFamilyCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export async function createPinHash(pin: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  return { salt, hash: derived.toString('hex') };
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
