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
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    nameKey: "pricing.free",
    price: 0,
    period: "forever",
    description: "Get started with basic features",
    descriptionKey: "pricing.freeDescription",
    features: [
      "Up to 25 products",
      "50 orders per month",
      "1 team member",
      "Basic analytics",
      "Email support"
    ],
    featureKeys: ["pricing.features.products25", "pricing.features.orders50", "pricing.features.team1", "pricing.features.basicAnalytics", "pricing.features.emailSupport"],
    popular: false,
    badge: null,
    freeForLife: false,
    productLimit: 25,
    orderLimit: 50,
    teamLimit: 1
  },
  {
    id: "starter",
    name: "Starter",
    nameKey: "pricing.starter",
    price: 29,
    period: "month",
    description: "For growing businesses",
    descriptionKey: "pricing.starterDescription",
    features: [
      "Up to 100 products",
      "500 orders per month",
      "3 team members",
      "1 AI-generated ad/month",
      "Priority support"
    ],
    featureKeys: ["pricing.features.products100", "pricing.features.orders500", "pricing.features.team3", "pricing.features.aiAd1", "pricing.features.prioritySupport"],
    popular: false,
    badge: null,
    freeForLife: true,
    productLimit: 100,
    orderLimit: 500,
    teamLimit: 3
  },
  {
    id: "growth",
    name: "Growth",
    nameKey: "pricing.growth",
    price: 49,
    period: "month",
    description: "Scale your operations",
    descriptionKey: "pricing.growthDescription",
    features: [
      "Up to 250 products",
      "1,500 orders per month",
      "5 team members",
      "2 AI-generated ads/month",
      "Chat support"
    ],
    featureKeys: ["pricing.features.products250", "pricing.features.orders1500", "pricing.features.team5", "pricing.features.aiAd2", "pricing.features.chatSupport"],
    popular: true,
    badge: null,
    freeForLife: true,
    productLimit: 250,
    orderLimit: 1500,
    teamLimit: 5
  },
  {
    id: "professional",
    name: "Professional",
    nameKey: "pricing.professional",
    price: 99,
    period: "month",
    description: "For established businesses",
    descriptionKey: "pricing.professionalDescription",
    features: [
      "Up to 1,000 products",
      "5,000 orders per month",
      "10 team members",
      "3 AI-generated ads/month",
      "Video ads",
      "API access"
    ],
    featureKeys: ["pricing.features.products1000", "pricing.features.orders5000", "pricing.features.team10", "pricing.features.aiAd3", "pricing.features.videoAds", "pricing.features.apiAccess"],
    popular: false,
    badge: "popular",
    freeForLife: true,
    productLimit: 1000,
    orderLimit: 5000,
    teamLimit: 10
  },
  {
    id: "millionaire",
    name: "Millionaire",
    nameKey: "pricing.millionaire",
    price: 249,
    period: "month",
    description: "Enterprise-grade features",
    descriptionKey: "pricing.millionaireDescription",
    features: [
      "Unlimited products",
      "Unlimited orders",
      "Unlimited team members",
      "5 AI-generated ads/month",
      "White-label options",
      "VIP support",
      "Dedicated account manager"
    ],
    featureKeys: ["pricing.features.unlimitedProducts", "pricing.features.unlimitedOrders", "pricing.features.unlimitedTeam", "pricing.features.aiAd5", "pricing.features.whiteLabel", "pricing.features.vipSupport", "pricing.features.dedicatedManager"],
    popular: false,
    badge: "millionaire",
    freeForLife: true,
    productLimit: -1,
    orderLimit: -1,
    teamLimit: -1
  }
];

export const FREE_FOR_LIFE_THRESHOLD = 5000000; // $50,000 in cents

export const FREE_FOR_LIFE_PLAN: PricingPlan = {
  id: "free_for_life",
  name: "FREE FOR LIFE",
  nameKey: "pricing.freeForLife",
  price: 0,
  period: "forever",
  description: "Earned by reaching $50,000 in lifetime sales",
  descriptionKey: "pricing.freeForLifeDescription",
  features: [
    "Unlimited products",
    "Unlimited orders",
    "Unlimited team members",
    "All premium features",
    "VIP support forever"
  ],
  featureKeys: ["pricing.features.unlimitedProducts", "pricing.features.unlimitedOrders", "pricing.features.unlimitedTeam", "pricing.features.allPremium", "pricing.features.vipForever"],
  popular: false,
  badge: "lifetime",
  freeForLife: false,
  productLimit: -1,
  orderLimit: -1,
  teamLimit: -1
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
