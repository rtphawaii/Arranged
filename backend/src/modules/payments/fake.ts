import { randomToken } from '../../lib/ids.js';
import { addDays, type Clock } from '../../lib/time.js';
import type {
  CreateIntentInput,
  PaymentIntentRef,
  PaymentProvider,
  ProviderPaymentStatus,
  SubscriptionRef,
  WebhookEvent,
} from './provider.js';

/**
 * In-memory payment provider for development and tests. Intents start as `requires_payment`
 * and are completed by calling `complete()` (exposed via the dev-only endpoint
 * POST /payments/:id/dev-complete) or `fail()`.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  private readonly intents = new Map<string, ProviderPaymentStatus>();
  private readonly subscriptions = new Map<string, SubscriptionRef>();

  constructor(private readonly clock: Clock) {}

  async createPaymentIntent(_input: CreateIntentInput): Promise<PaymentIntentRef> {
    const providerRef = `fake_pi_${randomToken(8)}`;
    this.intents.set(providerRef, 'requires_payment');
    return { providerRef, clientSecret: `${providerRef}_secret`, status: 'requires_payment' };
  }

  async getPaymentStatus(providerRef: string): Promise<ProviderPaymentStatus> {
    return this.intents.get(providerRef) ?? 'failed';
  }

  async refund(providerRef: string): Promise<void> {
    if (!this.intents.has(providerRef)) throw new Error('Unknown payment');
    this.intents.set(providerRef, 'cancelled');
  }

  async cancel(providerRef: string): Promise<void> {
    this.intents.set(providerRef, 'cancelled');
  }

  async createSubscription(_userId: string, _plan: string): Promise<SubscriptionRef> {
    const ref: SubscriptionRef = {
      providerRef: `fake_sub_${randomToken(8)}`,
      clientSecret: null,
      status: 'active',
      currentPeriodEnd: addDays(this.clock.now(), 30),
    };
    this.subscriptions.set(ref.providerRef, ref);
    return ref;
  }

  async cancelSubscription(providerRef: string, atPeriodEnd: boolean): Promise<void> {
    const sub = this.subscriptions.get(providerRef);
    if (sub && !atPeriodEnd) sub.status = 'cancelled';
  }

  async parseWebhook(rawBody: string | Buffer): Promise<WebhookEvent | null> {
    const parsed = JSON.parse(rawBody.toString()) as WebhookEvent;
    return parsed;
  }

  // --- test / dev helpers ---
  complete(providerRef: string) {
    if (!this.intents.has(providerRef)) throw new Error('Unknown payment');
    this.intents.set(providerRef, 'succeeded');
  }
  fail(providerRef: string) {
    this.intents.set(providerRef, 'failed');
  }
}
