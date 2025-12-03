import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Currency = {
  code: string;
  name: string;
  symbol: string;
  rate: number; // Exchange rate relative to USD
};

export const currencies: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$", rate: 1 },
  { code: "EUR", name: "Euro", symbol: "€", rate: 0.92 },
  { code: "GBP", name: "British Pound", symbol: "£", rate: 0.79 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", rate: 1.36 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", rate: 1.53 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", rate: 149.50 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", rate: 7.24 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", rate: 83.12 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", rate: 4.97 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", rate: 17.15 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", rate: 1298.50 },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", rate: 89.50 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", rate: 0.88 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", rate: 10.42 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", rate: 10.68 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", rate: 6.87 },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", rate: 3.98 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", rate: 28.85 },
  { code: "THB", name: "Thai Baht", symbol: "฿", rate: 35.12 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", rate: 15650 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", rate: 4.72 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", rate: 1.34 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", rate: 7.82 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", rate: 1.64 },
  { code: "ZAR", name: "South African Rand", symbol: "R", rate: 18.65 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", rate: 3.67 },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", rate: 3.75 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", rate: 55.85 },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", rate: 24350 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", rate: 30.90 },
];

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatPrice: (priceInUSD: number) => string;
  convertPrice: (priceInUSD: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("currency");
      if (stored) {
        const found = currencies.find((c) => c.code === stored);
        if (found) return found;
      }
    }
    return currencies[0];
  });

  useEffect(() => {
    localStorage.setItem("currency", currency.code);
  }, [currency]);

  const setCurrency = (curr: Currency) => {
    setCurrencyState(curr);
  };

  const convertPrice = (priceInUSD: number): number => {
    return priceInUSD * currency.rate;
  };

  const formatPrice = (priceInUSD: number): string => {
    const converted = convertPrice(priceInUSD);
    
    // Format based on currency
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.code,
      minimumFractionDigits: currency.rate > 100 ? 0 : 2,
      maximumFractionDigits: currency.rate > 100 ? 0 : 2,
    });
    
    return formatter.format(converted);
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        formatPrice,
        convertPrice,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
