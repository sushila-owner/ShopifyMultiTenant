import * as deepl from 'deepl-node';

export type TargetLanguageCode = 
  | 'EN' | 'EN-US' | 'EN-GB'
  | 'ES' | 'FR' | 'DE' | 'IT' | 'PT' | 'PT-BR' | 'PT-PT'
  | 'RU' | 'ZH' | 'JA' | 'KO'
  | 'AR' | 'NL' | 'PL' | 'TR' | 'ID'
  | 'BG' | 'CS' | 'DA' | 'EL' | 'ET' | 'FI' | 'HU' | 'LT' | 'LV' 
  | 'NB' | 'RO' | 'SK' | 'SL' | 'SV' | 'UK';

export const TARGET_LANG_MAP: Record<string, TargetLanguageCode> = {
  'en': 'EN',
  'es': 'ES',
  'fr': 'FR',
  'de': 'DE',
  'it': 'IT',
  'pt': 'PT',
  'ru': 'RU',
  'zh': 'ZH',
  'ja': 'JA',
  'ko': 'KO',
  'ar': 'AR',
  'nl': 'NL',
  'pl': 'PL',
  'tr': 'TR',
  'id': 'ID',
  'hi': 'EN', // Hindi not supported by DeepL, fallback to English
};

export const SOURCE_LANG_MAP: Record<string, deepl.SourceLanguageCode> = {
  'en': 'en',
  'es': 'es',
  'fr': 'fr',
  'de': 'de',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'zh': 'zh',
  'ja': 'ja',
  'ko': 'ko',
  'ar': 'ar',
  'nl': 'nl',
  'pl': 'pl',
  'tr': 'tr',
  'id': 'id',
};

interface TranslationResult {
  text: string;
  detectedSourceLang?: string;
}

interface TranslationCache {
  [key: string]: {
    text: string;
    timestamp: number;
  };
}

class DeepLService {
  private client: deepl.Translator | null = null;
  private isConfigured: boolean = false;
  private cache: TranslationCache = {};
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = process.env.DEEPL_API_KEY;
    
    if (!apiKey) {
      console.log('[DeepL] API key not configured - translation service disabled');
      this.isConfigured = false;
      return;
    }

    try {
      this.client = new deepl.Translator(apiKey);
      this.isConfigured = true;
      console.log('[DeepL] Translation service initialized successfully');
    } catch (error) {
      console.error('[DeepL] Failed to initialize:', error);
      this.isConfigured = false;
    }
  }

  isAvailable(): boolean {
    return this.isConfigured && this.client !== null;
  }

  private getCacheKey(text: string, targetLang: string): string {
    return `${targetLang}:${text.substring(0, 100)}:${text.length}`;
  }

  private getFromCache(text: string, targetLang: string): string | null {
    const key = this.getCacheKey(text, targetLang);
    const cached = this.cache[key];
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.text;
    }
    
    // Clean up expired entry
    if (cached) {
      delete this.cache[key];
    }
    
    return null;
  }

  private setCache(text: string, targetLang: string, translatedText: string): void {
    const key = this.getCacheKey(text, targetLang);
    this.cache[key] = {
      text: translatedText,
      timestamp: Date.now()
    };

    // Simple cache size management - remove oldest entries if cache gets too large
    const keys = Object.keys(this.cache);
    if (keys.length > 10000) {
      const sortedKeys = keys.sort((a, b) => this.cache[a].timestamp - this.cache[b].timestamp);
      for (let i = 0; i < 1000; i++) {
        delete this.cache[sortedKeys[i]];
      }
    }
  }

  async translateText(
    text: string,
    targetLang: string,
    sourceLang?: string
  ): Promise<TranslationResult> {
    // If target is English or same as source, return original
    if (targetLang === 'en' || targetLang === sourceLang) {
      return { text, detectedSourceLang: sourceLang || 'EN' };
    }

    // Convert to DeepL language code
    const deeplTarget = TARGET_LANG_MAP[targetLang] || 'EN';
    
    if (!this.isAvailable()) {
      console.log('[DeepL] Service not available, returning original text');
      return { text, detectedSourceLang: 'EN' };
    }

    // Check cache first
    const cached = this.getFromCache(text, deeplTarget);
    if (cached) {
      return { text: cached, detectedSourceLang: sourceLang || 'EN' };
    }

    try {
      // Detect if text contains HTML tags and enable full HTML tag handling
      const containsHtml = /<[^>]+>/g.test(text);
      const options = containsHtml ? { 
        tagHandling: 'html' as const,
        outlineDetection: false, // Prevent sentence splitting in HTML
      } : undefined;
      
      const result = await this.client!.translateText(
        text,
        sourceLang ? (SOURCE_LANG_MAP[sourceLang] || null) : null,
        deeplTarget as deepl.TargetLanguageCode,
        options
      );

      const translatedText = result.text;
      
      // Cache the result
      this.setCache(text, deeplTarget, translatedText);

      return {
        text: translatedText,
        detectedSourceLang: result.detectedSourceLang
      };
    } catch (error: any) {
      console.error('[DeepL] Translation error:', error.message);
      
      // Handle specific errors
      if (error.statusCode === 403) {
        console.error('[DeepL] Invalid API key');
      } else if (error.statusCode === 456) {
        console.error('[DeepL] Quota exceeded');
      }
      
      return { text, detectedSourceLang: 'EN' };
    }
  }

  async translateBatch(
    texts: string[],
    targetLang: string,
    sourceLang?: string
  ): Promise<TranslationResult[]> {
    if (targetLang === 'en' || !this.isAvailable()) {
      return texts.map(text => ({ text, detectedSourceLang: sourceLang || 'EN' }));
    }

    const deeplTarget = TARGET_LANG_MAP[targetLang] || 'EN';
    const results: TranslationResult[] = [];
    const toTranslate: { index: number; text: string }[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const cached = this.getFromCache(texts[i], deeplTarget);
      if (cached) {
        results[i] = { text: cached, detectedSourceLang: sourceLang || 'EN' };
      } else {
        toTranslate.push({ index: i, text: texts[i] });
      }
    }

    // If all texts were cached, return early
    if (toTranslate.length === 0) {
      return results;
    }

    try {
      // Translate in batches of 50 (DeepL limit)
      const batchSize = 50;
      for (let i = 0; i < toTranslate.length; i += batchSize) {
        const batch = toTranslate.slice(i, i + batchSize);
        const batchTexts = batch.map(item => item.text);

        // Detect if any text contains HTML tags and enable full HTML tag handling
        const containsHtml = batchTexts.some(text => /<[^>]+>/g.test(text));
        const options = containsHtml ? { 
          tagHandling: 'html' as const,
          outlineDetection: false, // Prevent sentence splitting in HTML
        } : undefined;
        
        const batchResults = await this.client!.translateText(
          batchTexts,
          sourceLang ? (SOURCE_LANG_MAP[sourceLang] || null) : null,
          deeplTarget as deepl.TargetLanguageCode,
          options
        );

        // Handle both single and array results
        const translationResults = Array.isArray(batchResults) ? batchResults : [batchResults];

        for (let j = 0; j < translationResults.length; j++) {
          const originalIndex = batch[j].index;
          const translatedText = translationResults[j].text;
          
          // Cache the result
          this.setCache(batch[j].text, deeplTarget, translatedText);
          
          results[originalIndex] = {
            text: translatedText,
            detectedSourceLang: translationResults[j].detectedSourceLang
          };
        }
      }

      // Fill in any remaining gaps with original text
      for (let i = 0; i < texts.length; i++) {
        if (!results[i]) {
          results[i] = { text: texts[i], detectedSourceLang: sourceLang || 'EN' };
        }
      }

      return results;
    } catch (error: any) {
      console.error('[DeepL] Batch translation error:', error.message);
      
      // Return original texts for failed items
      for (const item of toTranslate) {
        if (!results[item.index]) {
          results[item.index] = { text: item.text, detectedSourceLang: 'EN' };
        }
      }
      
      return results;
    }
  }

  async translateProduct(
    product: {
      title: string;
      description?: string | null;
      tags?: string[] | null;
    },
    targetLang: string
  ): Promise<{
    title: string;
    description: string | null;
    tags: string[] | null;
  }> {
    if (targetLang === 'en' || !this.isAvailable()) {
      return {
        title: product.title,
        description: product.description || null,
        tags: product.tags || null
      };
    }

    const textsToTranslate: string[] = [product.title];
    
    if (product.description) {
      // Strip HTML for cleaner translation
      const cleanDescription = this.stripHtml(product.description);
      textsToTranslate.push(cleanDescription);
    }

    if (product.tags && product.tags.length > 0) {
      textsToTranslate.push(...product.tags);
    }

    const translations = await this.translateBatch(textsToTranslate, targetLang);

    let index = 0;
    const translatedTitle = translations[index++].text;
    
    let translatedDescription: string | null = null;
    if (product.description) {
      translatedDescription = translations[index++].text;
    }

    let translatedTags: string[] | null = null;
    if (product.tags && product.tags.length > 0) {
      translatedTags = translations.slice(index).map(t => t.text);
    }

    return {
      title: translatedTitle,
      description: translatedDescription,
      tags: translatedTags
    };
  }

  private stripHtml(html: string): string {
    // Remove HTML tags but preserve text content
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  async getUsage(): Promise<{
    characterCount: number;
    characterLimit: number;
    remaining: number;
    percentage: number;
  } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const usage = await this.client!.getUsage();
      if (usage.character) {
        return {
          characterCount: usage.character.count,
          characterLimit: usage.character.limit,
          remaining: usage.character.limit - usage.character.count,
          percentage: Math.round((usage.character.count / usage.character.limit) * 100)
        };
      }
      return null;
    } catch (error: any) {
      console.error('[DeepL] Failed to get usage:', error.message);
      return null;
    }
  }

  async getSupportedLanguages(): Promise<{ source: string[]; target: string[] }> {
    if (!this.isAvailable()) {
      return { source: [], target: [] };
    }

    try {
      const [sourceLanguages, targetLanguages] = await Promise.all([
        this.client!.getSourceLanguages(),
        this.client!.getTargetLanguages()
      ]);

      return {
        source: sourceLanguages.map(lang => lang.code),
        target: targetLanguages.map(lang => lang.code)
      };
    } catch (error: any) {
      console.error('[DeepL] Failed to get languages:', error.message);
      return { source: [], target: [] };
    }
  }
}

// Singleton instance
export const deeplService = new DeepLService();
