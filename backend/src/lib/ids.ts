import { randomUUID, randomBytes, createHash } from 'node:crypto';

export const newId = (): string => randomUUID();

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const randomDigits = (length = 6): string => {
  let out = '';
  while (out.length < length) {
    out += (randomBytes(1)[0]! % 10).toString();
  }
  return out;
};
