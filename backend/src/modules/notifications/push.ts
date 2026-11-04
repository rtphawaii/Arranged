import http2 from 'node:http2';
import { SignJWT, importPKCS8 } from 'jose';
import type { Logger } from '../../lib/logger.js';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
}

export interface PushTarget {
  token: string;
  environment: 'sandbox' | 'production';
}

export interface PushProvider {
  /** Returns tokens that are no longer valid so the caller can delete them. */
  send(targets: PushTarget[], message: PushMessage): Promise<{ invalidTokens: string[] }>;
}

export class LogPushProvider implements PushProvider {
  readonly sent: Array<{ targets: PushTarget[]; message: PushMessage }> = [];
  constructor(private readonly log: Logger) {}
  async send(targets: PushTarget[], message: PushMessage) {
    this.sent.push({ targets, message });
    this.log.info({ tokens: targets.map((t) => t.token), title: message.title }, 'push (logged, not sent)');
    return { invalidTokens: [] };
  }
}

/** APNs HTTP/2 provider using token-based (p8) auth. */
export class ApnsPushProvider implements PushProvider {
  private cachedJwt: { token: string; issuedAt: number } | null = null;

  constructor(
    private readonly opts: { keyId: string; teamId: string; bundleId: string; privateKeyPem: string; log: Logger },
  ) {}

  private async authToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedJwt && now - this.cachedJwt.issuedAt < 50 * 60) return this.cachedJwt.token;
    const key = await importPKCS8(this.opts.privateKeyPem.replace(/\\n/g, '\n'), 'ES256');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.opts.keyId })
      .setIssuer(this.opts.teamId)
      .setIssuedAt(now)
      .sign(key);
    this.cachedJwt = { token, issuedAt: now };
    return token;
  }

  async send(targets: PushTarget[], message: PushMessage): Promise<{ invalidTokens: string[] }> {
    const invalidTokens: string[] = [];
    const jwt = await this.authToken();
    const byEnv = new Map<'sandbox' | 'production', PushTarget[]>();
    for (const t of targets) byEnv.set(t.environment, [...(byEnv.get(t.environment) ?? []), t]);

    for (const [env, list] of byEnv) {
      const host = env === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
      const client = http2.connect(host);
      try {
        await Promise.all(
          list.map(
            (target) =>
              new Promise<void>((resolve) => {
                const payload = JSON.stringify({
                  aps: { alert: { title: message.title, body: message.body }, sound: 'default', badge: message.badge },
                  ...message.data,
                });
                const req = client.request({
                  ':method': 'POST',
                  ':path': `/3/device/${target.token}`,
                  authorization: `bearer ${jwt}`,
                  'apns-topic': this.opts.bundleId,
                  'apns-push-type': 'alert',
                  'apns-priority': '10',
                  'content-type': 'application/json',
                });
                let status = 0;
                let body = '';
                req.on('response', (headers) => {
                  status = Number(headers[':status']);
                });
                req.on('data', (chunk) => (body += chunk));
                req.on('end', () => {
                  if (status === 410 || (status === 400 && body.includes('BadDeviceToken'))) invalidTokens.push(target.token);
                  else if (status >= 400) this.opts.log.warn({ status, body, token: target.token }, 'APNs rejected push');
                  resolve();
                });
                req.on('error', (err) => {
                  this.opts.log.error({ err }, 'APNs request error');
                  resolve();
                });
                req.end(payload);
              }),
          ),
        );
      } finally {
        client.close();
      }
    }
    return { invalidTokens };
  }
}
