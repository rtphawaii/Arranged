import Stripe from 'stripe';
import type {
  CreateIntentInput,
  PaymentIntentRef,
  PaymentProvider,
  ProviderPaymentStatus,
  SubscriptionRef,
  WebhookEvent,
} from './provider.js';

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    private readonly membershipPriceId: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createPaymentIntent(input: CreateIntentInput): Promise<PaymentIntentRef> {
    const intent = await this.stripe.paymentIntents.create({
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      description: input.description,
      metadata: { ...input.metadata, userId: input.userId },
      automatic_payment_methods: { enabled: true },
    });
    return { providerRef: intent.id, clientSecret: intent.client_secret, status: mapIntentStatus(intent.status) };
  }

  async getPaymentStatus(providerRef: string): Promise<ProviderPaymentStatus> {
    const intent = await this.stripe.paymentIntents.retrieve(providerRef);
    return mapIntentStatus(intent.status);
  }

  async refund(providerRef: string, amountCents?: number): Promise<void> {
    await this.stripe.refunds.create({ payment_intent: providerRef, ...(amountCents ? { amount: amountCents } : {}) });
  }

  async cancel(providerRef: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(providerRef);
  }

  async createSubscription(userId: string, _plan: string, customerEmail: string | null): Promise<SubscriptionRef> {
    if (!this.membershipPriceId) throw new Error('STRIPE_MEMBERSHIP_PRICE_ID is not configured');
    const customer = await this.stripe.customers.create({ metadata: { userId }, ...(customerEmail ? { email: customerEmail } : {}) });
    const sub = await this.stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: this.membershipPriceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
    const invoice = sub.latest_invoice as Stripe.Invoice | null;
    const pi = (invoice as unknown as { payment_intent?: Stripe.PaymentIntent | null })?.payment_intent ?? null;
    const periodEnd = (sub.items.data[0] as unknown as { current_period_end?: number })?.current_period_end;
    return {
      providerRef: sub.id,
      clientSecret: pi?.client_secret ?? null,
      status: mapSubscriptionStatus(sub.status),
      currentPeriodEnd: new Date((periodEnd ?? Math.floor(Date.now() / 1000) + 30 * 86400) * 1000),
    };
  }

  async cancelSubscription(providerRef: string, atPeriodEnd: boolean): Promise<void> {
    if (atPeriodEnd) await this.stripe.subscriptions.update(providerRef, { cancel_at_period_end: true });
    else await this.stripe.subscriptions.cancel(providerRef);
  }

  async parseWebhook(rawBody: string | Buffer, signature: string | undefined): Promise<WebhookEvent | null> {
    if (!signature) throw new Error('Missing stripe-signature header');
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    switch (event.type) {
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        const pi = event.data.object;
        return { type: event.type, providerRef: pi.id, status: mapIntentStatus(pi.status) };
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const periodEnd = (sub.items.data[0] as unknown as { current_period_end?: number })?.current_period_end;
        return {
          type: event.type,
          providerRef: sub.id,
          subscriptionStatus: mapSubscriptionStatus(sub.status),
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
        };
      }
      default:
        return null;
    }
  }
}

function mapIntentStatus(status: Stripe.PaymentIntent.Status): ProviderPaymentStatus {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'processing':
      return 'processing';
    case 'canceled':
      return 'cancelled';
    default:
      return 'requires_payment';
  }
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionRef['status'] {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      return 'incomplete';
  }
}
