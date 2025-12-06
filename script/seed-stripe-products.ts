// Seed Stripe Products - Creates subscription products and prices for all 6 plans
// Run with: npx tsx script/seed-stripe-products.ts

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-11-17.clover',
});

interface PlanConfig {
  name: string;
  slug: string;
  description: string;
  monthlyPrice: number; // in cents
  yearlyPrice: number; // in cents
  productLimit: number;
  features: string[];
  metadata: Record<string, string>;
}

const plans: PlanConfig[] = [
  {
    name: 'Free',
    slug: 'free',
    description: 'Perfect for getting started',
    monthlyPrice: 0,
    yearlyPrice: 0,
    productLimit: 50,
    features: [
      'Up to 50 products',
      'Basic catalog access',
      'Community support'
    ],
    metadata: {
      planSlug: 'free',
      productLimit: '50',
      orderLimit: '-1',
      teamMemberLimit: '1'
    }
  },
  {
    name: 'Starter',
    slug: 'starter',
    description: 'Great for small businesses',
    monthlyPrice: 2900, // $29
    yearlyPrice: 29000, // $290 (save 2 months)
    productLimit: 500,
    features: [
      'Up to 500 products',
      'Full catalog access',
      'Email support',
      '5 AI-generated ads/day'
    ],
    metadata: {
      planSlug: 'starter',
      productLimit: '500',
      orderLimit: '-1',
      teamMemberLimit: '2',
      dailyAdsLimit: '5'
    }
  },
  {
    name: 'Growth',
    slug: 'growth',
    description: 'For growing businesses',
    monthlyPrice: 7900, // $79
    yearlyPrice: 79000, // $790
    productLimit: 2000,
    features: [
      'Up to 2,000 products',
      'Priority support',
      '20 AI-generated ads/day',
      'Advanced analytics'
    ],
    metadata: {
      planSlug: 'growth',
      productLimit: '2000',
      orderLimit: '-1',
      teamMemberLimit: '5',
      dailyAdsLimit: '20',
      hasAiAds: 'true'
    }
  },
  {
    name: 'Professional',
    slug: 'professional',
    description: 'For established businesses',
    monthlyPrice: 19900, // $199
    yearlyPrice: 199000, // $1990
    productLimit: 10000,
    features: [
      'Up to 10,000 products',
      'Dedicated support',
      'Unlimited AI ads',
      'Video ad generation',
      'White-label options'
    ],
    metadata: {
      planSlug: 'professional',
      productLimit: '10000',
      orderLimit: '-1',
      teamMemberLimit: '15',
      dailyAdsLimit: '-1',
      hasAiAds: 'true',
      hasVideoAds: 'true',
      isWhiteLabel: 'true'
    }
  },
  {
    name: 'Millionaire',
    slug: 'millionaire',
    description: 'Enterprise-grade features',
    monthlyPrice: 49900, // $499
    yearlyPrice: 499000, // $4990
    productLimit: -1, // Unlimited
    features: [
      'Unlimited products',
      'VIP support',
      'All features included',
      'Custom integrations',
      'Dedicated account manager'
    ],
    metadata: {
      planSlug: 'millionaire',
      productLimit: '-1',
      orderLimit: '-1',
      teamMemberLimit: '-1',
      dailyAdsLimit: '-1',
      hasAiAds: 'true',
      hasVideoAds: 'true',
      isWhiteLabel: 'true',
      hasVipSupport: 'true'
    }
  },
  {
    name: 'FREE FOR LIFE',
    slug: 'free_for_life',
    description: 'Earned by reaching $1M in lifetime sales',
    monthlyPrice: 0,
    yearlyPrice: 0,
    productLimit: -1, // Unlimited
    features: [
      'Unlimited everything',
      'VIP support forever',
      'All premium features',
      'Exclusive badge'
    ],
    metadata: {
      planSlug: 'free_for_life',
      productLimit: '-1',
      orderLimit: '-1',
      teamMemberLimit: '-1',
      dailyAdsLimit: '-1',
      hasAiAds: 'true',
      hasVideoAds: 'true',
      isWhiteLabel: 'true',
      hasVipSupport: 'true',
      isSpecial: 'true'
    }
  }
];

async function seedStripeProducts() {
  console.log('Starting Stripe product seeding...\n');

  for (const plan of plans) {
    console.log(`Processing: ${plan.name}...`);
    
    // Check if product already exists
    const existingProducts = await stripe.products.search({
      query: `metadata['planSlug']:'${plan.slug}'`
    });

    let product: Stripe.Product;

    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0];
      console.log(`  Product exists: ${product.id}`);
    } else {
      // Create product
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: plan.metadata,
      });
      console.log(`  Created product: ${product.id}`);
    }

    // Create prices if they don't exist (skip for free plans)
    if (plan.monthlyPrice > 0) {
      // Check for existing monthly price
      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true,
      });

      const hasMonthlyPrice = existingPrices.data.some(
        p => p.recurring?.interval === 'month' && p.unit_amount === plan.monthlyPrice
      );
      const hasYearlyPrice = existingPrices.data.some(
        p => p.recurring?.interval === 'year' && p.unit_amount === plan.yearlyPrice
      );

      if (!hasMonthlyPrice) {
        const monthlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.monthlyPrice,
          currency: 'usd',
          recurring: { interval: 'month' },
          metadata: { interval: 'monthly', planSlug: plan.slug }
        });
        console.log(`  Created monthly price: ${monthlyPrice.id} ($${plan.monthlyPrice / 100}/mo)`);
      } else {
        console.log(`  Monthly price already exists`);
      }

      if (!hasYearlyPrice) {
        const yearlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.yearlyPrice,
          currency: 'usd',
          recurring: { interval: 'year' },
          metadata: { interval: 'yearly', planSlug: plan.slug }
        });
        console.log(`  Created yearly price: ${yearlyPrice.id} ($${plan.yearlyPrice / 100}/yr)`);
      } else {
        console.log(`  Yearly price already exists`);
      }
    } else {
      console.log(`  Free plan - no prices needed`);
    }

    console.log('');
  }

  console.log('Stripe product seeding complete!');
}

seedStripeProducts().catch(console.error);
