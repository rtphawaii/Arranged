import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtService } from './jwt.js';
import type { Db } from '../db/client.js';
import type { User } from '../db/schema.js';
import { errors } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by `authenticate`. */
    user: User;
    authClaims: { sub: string; role: string } | null;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  jwt: JwtService;
  db: Db;
  adminApiToken: string;
}

export const authPlugin = fp<AuthPluginOptions>(async (app, opts) => {
  app.decorateRequest('authClaims', null);
  app.decorateRequest('user', null as unknown as User);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw errors.unauthorized();
    const token = header.slice('Bearer '.length).trim();
    let claims;
    try {
      claims = await opts.jwt.verify(token);
    } catch {
      throw errors.unauthorized('Invalid or expired token');
    }
    const user = await opts.db.selectFrom('users').selectAll().where('id', '=', claims.sub).executeTakeFirst();
    if (!user || user.status === 'deleted' || user.status === 'suspended') throw errors.unauthorized('Account unavailable');
    req.authClaims = claims;
    req.user = user;
  });

  app.decorate('requireAdmin', async (req: FastifyRequest) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token && token === opts.adminApiToken) return;
    await app.authenticate(req, undefined as unknown as FastifyReply);
    if (req.user.role !== 'admin') throw errors.forbidden('Admin only');
  });
});
