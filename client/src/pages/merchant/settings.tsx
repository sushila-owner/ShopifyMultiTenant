import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import {
  Settings,
  Bell,
  DollarSign,
  Loader2,
  Store,
} from "lucide-react";

const settingsSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  primaryColor: z.string(),
  emailOnOrder: z.boolean(),
  emailOnLowStock: z.boolean(),
  smsNotifications: z.boolean(),
  defaultPricingType: z.enum(["fixed", "percentage"]),
  defaultPricingValue: z.number().min(0),
  autoFulfillment: z.boolean(),
  autoSyncInventory: z.boolean(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      businessName: user?.merchant?.businessName || "",
      primaryColor: user?.merchant?.settings?.branding?.primaryColor || "#3b82f6",
      emailOnOrder: user?.merchant?.settings?.notifications?.emailOnOrder ?? true,
      emailOnLowStock: user?.merchant?.settings?.notifications?.emailOnLowStock ?? true,
      smsNotifications: user?.merchant?.settings?.notifications?.smsNotifications ?? false,
      defaultPricingType: user?.merchant?.settings?.defaultPricingRule?.type || "percentage",
      defaultPricingValue: user?.merchant?.settings?.defaultPricingRule?.value || 20,
      autoFulfillment: user?.merchant?.settings?.autoFulfillment ?? false,
      autoSyncInventory: user?.merchant?.settings?.autoSyncInventory ?? true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: SettingsFormData) => apiRequest("PATCH", "/api/merchants/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/stats"] });
      toast({ title: "Settings updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update settings", variant: "destructive" });
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    updateMutation.mutate(data);
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-settings-title">Settings</h1>
          <p className="text-muted-foreground">Configure your store preferences</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Business Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                <CardTitle>Business Information</CardTitle>
              </div>
              <CardDescription>Your store details and branding</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name</FormLabel>
                    <FormControl>
                      <Input data-testid="input-business-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="primaryColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand Color</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input type="color" className="w-14 h-10 p-1" {...field} />
                        <Input value={field.value} onChange={field.onChange} className="flex-1" />
                      </div>
                    </FormControl>
                    <FormDescription>Used for your store branding</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <CardTitle>Notifications</CardTitle>
              </div>
              <CardDescription>Configure how you receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="emailOnOrder"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel>Order Notifications</FormLabel>
                      <FormDescription>Receive email when you get a new order</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emailOnLowStock"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel>Low Stock Alerts</FormLabel>
                      <FormDescription>Get notified when products are running low</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="smsNotifications"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel>SMS Notifications</FormLabel>
                      <FormDescription>Receive SMS for urgent alerts</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Pricing & Fulfillment */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <CardTitle>Pricing & Fulfillment</CardTitle>
              </div>
              <CardDescription>Default pricing rules and automation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="defaultPricingType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Pricing Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-pricing-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage Markup</SelectItem>
                          <SelectItem value="fixed">Fixed Markup</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultPricingValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {form.watch("defaultPricingType") === "percentage"
                          ? "Markup Percentage"
                          : "Fixed Markup Amount"}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          {form.watch("defaultPricingType") === "fixed" && (
                            <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                          )}
                          <Input
                            type="number"
                            className={form.watch("defaultPricingType") === "fixed" ? "pl-7" : ""}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            data-testid="input-pricing-value"
                          />
                          {form.watch("defaultPricingType") === "percentage" && (
                            <span className="absolute right-3 top-2.5 text-muted-foreground">%</span>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-4" />

              <FormField
                control={form.control}
                name="autoFulfillment"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel>Auto-Fulfillment</FormLabel>
                      <FormDescription>
                        Automatically send orders to suppliers for fulfillment
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="autoSyncInventory"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel>Auto-Sync Inventory</FormLabel>
                      <FormDescription>Keep inventory synced with suppliers automatically</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="gap-2"
              data-testid="button-save-settings"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Settings className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
