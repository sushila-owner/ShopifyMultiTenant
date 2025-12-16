// Simplified USD-only currency formatting
// App uses English and US Dollar only

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

// Legacy compatibility - useCurrency hook that returns USD-only formatting
export function useCurrency() {
  return {
    currency: { code: "USD", name: "US Dollar", symbol: "$", rate: 1 },
    setCurrency: () => {},
    formatPrice,
    convertPrice: (price: number) => price,
  };
}

// Legacy compatibility - CurrencyProvider that just renders children
export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
