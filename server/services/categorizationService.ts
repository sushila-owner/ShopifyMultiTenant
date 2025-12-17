import { db } from '../db';
import { categories, suppliers } from '@shared/schema';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

interface CategoryMatch {
  categoryId: number;
  categoryName: string;
  confidence: number;
  method: 'keyword' | 'ai' | 'fallback';
}

interface CategoryKeywords {
  categoryName: string;
  keywords: string[];
  excludeKeywords?: string[];
}

const GIGAB2B_CATEGORY_KEYWORDS: CategoryKeywords[] = [
  { categoryName: "Sofas", keywords: ["sofa", "couch", "sectional", "loveseat", "settee", "divan", "futon sofa", "sleeper sofa", "chesterfield"], excludeKeywords: ["sofa table", "sofa cover", "sofa leg"] },
  { categoryName: "Chairs", keywords: ["chair", "armchair", "recliner", "rocker", "lounge chair", "accent chair", "dining chair", "office chair", "gaming chair", "rocking chair"], excludeKeywords: ["chairlift", "wheelchair"] },
  { categoryName: "Tables", keywords: ["table", "dining table", "coffee table", "side table", "end table", "console table", "nightstand", "bedside table", "accent table"], excludeKeywords: ["table lamp", "tablecloth", "table runner"] },
  { categoryName: "Beds", keywords: ["bed", "bed frame", "platform bed", "bunk bed", "daybed", "trundle bed", "murphy bed", "canopy bed", "sleigh bed", "poster bed"], excludeKeywords: ["bedding", "bed sheet", "bed cover", "flower bed", "pet bed"] },
  { categoryName: "Cabinets", keywords: ["cabinet", "cupboard", "sideboard", "buffet cabinet", "display cabinet", "china cabinet", "bar cabinet", "storage cabinet", "file cabinet"], excludeKeywords: ["cabinet hardware", "cabinet knob"] },
  { categoryName: "Wardrobes", keywords: ["wardrobe", "armoire", "closet", "clothes cabinet", "garment rack"], excludeKeywords: [] },
  { categoryName: "Storage Units", keywords: ["storage unit", "storage box", "storage bin", "organizer", "storage rack", "cube storage", "storage basket"], excludeKeywords: [] },
  { categoryName: "TV Units", keywords: ["tv stand", "tv unit", "tv cabinet", "entertainment center", "media console", "tv table", "media stand", "entertainment unit"], excludeKeywords: [] },
  { categoryName: "Shelving", keywords: ["shelf", "shelving", "bookshelf", "bookcase", "wall shelf", "floating shelf", "ladder shelf", "corner shelf", "display shelf"], excludeKeywords: [] },
  { categoryName: "Desks", keywords: ["desk", "writing desk", "computer desk", "study desk", "home office desk", "executive desk", "standing desk", "work desk", "l-shaped desk"], excludeKeywords: ["desk lamp", "desk pad", "desk organizer", "desk chair"] },
  { categoryName: "Benches", keywords: ["bench", "entryway bench", "storage bench", "garden bench", "dining bench", "window bench", "shoe bench"], excludeKeywords: ["bench press", "weight bench", "workout bench"] },
  { categoryName: "Stools", keywords: ["stool", "bar stool", "counter stool", "kitchen stool", "vanity stool", "step stool", "saddle stool"], excludeKeywords: [] },
  { categoryName: "Ottomans", keywords: ["ottoman", "footstool", "pouf", "footrest", "tufted ottoman", "storage ottoman"], excludeKeywords: [] },
  { categoryName: "Mattresses", keywords: ["mattress", "memory foam mattress", "spring mattress", "hybrid mattress", "latex mattress", "mattress topper", "foam mattress"], excludeKeywords: ["mattress cover", "mattress protector", "mattress pad"] },
  { categoryName: "Fans", keywords: ["fan", "ceiling fan", "pedestal fan", "tower fan", "box fan", "desk fan", "standing fan", "floor fan", "oscillating fan", "bladeless fan"], excludeKeywords: ["fan blade", "fan cover"] },
  { categoryName: "Appliances", keywords: ["appliance", "blender", "mixer", "toaster", "microwave", "air fryer", "coffee maker", "kettle", "juicer", "food processor", "vacuum", "iron", "heater", "humidifier", "dehumidifier", "air purifier"], excludeKeywords: [] },
  { categoryName: "Gym Equipment", keywords: ["gym equipment", "dumbbell", "barbell", "kettlebell", "weight plate", "resistance band", "pull up bar", "squat rack", "power rack", "weight bench", "bench press"], excludeKeywords: [] },
  { categoryName: "Fitness Machines", keywords: ["treadmill", "elliptical", "exercise bike", "stationary bike", "rowing machine", "stair climber", "cross trainer", "spin bike", "recumbent bike", "home gym"], excludeKeywords: [] },
  { categoryName: "Exercise Accessories", keywords: ["yoga mat", "exercise mat", "resistance band", "jump rope", "foam roller", "exercise ball", "ab wheel", "grip strengthener", "ankle weights", "wrist weights", "workout gloves", "fitness tracker"], excludeKeywords: [] },
  { categoryName: "Outdoor Furniture", keywords: ["patio furniture", "outdoor furniture", "garden furniture", "patio set", "outdoor table", "outdoor chair", "patio chair", "garden bench", "outdoor lounge", "deck furniture", "poolside"], excludeKeywords: [] },
  { categoryName: "Tents", keywords: ["tent", "camping tent", "pop up tent", "dome tent", "cabin tent", "backpacking tent", "family tent", "beach tent", "canopy tent"], excludeKeywords: [] },
  { categoryName: "Gazebos", keywords: ["gazebo", "pergola", "pavilion", "outdoor canopy", "garden gazebo", "patio gazebo", "pop up gazebo"], excludeKeywords: [] },
  { categoryName: "Camping Equipment", keywords: ["camping", "sleeping bag", "camp stove", "camping lantern", "camping chair", "cooler", "camping gear", "camp cot", "camping cookware", "headlamp"], excludeKeywords: [] },
  { categoryName: "Travel Gear", keywords: ["luggage", "suitcase", "travel bag", "backpack", "duffel bag", "carry on", "travel pillow", "packing cubes", "travel organizer", "passport holder", "travel wallet"], excludeKeywords: [] },
  { categoryName: "Kids Furniture", keywords: ["kids furniture", "children furniture", "toddler bed", "kids desk", "kids chair", "bunk bed", "loft bed", "kids bookshelf", "toy storage", "kids table", "nursery furniture", "crib", "baby crib", "changing table"], excludeKeywords: [] },
  { categoryName: "Ride-On Toys", keywords: ["ride on", "ride-on", "electric car", "kids car", "pedal car", "power wheels", "kids motorcycle", "kids scooter", "balance bike", "tricycle", "kids atv"], excludeKeywords: [] },
  { categoryName: "Playsets", keywords: ["playset", "play set", "swing set", "playground", "climbing frame", "jungle gym", "play structure", "outdoor playset", "backyard playset"], excludeKeywords: [] },
  { categoryName: "Swings", keywords: ["swing", "baby swing", "porch swing", "tree swing", "hammock swing", "swing chair", "kids swing", "garden swing", "nest swing"], excludeKeywords: ["swing set"] },
  { categoryName: "Toys", keywords: ["toy", "toys", "action figure", "doll", "stuffed animal", "plush", "board game", "puzzle", "building blocks", "lego", "remote control", "rc car", "drone toy"], excludeKeywords: ["toy storage", "toy box", "toy chest"] },
  { categoryName: "Pet Furniture", keywords: ["pet furniture", "dog bed", "cat bed", "pet bed", "dog couch", "cat tree", "pet sofa", "dog crate furniture", "pet stairs", "dog ramp"], excludeKeywords: [] },
  { categoryName: "Pet Houses", keywords: ["pet house", "dog house", "cat house", "pet shelter", "outdoor dog house", "insulated dog house", "dog kennel", "cat condo"], excludeKeywords: [] },
  { categoryName: "Pet Enclosures", keywords: ["pet enclosure", "dog pen", "puppy playpen", "cat enclosure", "rabbit hutch", "chicken coop", "pet gate", "dog gate", "pet fence", "dog run"], excludeKeywords: [] },
  { categoryName: "Pet Accessories", keywords: ["pet accessory", "dog bowl", "cat bowl", "pet feeder", "pet fountain", "dog leash", "cat collar", "pet carrier", "dog crate", "pet toy", "dog toy", "cat toy", "pet grooming"], excludeKeywords: [] },
];

const SHOPIFY_CATEGORY_KEYWORDS: CategoryKeywords[] = [
  { categoryName: "Designer Clothing", keywords: ["clothing", "dress", "shirt", "blouse", "jacket", "coat", "sweater", "cardigan", "pants", "trousers", "jeans", "skirt", "suit", "blazer", "vest", "top", "t-shirt", "hoodie", "polo", "knitwear", "outerwear", "designer"], excludeKeywords: ["shoe", "bag", "watch", "jewelry", "perfume", "fragrance"] },
  { categoryName: "Luxury Footwear", keywords: ["shoe", "shoes", "sneaker", "sneakers", "boot", "boots", "heel", "heels", "loafer", "loafers", "sandal", "sandals", "slipper", "slippers", "oxford", "pump", "pumps", "mule", "mules", "footwear", "trainer", "trainers", "espadrille"], excludeKeywords: [] },
  { categoryName: "Premium Handbags & Wallets", keywords: ["handbag", "bag", "purse", "tote", "clutch", "wallet", "satchel", "crossbody", "shoulder bag", "backpack", "briefcase", "messenger", "pouch", "card holder", "cardholder", "coin purse", "travel bag"], excludeKeywords: ["sleeping bag", "tea bag", "bag charm"] },
  { categoryName: "Fashion Accessories", keywords: ["belt", "scarf", "sunglasses", "hat", "cap", "tie", "bow tie", "glove", "gloves", "umbrella", "keychain", "hair accessory", "headband", "beanie", "beret", "fedora", "bandana", "shawl", "wrap", "accessory", "accessories"], excludeKeywords: ["bag", "watch", "jewelry", "earring", "necklace", "bracelet", "ring", "perfume"] },
  { categoryName: "Luxury Watches", keywords: ["watch", "watches", "timepiece", "chronograph", "wristwatch", "smartwatch", "automatic watch", "quartz watch", "dive watch", "sports watch", "dress watch"], excludeKeywords: ["watch strap", "watch band", "watch case", "apple watch"] },
  { categoryName: "Jewelry", keywords: ["jewelry", "jewellery", "necklace", "bracelet", "ring", "earring", "earrings", "pendant", "charm", "brooch", "cufflink", "cufflinks", "anklet", "bangle", "chain", "diamond", "gold", "silver", "pearl", "gemstone"], excludeKeywords: ["jewelry box", "jewelry case"] },
  { categoryName: "Beauty & Cosmetics", keywords: ["makeup", "cosmetic", "cosmetics", "lipstick", "foundation", "mascara", "eyeshadow", "blush", "concealer", "primer", "skincare", "serum", "moisturizer", "cleanser", "toner", "cream", "lotion", "beauty", "nail polish", "eyeliner"], excludeKeywords: ["beauty case", "fragrance", "perfume", "cologne"] },
  { categoryName: "Fragrances / Perfumes", keywords: ["perfume", "fragrance", "cologne", "eau de toilette", "eau de parfum", "scent", "body spray", "body mist", "aftershave", "parfum", "edp", "edt"], excludeKeywords: ["home fragrance", "candle", "diffuser"] },
];

class CategorizationService {
  private categoryCache: Map<number, { id: number; name: string }[]> = new Map();
  private aiResultCache: Map<string, CategoryMatch> = new Map();
  private anthropic: Anthropic | null = null;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic();
    }
  }

  async getCategoriesForSupplier(supplierId: number): Promise<{ id: number; name: string }[]> {
    if (this.categoryCache.has(supplierId)) {
      return this.categoryCache.get(supplierId)!;
    }

    const cats = await db.select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.supplierId, supplierId));
    
    this.categoryCache.set(supplierId, cats);
    return cats;
  }

  async categorizeProduct(
    supplierId: number,
    supplierType: 'gigab2b' | 'shopify',
    title: string,
    description?: string,
    rawCategory?: string
  ): Promise<CategoryMatch | null> {
    const supplierCategories = await this.getCategoriesForSupplier(supplierId);
    if (supplierCategories.length === 0) {
      return null;
    }

    const keywords = supplierType === 'gigab2b' ? GIGAB2B_CATEGORY_KEYWORDS : SHOPIFY_CATEGORY_KEYWORDS;
    const searchText = `${title} ${description || ''} ${rawCategory || ''}`.toLowerCase();

    const match = this.matchByKeywords(searchText, keywords, supplierCategories);
    if (match && match.confidence >= 0.7) {
      return match;
    }

    if (this.anthropic && process.env.ANTHROPIC_API_KEY) {
      const cacheKey = `${supplierId}:${title.toLowerCase().substring(0, 100)}`;
      if (this.aiResultCache.has(cacheKey)) {
        return this.aiResultCache.get(cacheKey)!;
      }

      const aiMatch = await this.categorizeWithAI(title, description, rawCategory, supplierCategories);
      if (aiMatch) {
        this.aiResultCache.set(cacheKey, aiMatch);
        return aiMatch;
      }
    }

    if (match) {
      return match;
    }

    return null;
  }

  private matchByKeywords(
    searchText: string,
    keywordRules: CategoryKeywords[],
    supplierCategories: { id: number; name: string }[]
  ): CategoryMatch | null {
    let bestMatch: { categoryName: string; score: number } | null = null;

    for (const rule of keywordRules) {
      const hasExcluded = rule.excludeKeywords?.some(kw => searchText.includes(kw.toLowerCase()));
      if (hasExcluded) continue;

      let matchCount = 0;
      let strongMatch = false;

      for (const keyword of rule.keywords) {
        const kwLower = keyword.toLowerCase();
        if (searchText.includes(kwLower)) {
          matchCount++;
          if (keyword.length > 5 || searchText.includes(` ${kwLower} `) || 
              searchText.startsWith(kwLower) || searchText.includes(`${kwLower},`)) {
            strongMatch = true;
          }
        }
      }

      if (matchCount > 0) {
        const score = strongMatch ? 0.9 : (matchCount >= 2 ? 0.8 : 0.6);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { categoryName: rule.categoryName, score };
        }
      }
    }

    if (bestMatch) {
      const category = supplierCategories.find(c => 
        c.name.toLowerCase() === bestMatch!.categoryName.toLowerCase()
      );
      if (category) {
        return {
          categoryId: category.id,
          categoryName: category.name,
          confidence: bestMatch.score,
          method: 'keyword'
        };
      }
    }

    return null;
  }

  private async categorizeWithAI(
    title: string,
    description: string | undefined,
    rawCategory: string | undefined,
    supplierCategories: { id: number; name: string }[]
  ): Promise<CategoryMatch | null> {
    if (!this.anthropic) return null;

    try {
      const categoryList = supplierCategories.map(c => c.name).join(', ');
      const prompt = `You are a product categorization assistant. Given a product, determine which category it belongs to.

Available categories: ${categoryList}

Product title: ${title}
${description ? `Description: ${description.substring(0, 500)}` : ''}
${rawCategory ? `Original category: ${rawCategory}` : ''}

Respond with ONLY the exact category name from the list above that best matches this product. If none match well, respond with "NONE".`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      });

      const aiCategory = (response.content[0] as any).text?.trim();
      
      if (aiCategory && aiCategory !== 'NONE') {
        const category = supplierCategories.find(c => 
          c.name.toLowerCase() === aiCategory.toLowerCase()
        );
        if (category) {
          return {
            categoryId: category.id,
            categoryName: category.name,
            confidence: 0.85,
            method: 'ai'
          };
        }
      }
    } catch (error) {
      console.error('[Categorization] AI categorization failed:', error);
    }

    return null;
  }

  clearCache(): void {
    this.categoryCache.clear();
    this.aiResultCache.clear();
  }
}

export const categorizationService = new CategorizationService();
