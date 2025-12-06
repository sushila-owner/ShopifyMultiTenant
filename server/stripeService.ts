// Stripe Service - Handles Stripe API operations
import { getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { merchants, subscriptions, plans } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

export class StripeService {
  // Create a Stripe customer
  async createCustomer(email: string, merchantId: number, businessName: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      name: businessName,
      metadata: { merchantId: merchantId.toString() },
    });
  }

  // Create checkout session for subscription
  async createCheckoutSession(
    customerId: string, 
    priceId: string, 
    merchantId: number,
    successUrl: string, 
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { merchantId: merchantId.toString() },
      subscription_data: {
        metadata: { merchantId: merchantId.toString() },
      },
    });
  }

  // Create customer portal session for managing subscription
  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  // Get subscription from Stripe schema
  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] || null;
  }

  // Get products from Stripe schema
  async listProducts(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
    );
    return result.rows;
  }

  // Get prices from Stripe schema
  async listPrices(active = true, limit = 100, offset = 0) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE active = ${active} ORDER BY unit_amount LIMIT ${limit} OFFSET ${offset}`
    );
    return result.rows;
  }

  // Get products with their prices
  async listProductsWithPrices(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = ${active}
          ORDER BY id
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active,
          pr.metadata as price_metadata
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY p.id, pr.unit_amount
      `
    );
    return result.rows;
  }

  // Update merchant's Stripe info
  async updateMerchantStripeInfo(merchantId: number, stripeInfo: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  }) {
    const [merchant] = await db.update(merchants)
      .set(stripeInfo)
      .where(eq(merchants.id, merchantId))
      .returning();
    return merchant;
  }

  // Handle subscription status changes from webhook
  async handleSubscriptionUpdate(stripeSubscriptionId: string, status: string) {
    // Find merchant with this subscription
    const [merchant] = await db.select()
      .from(merchants)
      .where(eq(merchants.stripeSubscriptionId, stripeSubscriptionId));
    
    if (!merchant) return null;

    // Map Stripe status to our status
    let subscriptionStatus: 'trial' | 'active' | 'cancelled' | 'expired' | 'past_due' = 'active';
    if (status === 'trialing') subscriptionStatus = 'trial';
    else if (status === 'active') subscriptionStatus = 'active';
    else if (status === 'canceled') subscriptionStatus = 'cancelled';
    else if (status === 'past_due') subscriptionStatus = 'past_due';
    else if (status === 'unpaid') subscriptionStatus = 'expired';

    // Update merchant subscription status
    await db.update(merchants)
      .set({ subscriptionStatus })
      .where(eq(merchants.id, merchant.id));

    // Update subscriptions table if exists
    await db.update(subscriptions)
      .set({ status: subscriptionStatus })
      .where(eq(subscriptions.merchantId, merchant.id));

    return merchant;
  }
}

export const stripeService = new StripeService();
