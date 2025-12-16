// Simplified currency display - USD only
// This component is kept for backward compatibility

import { DollarSign } from "lucide-react";

export function CurrencySwitcher() {
  return (
    <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground px-2" data-testid="display-currency-usd">
      <DollarSign className="h-4 w-4" />
      <span>USD</span>
    </div>
  );
}
