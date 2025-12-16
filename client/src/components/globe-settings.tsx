// Simplified settings component - English and USD only
// This component is kept for backward compatibility but shows minimal options

export function GlobeSettings() {
  return null;
}

export function CurrencyDisplay() {
  return (
    <div 
      className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
      data-testid="display-currency"
    >
      <span className="text-base">$</span>
      <span>USD</span>
    </div>
  );
}
