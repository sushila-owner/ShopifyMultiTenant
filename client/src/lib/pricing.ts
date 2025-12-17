export interface PricingPlan {
  id: string;
  name: string;
  nameKey: string;
  price: number;
  period: "forever" | "month";
  description: string;
  descriptionKey: string;
  features: string[];
  featureKeys: string[];
  popular: boolean;
  badge: string | null;
  freeForLife: boolean;
  productLimit: number;
  orderLimit: number;
  teamLimit: number;
  trialDays: number;
}

export const TRIAL_DAYS = 2;

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    nameKey: "pricing.free",
    price: 0,
    period: "forever",
    description: "Perfect for getting started",
    descriptionKey: "pricing.freeDescription",
    features: [
      "Up to 25 products",
      "Up to 50 orders",
      "No cost"
    ],
    featureKeys: [],
    popular: false,
    badge: null,
    freeForLife: false,
    productLimit: 25,
    orderLimit: 50,
    teamLimit: 1,
    trialDays: 0
  },
  {
    id: "starter",
    name: "Starter",
    nameKey: "pricing.starter",
    price: 29,
    period: "month",
    description: "Ideal for small stores and beginners",
    descriptionKey: "pricing.starterDescription",
    features: [
      "Up to 250 products",
      "Up to 5,000 orders",
      "1 ad creative delivered daily via email",
      "Priority support",
      "1 premium Shopify theme included free (worth $400)"
    ],
    featureKeys: [],
    popular: false,
    badge: null,
    freeForLife: true,
    productLimit: 250,
    orderLimit: 5000,
    teamLimit: 1,
    trialDays: 2
  },
  {
    id: "growth",
    name: "Growth",
    nameKey: "pricing.growth",
    price: 79,
    period: "month",
    description: "Best for scaling businesses",
    descriptionKey: "pricing.growthDescription",
    features: [
      "Up to 2,000 products",
      "Up to 5,000 orders",
      "5 ad creatives delivered daily via email",
      "Chat support",
      "1 premium Shopify theme included free (worth $400)"
    ],
    featureKeys: [],
    popular: true,
    badge: null,
    freeForLife: true,
    productLimit: 2000,
    orderLimit: 5000,
    teamLimit: 5,
    trialDays: 2
  },
  {
    id: "professional",
    name: "Professional",
    nameKey: "pricing.professional",
    price: 199,
    period: "month",
    description: "Designed for high-volume sellers",
    descriptionKey: "pricing.professionalDescription",
    features: [
      "Up to 10,000 products",
      "Up to 50,000 orders",
      "10 ad creatives delivered daily",
      "Expert assistance with ad management",
      "Priority support",
      "Dedicated team member assigned",
      "1 premium Shopify theme included free (worth $400)"
    ],
    featureKeys: [],
    popular: false,
    badge: "popular",
    freeForLife: true,
    productLimit: 10000,
    orderLimit: 50000,
    teamLimit: 10,
    trialDays: 2
  },
  {
    id: "millionaire",
    name: "Millionaire",
    nameKey: "pricing.millionaire",
    price: 249,
    period: "month",
    description: "For enterprise-level and elite sellers",
    descriptionKey: "pricing.millionaireDescription",
    features: [
      "Unlimited products",
      "Unlimited orders",
      "20 ad creatives delivered daily",
      "Ad creatives delivered via email, including video ads",
      "Dedicated professional manager",
      "API access",
      "VIP support (response within 10 minutes)",
      "1 premium Shopify theme included free (worth $400)"
    ],
    featureKeys: [],
    popular: false,
    badge: "millionaire",
    freeForLife: true,
    productLimit: -1,
    orderLimit: -1,
    teamLimit: -1,
    trialDays: 2
  }
];

export const FREE_FOR_LIFE_THRESHOLD = 100000000; // $1,000,000 in cents

export const FREE_FOR_LIFE_PLAN: PricingPlan = {
  id: "free_for_life",
  name: "FREE FOR LIFE",
  nameKey: "pricing.freeForLife",
  price: 0,
  period: "forever",
  description: "Earned by reaching $1,000,000 in lifetime sales",
  descriptionKey: "pricing.freeForLifeDescription",
  features: [
    "Unlimited products",
    "Unlimited orders",
    "Unlimited team members",
    "All premium features",
    "VIP support forever"
  ],
  featureKeys: [],
  popular: false,
  badge: "lifetime",
  freeForLife: false,
  productLimit: -1,
  orderLimit: -1,
  teamLimit: -1,
  trialDays: 0
};

export function formatPrice(price: number, period?: "forever" | "month"): string {
  if (price === 0) {
    return "$0";
  }
  return `$${price}`;
}

export function getPlanById(id: string): PricingPlan | undefined {
  if (id === "free_for_life") {
    return FREE_FOR_LIFE_PLAN;
  }
  return PRICING_PLANS.find(plan => plan.id === id);
}
