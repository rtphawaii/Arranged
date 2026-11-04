import type { Logger } from '../lib/logger.js';

/** Sends a one-time code to a phone number. Code generation/verification stays in our DB. */
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

export class DevOtpSender implements OtpSender {
  constructor(private readonly log: Logger) {}
  async send(phone: string, code: string): Promise<void> {
    this.log.info({ phone, code }, 'DEV OTP (not actually sent)');
  }
}

/**
 * Twilio Programmable SMS sender. Uses the REST API directly so we don't need the SDK.
 * Swap for Twilio Verify if you prefer Twilio to own code generation.
 */
export class TwilioSmsOtpSender implements OtpSender {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(phone: string, code: string): Promise<void> {
    const body = new URLSearchParams({
      To: phone,
      From: this.fromNumber,
      Body: `Your Arranged code is ${code}. It expires in 10 minutes.`,
    });
    const res = await this.fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) throw new Error(`Twilio SMS failed: ${res.status} ${await res.text()}`);
  }
}
