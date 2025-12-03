import { useI18n, languages } from "@/lib/i18n";
import { useCurrency, currencies } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe, Languages, Coins, Check } from "lucide-react";
import { useState } from "react";

export function GlobeSettings() {
  const { language, setLanguage, t } = useI18n();
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1.5 px-2 font-medium text-muted-foreground hover:text-foreground" 
          data-testid="button-globe-settings"
        >
          <Globe className="h-4 w-4" />
          <span className="text-sm">{language.code.toUpperCase()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Tabs defaultValue="language" className="w-full">
          <div className="border-b px-3 py-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="language" className="gap-2" data-testid="tab-language">
                <Languages className="h-4 w-4" />
                {t("settings.language") || "Language"}
              </TabsTrigger>
              <TabsTrigger value="currency" className="gap-2" data-testid="tab-currency">
                <Coins className="h-4 w-4" />
                {t("settings.currency") || "Currency"}
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="language" className="mt-0">
            <ScrollArea className="h-[280px]">
              <div className="p-2 space-y-1">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors hover-elevate ${
                      language.code === lang.code 
                        ? "bg-primary/10 text-primary" 
                        : "hover:bg-accent"
                    }`}
                    data-testid={`globe-language-${lang.code}`}
                  >
                    <span className="w-8 text-xs font-bold uppercase text-muted-foreground">
                      {lang.code}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">{lang.nativeName}</div>
                      <div className="text-xs text-muted-foreground">{lang.name}</div>
                    </div>
                    {language.code === lang.code && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="currency" className="mt-0">
            <ScrollArea className="h-[280px]">
              <div className="p-2 space-y-1">
                {currencies.map((curr) => (
                  <button
                    key={curr.code}
                    onClick={() => {
                      setCurrency(curr);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors hover-elevate ${
                      currency.code === curr.code 
                        ? "bg-primary/10 text-primary" 
                        : "hover:bg-accent"
                    }`}
                    data-testid={`globe-currency-${curr.code}`}
                  >
                    <span className="w-8 text-lg font-semibold">
                      {curr.symbol}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">{curr.code}</div>
                      <div className="text-xs text-muted-foreground">{curr.name}</div>
                    </div>
                    {currency.code === curr.code && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

export function CurrencyDisplay() {
  const { currency } = useCurrency();
  
  return (
    <div 
      className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
      data-testid="display-currency"
    >
      <span className="text-base">{currency.symbol}</span>
      <span>{currency.code}</span>
    </div>
  );
}
