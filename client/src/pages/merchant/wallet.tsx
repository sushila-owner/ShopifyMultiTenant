import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Wallet,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  CreditCard,
  History,
  DollarSign,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import type { WalletBalance, WalletTransaction } from "@shared/schema";
import { format, type Locale } from "date-fns";
import { enUS, es, fr, de, zhCN, ja, ar, ko, pt, ru, hi, it } from "date-fns/locale";
import { loadStripe } from "@stripe/stripe-js";

const dateLocales: Record<string, Locale> = {
  en: enUS,
  es: es,
  fr: fr,
  de: de,
  zh: zhCN,
  ja: ja,
  ar: ar,
  ko: ko,
  pt: pt,
  ru: ru,
  hi: hi,
  it: it,
};
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");

interface WalletData {
  balanceCents: number;
  pendingCents: number;
  currency: string;
}

interface TransactionsData {
  transactions: WalletTransaction[];
  total: number;
}

const PRESET_AMOUNTS = [
  { label: "$25", value: 2500 },
  { label: "$50", value: 5000 },
  { label: "$100", value: 10000 },
  { label: "$250", value: 25000 },
  { label: "$500", value: 50000 },
  { label: "$1,000", value: 100000 },
];

function AddFundsForm({ 
  clientSecret, 
  paymentIntentId,
  amount,
  onSuccess,
  t
}: { 
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  onSuccess: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isElementReady, setIsElementReady] = useState(false);
  const { toast } = useToast();
  const amountFormatted = `$${(amount / 100).toFixed(2)}`;

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/wallet/confirm", { paymentIntentId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
      toast({
        title: t("merchant.wallet.fundsAdded"),
        description: t("merchant.wallet.addedToWallet", { amount: amountFormatted }),
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: t("merchant.wallet.confirmationFailed"),
        description: error.message || t("merchant.wallet.failedToCreatePayment"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !isElementReady) {
      toast({
        title: t("merchant.wallet.pleaseWait"),
        description: t("merchant.wallet.paymentFormLoading"),
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (error) {
      toast({
        title: t("merchant.wallet.paymentFailed"),
        description: error.message || t("merchant.wallet.paymentNotProcessed"),
        variant: "destructive",
      });
      setIsProcessing(false);
    } else {
      confirmMutation.mutate();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isElementReady && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">{t("merchant.wallet.loadingPaymentForm")}</span>
        </div>
      )}
      <div className={isElementReady ? "" : "opacity-0 h-0 overflow-hidden"}>
        <PaymentElement onReady={() => setIsElementReady(true)} />
      </div>
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || !isElementReady || isProcessing || confirmMutation.isPending}
        data-testid="button-confirm-payment"
      >
        {isProcessing || confirmMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("merchant.wallet.processing")}
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            {t("merchant.wallet.pay")} {amountFormatted}
          </>
        )}
      </Button>
    </form>
  );
}

function AddFundsModal({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();

  const amount = selectedAmount || (parseFloat(customAmount) * 100);

  const topUpMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/wallet/top-up", { amountCents: amount });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.data?.clientSecret) {
        setClientSecret(data.data.clientSecret);
        setPaymentIntentId(data.data.paymentIntentId);
      }
    },
    onError: (error: any) => {
      toast({
        title: t("merchant.wallet.error"),
        description: error.message || t("merchant.wallet.failedToCreatePayment"),
        variant: "destructive",
      });
    },
  });

  const handleProceed = () => {
    if (amount < 500) {
      toast({
        title: t("merchant.wallet.invalidAmount"),
        description: t("merchant.wallet.minimumTopup"),
        variant: "destructive",
      });
      return;
    }
    topUpMutation.mutate();
  };

  const handleSuccess = () => {
    setClientSecret(null);
    setPaymentIntentId(null);
    setSelectedAmount(null);
    setCustomAmount("");
    onOpenChange(false);
  };

  const handleClose = () => {
    setClientSecret(null);
    setPaymentIntentId(null);
    setSelectedAmount(null);
    setCustomAmount("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {t("merchant.wallet.addFundsTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("merchant.wallet.addFundsDescription")}
          </DialogDescription>
        </DialogHeader>

        {!clientSecret ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <Button
                  key={preset.value}
                  variant={selectedAmount === preset.value ? "default" : "outline"}
                  onClick={() => {
                    setSelectedAmount(preset.value);
                    setCustomAmount("");
                  }}
                  data-testid={`button-amount-${preset.value}`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("merchant.wallet.enterCustomAmount")}</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="5"
                  max="10000"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-9"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setSelectedAmount(null);
                  }}
                  data-testid="input-custom-amount"
                />
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={handleProceed}
              disabled={(!selectedAmount && !customAmount) || topUpMutation.isPending}
              data-testid="button-proceed-payment"
            >
              {topUpMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("merchant.wallet.processing")}
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {t("merchant.wallet.proceedToPayment")}
                </>
              )}
            </Button>
          </div>
        ) : (
          <Elements 
            stripe={stripePromise} 
            options={{ 
              clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#2563eb",
                },
              },
            }}
          >
            <AddFundsForm 
              clientSecret={clientSecret} 
              paymentIntentId={paymentIntentId!}
              amount={amount}
              onSuccess={handleSuccess}
              t={t}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TransactionRow({ transaction }: { transaction: WalletTransaction }) {
  const isCredit = transaction.type === "credit" || transaction.type === "refund";
  const { t, language } = useI18n();
  const locale = dateLocales[language] || enUS;
  
  const getTransactionDescription = () => {
    switch (transaction.type) {
      case "credit":
        return t("merchant.wallet.walletTopup");
      case "debit":
        return t("merchant.wallet.orderPayment");
      case "refund":
        return t("merchant.wallet.orderRefund");
      default:
        return transaction.description;
    }
  };
  
  return (
    <div 
      className="flex items-center justify-between py-4 border-b last:border-0"
      data-testid={`row-transaction-${transaction.id}`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${isCredit ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
          {isCredit ? (
            <ArrowUpCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : (
            <ArrowDownCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
        </div>
        <div>
          <p className="font-medium">{getTransactionDescription()}</p>
          <p className="text-sm text-muted-foreground">
            {format(new Date(transaction.createdAt), "PPpp", { locale })}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-semibold ${isCredit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {isCredit ? "+" : "-"}${(transaction.amountCents / 100).toFixed(2)}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("merchant.wallet.balance")}: ${(transaction.balanceAfterCents / 100).toFixed(2)}
        </p>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const { formatPrice } = useCurrency();
  const { t } = useI18n();

  const { data: balanceData, isLoading: balanceLoading, refetch: refetchBalance } = useQuery<{ data: WalletData }>({
    queryKey: ["/api/wallet/balance"],
  });

  const { data: transactionsData, isLoading: transactionsLoading, refetch: refetchTransactions } = useQuery<{ data: TransactionsData }>({
    queryKey: ["/api/wallet/transactions"],
  });

  const balance = balanceData?.data;
  const transactions = transactionsData?.data?.transactions || [];

  const handleRefresh = () => {
    refetchBalance();
    refetchTransactions();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("merchant.wallet.title")}</h1>
          <p className="text-muted-foreground">
            {t("merchant.wallet.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleRefresh}
            data-testid="button-refresh-wallet"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setAddFundsOpen(true)} data-testid="button-add-funds">
            <Plus className="mr-2 h-4 w-4" />
            {t("merchant.wallet.addFunds")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card data-testid="card-wallet-balance">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">{t("merchant.wallet.availableBalance")}</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-3xl font-bold text-primary" data-testid="text-balance">
                ${((balance?.balanceCents || 0) / 100).toFixed(2)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t("merchant.wallet.readyForPayments")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">{t("merchant.wallet.pending")}</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-3xl font-bold" data-testid="text-pending">
                ${((balance?.pendingCents || 0) / 100).toFixed(2)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t("merchant.wallet.reservedForOrders")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">{t("merchant.wallet.totalTransactions")}</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold" data-testid="text-transaction-count">
                {transactionsData?.data?.total || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t("merchant.wallet.creditsDebitsRefunds")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("merchant.wallet.transactionHistory")}</CardTitle>
              <CardDescription>
                {t("merchant.wallet.recentActivity")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between py-4 border-b">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div>
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="text-right">
                    <Skeleton className="h-4 w-16 mb-2" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12" data-testid="empty-transactions">
              <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("merchant.wallet.noTransactions")}</h3>
              <p className="text-muted-foreground mb-4">
                {t("merchant.wallet.addFundsToStart")}
              </p>
              <Button onClick={() => setAddFundsOpen(true)} data-testid="button-add-funds-empty">
                <Plus className="mr-2 h-4 w-4" />
                {t("merchant.wallet.addFunds")}
              </Button>
            </div>
          ) : (
            <div data-testid="transactions-list">
              {transactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            {t("merchant.wallet.howItWorks")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                1
              </div>
              <div>
                <h4 className="font-medium">{t("merchant.wallet.step1Title")}</h4>
                <p className="text-sm text-muted-foreground">
                  {t("merchant.wallet.step1Description")}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                2
              </div>
              <div>
                <h4 className="font-medium">{t("merchant.wallet.step2Title")}</h4>
                <p className="text-sm text-muted-foreground">
                  {t("merchant.wallet.step2Description")}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                3
              </div>
              <div>
                <h4 className="font-medium">{t("merchant.wallet.step3Title")}</h4>
                <p className="text-sm text-muted-foreground">
                  {t("merchant.wallet.step3Description")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddFundsModal open={addFundsOpen} onOpenChange={setAddFundsOpen} />
    </div>
  );
}
