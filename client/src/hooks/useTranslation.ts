import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";

interface TranslatedContent {
  text: string;
  isLoading: boolean;
  error: string | null;
}

interface TranslationCache {
  [key: string]: string;
}

const translationCache: TranslationCache = {};

function getCacheKey(text: string, targetLang: string): string {
  return `${targetLang}:${text.substring(0, 50)}:${text.length}`;
}

export function useTranslateText(text: string | undefined | null): TranslatedContent {
  const { language } = useI18n();
  const [translatedText, setTranslatedText] = useState<string>(text || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!text) {
      setTranslatedText("");
      return;
    }

    // If English, return original
    if (language.code === "en") {
      setTranslatedText(text);
      return;
    }

    // Check cache
    const cacheKey = getCacheKey(text, language.code);
    if (translationCache[cacheKey]) {
      setTranslatedText(translationCache[cacheKey]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const translateContent = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiRequest("POST", "/api/translation/translate", {
          text,
          targetLang: language.code,
        });

        const data = await response.json();
        
        if (data.success && data.data?.text) {
          const translated = data.data.text;
          translationCache[cacheKey] = translated;
          setTranslatedText(translated);
        } else {
          setTranslatedText(text);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Translation error:", err);
          setError(err.message);
          setTranslatedText(text); // Fallback to original
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce translation requests
    const timeoutId = setTimeout(translateContent, 300);
    return () => clearTimeout(timeoutId);
  }, [text, language.code]);

  return { text: translatedText, isLoading, error };
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
  const { language } = useI18n();
  const [translated, setTranslated] = useState<Omit<ProductTranslation, "isLoading" | "error">>({
    title: product?.title || "",
    description: product?.description || null,
    tags: product?.tags || null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) {
      setTranslated({ title: "", description: null, tags: null });
      return;
    }

    // If English, return original
    if (language.code === "en") {
      setTranslated({
        title: product.title,
        description: product.description || null,
        tags: product.tags || null,
      });
      return;
    }

    // Check cache for title
    const titleCacheKey = getCacheKey(product.title, language.code);
    const cachedTitle = translationCache[titleCacheKey];
    
    if (cachedTitle) {
      setTranslated(prev => ({ ...prev, title: cachedTitle }));
    }

    const translateProduct = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // If we have product ID, use the optimized endpoint
        if (product.id) {
          const response = await fetch(`/api/translation/product/${product.id}?lang=${language.code}`);
          const data = await response.json();
          
          if (data.success && data.data) {
            const { title, description, tags } = data.data;
            
            // Cache the results
            translationCache[titleCacheKey] = title;
            
            setTranslated({ title, description, tags });
            return;
          }
        }

        // Fallback to batch translation
        const response = await apiRequest("POST", "/api/translation/product", {
          product: {
            title: product.title,
            description: product.description,
            tags: product.tags,
          },
          targetLang: language.code,
        });

        const data = await response.json();
        
        if (data.success && data.data) {
          const { title, description, tags } = data.data;
          translationCache[titleCacheKey] = title;
          setTranslated({ title, description, tags });
        } else {
          setTranslated({
            title: product.title,
            description: product.description || null,
            tags: product.tags || null,
          });
        }
      } catch (err: any) {
        console.error("Product translation error:", err);
        setError(err.message);
        setTranslated({
          title: product.title,
          description: product.description || null,
          tags: product.tags || null,
        });
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce translation requests
    const timeoutId = setTimeout(translateProduct, 300);
    return () => clearTimeout(timeoutId);
  }, [product?.id, product?.title, language.code]);

  return { ...translated, isLoading, error };
}

interface BatchTranslation {
  translations: string[];
  isLoading: boolean;
  error: string | null;
}

export function useTranslateBatch(texts: string[]): BatchTranslation {
  const { language } = useI18n();
  const [translations, setTranslations] = useState<string[]>(texts);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!texts.length) {
      setTranslations([]);
      return;
    }

    // If English, return originals
    if (language.code === "en") {
      setTranslations(texts);
      return;
    }

    // Check cache for all texts
    const cachedResults: (string | null)[] = texts.map(text => {
      const cacheKey = getCacheKey(text, language.code);
      return translationCache[cacheKey] || null;
    });

    const allCached = cachedResults.every(r => r !== null);
    if (allCached) {
      setTranslations(cachedResults as string[]);
      return;
    }

    const translateBatch = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiRequest("POST", "/api/translation/translate", {
          texts,
          targetLang: language.code,
        });

        const data = await response.json();
        
        if (data.success && data.data?.translations) {
          const translated = data.data.translations.map((t: { text: string }, i: number) => {
            const cacheKey = getCacheKey(texts[i], language.code);
            translationCache[cacheKey] = t.text;
            return t.text;
          });
          setTranslations(translated);
        } else {
          setTranslations(texts);
        }
      } catch (err: any) {
        console.error("Batch translation error:", err);
        setError(err.message);
        setTranslations(texts);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(translateBatch, 300);
    return () => clearTimeout(timeoutId);
  }, [texts.join(","), language.code]);

  return { translations, isLoading, error };
}

export function useTranslationStatus() {
  const [status, setStatus] = useState<{
    available: boolean;
    usage: { characterCount: number; characterLimit: number; remaining: number; percentage: number } | null;
    message: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch("/api/translation/status");
        const data = await response.json();
        if (data.success) {
          setStatus(data.data);
        }
      } catch (err) {
        console.error("Failed to check translation status:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, []);

  return { status, isLoading };
}

export function clearTranslationCache(): void {
  Object.keys(translationCache).forEach(key => {
    delete translationCache[key];
  });
}
