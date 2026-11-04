import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '../db/schema.js';
import { systemClock, type Clock } from '../lib/time.js';

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
}

export class JwtService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
    private readonly clock: Clock = systemClock,
    private readonly issuer = 'arranged',
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: AccessTokenClaims, now: Date = this.clock.now()): Promise<string> {
    const iat = Math.floor(now.getTime() / 1000);
    return new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(this.issuer)
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.ttlSeconds)
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, this.key, { issuer: this.issuer, currentDate: this.clock.now() });
    if (!payload.sub) throw new Error('missing sub');
    return { sub: payload.sub, role: (payload.role as UserRole) ?? 'member' };
  }

  get accessTokenTtlSeconds() {
    return this.ttlSeconds;
  }
}
