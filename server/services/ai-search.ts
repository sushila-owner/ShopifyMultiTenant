import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { products, suppliers } from "@shared/schema";
import { sql, ilike, or, and, isNull, eq } from "drizzle-orm";

const anthropic = new Anthropic();

interface SearchResult {
  products: any[];
  searchTerms: string[];
  suggestion?: string;
  totalFound: number;
}

interface SearchIntent {
  keywords: string[];
  category?: string;
  priceRange?: { min?: number; max?: number };
  attributes: string[];
  suggestion?: string;
}

export async function aiProductSearch(
  query: string,
  options: {
    limit?: number;
    merchantId?: number;
    isGlobal?: boolean;
  } = {}
): Promise<SearchResult> {
  const { limit = 50, merchantId, isGlobal = true } = options;

  try {
    const searchIntent = await analyzeSearchIntent(query);
    const matchedProducts = await searchProducts(searchIntent, {
      limit,
      merchantId,
      isGlobal,
    });

    return {
      products: matchedProducts,
      searchTerms: searchIntent.keywords,
      suggestion: searchIntent.suggestion,
      totalFound: matchedProducts.length,
    };
  } catch (error) {
    console.error("AI search error:", error);
    return fallbackSearch(query, { limit, merchantId, isGlobal });
  }
}

async function analyzeSearchIntent(query: string): Promise<SearchIntent> {
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 500,
    system: "You are a search query analyzer. Extract search intent and return valid JSON only. No markdown, no explanation.",
    messages: [
      {
        role: "user",
        content: `Analyze this product search query and extract search intent. Return JSON only.

Query: "${query}"

Return a JSON object with:
- keywords: array of relevant search terms (synonyms, related terms, variations)
- category: product category if identifiable (optional)
- priceRange: { min, max } if price mentioned (optional)
- attributes: array of product attributes mentioned (color, size, material, etc.)
- suggestion: a helpful search tip if the query is vague (optional)

Example for "cheap blue running shoes":
{
  "keywords": ["running shoes", "athletic shoes", "sneakers", "joggers", "trainers"],
  "category": "footwear",
  "priceRange": { "max": 50 },
  "attributes": ["blue", "running", "athletic"],
  "suggestion": null
}

Return ONLY valid JSON, no markdown or explanation.`,
      },
    ],
  });

  try {
    const content = message.content[0];
    if (content.type === "text") {
      const parsed = JSON.parse(content.text);
      return {
        keywords: parsed.keywords || [query],
        category: parsed.category,
        priceRange: parsed.priceRange,
        attributes: parsed.attributes || [],
        suggestion: parsed.suggestion,
      };
    }
  } catch (e) {
    console.error("Failed to parse AI response:", e);
  }

  return {
    keywords: query.split(" ").filter((w) => w.length > 2),
    attributes: [],
  };
}

async function searchProducts(
  intent: SearchIntent,
  options: { limit: number; merchantId?: number; isGlobal?: boolean }
): Promise<any[]> {
  const { limit, merchantId, isGlobal } = options;

  const searchConditions: any[] = [];

  for (const keyword of intent.keywords.slice(0, 5)) {
    searchConditions.push(ilike(products.title, `%${keyword}%`));
    searchConditions.push(ilike(products.description, `%${keyword}%`));
    searchConditions.push(ilike(products.category, `%${keyword}%`));
  }

  for (const attr of intent.attributes.slice(0, 3)) {
    searchConditions.push(ilike(products.title, `%${attr}%`));
    searchConditions.push(ilike(products.description, `%${attr}%`));
  }

  if (intent.category) {
    searchConditions.push(ilike(products.category, `%${intent.category}%`));
  }

  // Guard against empty search conditions
  if (searchConditions.length === 0) {
    return [];
  }

  let whereClause;
  if (isGlobal) {
    whereClause = and(
      eq(products.isGlobal, true),
      isNull(products.merchantId),
      or(...searchConditions)
    );
  } else if (merchantId) {
    whereClause = and(eq(products.merchantId, merchantId), or(...searchConditions));
  } else {
    whereClause = or(...searchConditions);
  }

  let query = db
    .select()
    .from(products)
    .where(whereClause)
    .limit(limit);

  const results = await query;

  if (intent.priceRange) {
    return results.filter((p) => {
      const price = p.supplierPrice;
      if (intent.priceRange!.min && price < intent.priceRange!.min) return false;
      if (intent.priceRange!.max && price > intent.priceRange!.max) return false;
      return true;
    });
  }

  return results;
}

async function fallbackSearch(
  query: string,
  options: { limit: number; merchantId?: number; isGlobal?: boolean }
): Promise<SearchResult> {
  const { limit, merchantId, isGlobal } = options;
  const words = query.split(" ").filter((w) => w.length > 2);

  const searchConditions = words.flatMap((word) => [
    ilike(products.title, `%${word}%`),
    ilike(products.description, `%${word}%`),
    ilike(products.category, `%${word}%`),
  ]);

  let whereClause;
  if (isGlobal) {
    whereClause = and(
      eq(products.isGlobal, true),
      isNull(products.merchantId),
      or(...searchConditions)
    );
  } else if (merchantId) {
    whereClause = and(eq(products.merchantId, merchantId), or(...searchConditions));
  } else {
    whereClause = or(...searchConditions);
  }

  const results = await db
    .select()
    .from(products)
    .where(whereClause)
    .limit(limit);

  return {
    products: results,
    searchTerms: words,
    totalFound: results.length,
  };
}

export async function getSearchSuggestions(partialQuery: string): Promise<string[]> {
  if (partialQuery.length < 2) return [];

  const results = await db
    .select({ title: products.title, category: products.category })
    .from(products)
    .where(
      and(
        eq(products.isGlobal, true),
        isNull(products.merchantId),
        or(
          ilike(products.title, `%${partialQuery}%`),
          ilike(products.category, `%${partialQuery}%`)
        )
      )
    )
    .limit(10);

  const suggestions = new Set<string>();
  
  for (const r of results) {
    if (r.title.toLowerCase().includes(partialQuery.toLowerCase())) {
      const words = r.title.split(" ");
      for (const word of words) {
        if (word.toLowerCase().startsWith(partialQuery.toLowerCase())) {
          suggestions.add(word.toLowerCase());
        }
      }
    }
    if (r.category && r.category.toLowerCase().includes(partialQuery.toLowerCase())) {
      suggestions.add(r.category.toLowerCase());
    }
  }

  return Array.from(suggestions).slice(0, 5);
}
