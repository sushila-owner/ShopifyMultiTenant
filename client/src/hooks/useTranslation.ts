// Simplified translation hooks - English only
// These hooks return text as-is without translation API calls

interface TranslatedContent {
  text: string;
  isLoading: boolean;
  error: string | null;
}

export function useTranslateText(text: string | undefined | null): TranslatedContent {
  return { 
    text: text || "", 
    isLoading: false, 
    error: null 
  };
}

interface ProductTranslation {
  title: string;
  description: string | null;
  tags: string[] | null;
  isLoading: boolean;
  error: string | null;
}

export function useTranslateProduct(product: {
  id?: number;
  title: string;
  description?: string | null;
  tags?: string[] | null;
} | null): ProductTranslation {
  return {
    title: product?.title || "",
    description: product?.description || null,
    tags: product?.tags || null,
    isLoading: false,
    error: null,
  };
}

interface BatchTranslation {
  translations: string[];
  isLoading: boolean;
  error: string | null;
}

export function useTranslateBatch(texts: string[]): BatchTranslation {
  return { 
    translations: texts, 
    isLoading: false, 
    error: null 
  };
}

export function useTranslationStatus() {
  return { 
    status: {
      available: false,
      usage: null,
      message: "Translation disabled - English only mode",
    }, 
    isLoading: false 
  };
}

export function clearTranslationCache(): void {
  // No-op in English-only mode
}
