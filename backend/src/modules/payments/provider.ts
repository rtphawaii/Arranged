export type ProviderPaymentStatus = 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export interface CreateIntentInput {
  amountCents: number;
  currency: string;
  userId: string;
  description: string;
  metadata: Record<string, string>;
}

export interface PaymentIntentRef {
  providerRef: string;
  /** Secret the mobile client uses to complete payment (Stripe PaymentSheet). */
  clientSecret: string | null;
  status: ProviderPaymentStatus;
}

export interface SubscriptionRef {
  providerRef: string;
  clientSecret: string | null;
  status: 'active' | 'incomplete' | 'past_due' | 'cancelled';
  currentPeriodEnd: Date;
}

export interface WebhookEvent {
  type: string;
  providerRef: string;
  status?: ProviderPaymentStatus;
  subscriptionStatus?: SubscriptionRef['status'];
  currentPeriodEnd?: Date;
}

export interface PaymentProvider {
  readonly name: string;
  createPaymentIntent(input: CreateIntentInput): Promise<PaymentIntentRef>;
  getPaymentStatus(providerRef: string): Promise<ProviderPaymentStatus>;
  refund(providerRef: string, amountCents?: number): Promise<void>;
  cancel(providerRef: string): Promise<void>;
  createSubscription(userId: string, plan: string, customerEmail: string | null): Promise<SubscriptionRef>;
  cancelSubscription(providerRef: string, atPeriodEnd: boolean): Promise<void>;
  /** Verifies and parses a webhook payload. Throws on invalid signatures. */
  parseWebhook(rawBody: string | Buffer, signature: string | undefined): Promise<WebhookEvent | null>;
}
