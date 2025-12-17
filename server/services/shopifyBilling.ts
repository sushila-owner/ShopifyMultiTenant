import { db } from "../db";
import { subscriptions, plans, merchants } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";

const SHOPIFY_API_VERSION = "2024-10";

interface ShopifyBillingConfig {
  storeUrl: string;
  accessToken: string;
}

interface AppSubscriptionResult {
  success: boolean;
  confirmationUrl?: string;
  subscriptionId?: string;
  error?: string;
}

interface CurrentSubscription {
  id: string;
  name: string;
  status: string;
  lineItems: {
    plan: {
      pricingDetails: {
        price: { amount: string; currencyCode: string };
        interval: string;
      };
    };
  }[];
  currentPeriodEnd?: string;
  test: boolean;
}

export class ShopifyBillingService {
  private storeUrl: string;
  private accessToken: string;

  constructor(config: ShopifyBillingConfig) {
    this.storeUrl = config.storeUrl.replace(/\/$/, "");
    this.accessToken = config.accessToken;
  }

  private async graphqlRequest<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const url = `${this.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Shopify GraphQL error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }

  async createSubscription(
    planName: string,
    priceAmount: number,
    interval: "EVERY_30_DAYS" | "ANNUAL",
    returnUrl: string,
    trialDays: number = 2,
    isTest: boolean = false
  ): Promise<AppSubscriptionResult> {
    try {
      const mutation = `
        mutation AppSubscriptionCreate(
          $name: String!
          $returnUrl: URL!
          $lineItems: [AppSubscriptionLineItemInput!]!
          $trialDays: Int
          $test: Boolean
        ) {
          appSubscriptionCreate(
            name: $name
            returnUrl: $returnUrl
            lineItems: $lineItems
            trialDays: $trialDays
            test: $test
          ) {
            userErrors {
              field
              message
            }
            confirmationUrl
            appSubscription {
              id
              status
            }
          }
        }
      `;

      const variables = {
        name: planName,
        returnUrl,
        trialDays,
        test: isTest,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: priceAmount,
                  currencyCode: "USD",
                },
                interval,
              },
            },
          },
        ],
      };

      const result = await this.graphqlRequest<{
        appSubscriptionCreate: {
          userErrors: { field: string; message: string }[];
          confirmationUrl: string | null;
          appSubscription: { id: string; status: string } | null;
        };
      }>(mutation, variables);

      const { appSubscriptionCreate } = result;

      if (appSubscriptionCreate.userErrors.length > 0) {
        return {
          success: false,
          error: appSubscriptionCreate.userErrors.map(e => e.message).join(", "),
        };
      }

      if (!appSubscriptionCreate.confirmationUrl) {
        return {
          success: false,
          error: "No confirmation URL returned from Shopify",
        };
      }

      return {
        success: true,
        confirmationUrl: appSubscriptionCreate.confirmationUrl,
        subscriptionId: appSubscriptionCreate.appSubscription?.id,
      };
    } catch (error: any) {
      console.error("[ShopifyBilling] Create subscription error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getCurrentSubscription(): Promise<CurrentSubscription | null> {
    try {
      const query = `
        query {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              test
              currentPeriodEnd
              lineItems {
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price {
                        amount
                        currencyCode
                      }
                      interval
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const result = await this.graphqlRequest<{
        currentAppInstallation: {
          activeSubscriptions: CurrentSubscription[];
        };
      }>(query);

      const subscriptions = result.currentAppInstallation?.activeSubscriptions || [];
      return subscriptions.length > 0 ? subscriptions[0] : null;
    } catch (error: any) {
      console.error("[ShopifyBilling] Get current subscription error:", error);
      return null;
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const mutation = `
        mutation AppSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            userErrors {
              field
              message
            }
            appSubscription {
              id
              status
            }
          }
        }
      `;

      const result = await this.graphqlRequest<{
        appSubscriptionCancel: {
          userErrors: { field: string; message: string }[];
          appSubscription: { id: string; status: string } | null;
        };
      }>(mutation, { id: subscriptionId });

      if (result.appSubscriptionCancel.userErrors.length > 0) {
        return {
          success: false,
          error: result.appSubscriptionCancel.userErrors.map(e => e.message).join(", "),
        };
      }

      return { success: true };
    } catch (error: any) {
      console.error("[ShopifyBilling] Cancel subscription error:", error);
      return { success: false, error: error.message };
    }
  }
}

export async function getShopifyBillingFromMerchant(merchantId: number): Promise<ShopifyBillingService | null> {
  try {
    const merchant = await storage.getMerchant(merchantId);
    const shopifyStore = merchant?.shopifyStore as { domain?: string; accessToken?: string } | null;
    
    if (!shopifyStore?.domain || !shopifyStore?.accessToken) {
      return null;
    }

    return new ShopifyBillingService({
      storeUrl: `https://${shopifyStore.domain}`,
      accessToken: shopifyStore.accessToken,
    });
  } catch (error) {
    console.error("[ShopifyBilling] Failed to get billing service:", error);
    return null;
  }
}

export async function handleShopifySubscriptionActivated(
  merchantId: number,
  shopifySubscriptionId: string,
  planSlug: string
): Promise<void> {
  const plan = await storage.getPlanBySlug(planSlug);
  if (!plan) {
    throw new Error(`Plan not found: ${planSlug}`);
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const existingSubscription = await storage.getSubscriptionByMerchant(merchantId);

  if (existingSubscription) {
    await db
      .update(subscriptions)
      .set({
        planId: plan.id,
        planSlug: plan.slug,
        status: "active",
        billingProvider: "shopify",
        shopifySubscriptionId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.merchantId, merchantId));
  } else {
    await db.insert(subscriptions).values({
      merchantId,
      planId: plan.id,
      planSlug: plan.slug,
      status: "active",
      billingProvider: "shopify",
      shopifySubscriptionId,
      billingInterval: "monthly",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });
  }

  console.log(`[ShopifyBilling] Activated subscription for merchant ${merchantId} on plan ${planSlug}`);
}

export async function handleShopifySubscriptionCancelled(merchantId: number): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.merchantId, merchantId));

  console.log(`[ShopifyBilling] Cancelled subscription for merchant ${merchantId}`);
}
