import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Webhook,
  Plus,
  MoreHorizontal,
  Trash2,
  TestTube,
  Loader2,
  CheckCircle,
  XCircle,
  Copy,
} from "lucide-react";

interface WebhookSubscription {
  id: number;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  failureCount: number;
}

const webhookFormSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
  events: z.array(z.string()).min(1, "Select at least one event"),
});

type WebhookFormData = z.infer<typeof webhookFormSchema>;

const availableEvents = [
  { id: "order.created", label: "Order Created", description: "When a new order is placed" },
  { id: "order.updated", label: "Order Updated", description: "When an order is modified" },
  { id: "order.fulfilled", label: "Order Fulfilled", description: "When an order is fulfilled" },
  { id: "order.cancelled", label: "Order Cancelled", description: "When an order is cancelled" },
  { id: "inventory.low", label: "Low Inventory", description: "When product inventory is low" },
  { id: "inventory.updated", label: "Inventory Updated", description: "When inventory changes" },
  { id: "product.created", label: "Product Created", description: "When a product is added" },
  { id: "product.updated", label: "Product Updated", description: "When a product is modified" },
  { id: "wallet.credited", label: "Wallet Credited", description: "When funds are added" },
  { id: "wallet.debited", label: "Wallet Debited", description: "When funds are deducted" },
];

export default function WebhooksPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: webhooksData, isLoading } = useQuery<{ success: boolean; data: WebhookSubscription[] }>({
    queryKey: ["/api/merchant/webhooks"],
  });

  const webhooks = webhooksData?.data || [];

  const form = useForm<WebhookFormData>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: {
      url: "",
      events: ["order.created"],
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: WebhookFormData) => apiRequest("POST", "/api/merchant/webhooks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhooks"] });
      toast({ title: "Webhook created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to create webhook", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/merchant/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhooks"] });
      toast({ title: "Webhook deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete webhook", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PUT", `/api/merchant/webhooks/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhooks"] });
    },
    onError: () => {
      toast({ title: "Failed to update webhook", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/merchant/webhooks/${id}/test`),
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Test webhook sent successfully" });
      } else {
        toast({ title: "Test failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Test failed", variant: "destructive" });
    },
  });

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast({ title: "Secret copied to clipboard" });
  };

  const onSubmit = (data: WebhookFormData) => {
    createMutation.mutate(data);
  };

  return (
    <div className="flex-1 space-y-4 sm:space-y-6 p-4 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-webhooks-title">Webhooks</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Receive real-time notifications for events
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-full sm:w-auto" data-testid="button-add-webhook">
              <Plus className="h-4 w-4" />
              Add Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Webhook</DialogTitle>
              <DialogDescription>
                Create a new webhook endpoint to receive event notifications
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endpoint URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://your-server.com/webhook"
                          data-testid="input-webhook-url"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The URL that will receive webhook events
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="events"
                  render={() => (
                    <FormItem>
                      <FormLabel>Events</FormLabel>
                      <FormDescription>Select which events to subscribe to</FormDescription>
                      <div className="space-y-3 mt-2 max-h-48 overflow-y-auto">
                        {availableEvents.map((event) => (
                          <FormField
                            key={event.id}
                            control={form.control}
                            name="events"
                            render={({ field }) => (
                              <FormItem className="flex items-start gap-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(event.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, event.id])
                                        : field.onChange(
                                            field.value?.filter((value) => value !== event.id)
                                          );
                                    }}
                                  />
                                </FormControl>
                                <div className="space-y-0.5">
                                  <FormLabel className="font-normal cursor-pointer text-sm">
                                    {event.label}
                                  </FormLabel>
                                  <p className="text-xs text-muted-foreground">
                                    {event.description}
                                  </p>
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-webhook">
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Webhook
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-md bg-primary/10">
                <Webhook className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{webhooks.length}</p>
                <p className="text-xs text-muted-foreground">Total Webhooks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-md bg-chart-2/10">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-chart-2" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">
                  {webhooks.filter((w) => w.isActive).length}
                </p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-md bg-destructive/10">
                <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">
                  {webhooks.filter((w) => w.failureCount > 0).length}
                </p>
                <p className="text-xs text-muted-foreground">With Errors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Webhooks List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Webhook Endpoints</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Manage your webhook subscriptions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No webhooks configured</p>
              <p className="text-sm">Create a webhook to receive real-time notifications</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Endpoint</TableHead>
                    <TableHead className="hidden sm:table-cell">Events</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Secret</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooks.map((webhook) => (
                    <TableRow key={webhook.id} data-testid={`row-webhook-${webhook.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-xs sm:text-sm truncate max-w-[180px] sm:max-w-[250px]">
                            {webhook.url}
                          </p>
                          <p className="text-xs text-muted-foreground sm:hidden">
                            {webhook.events.length} events
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {webhook.events.slice(0, 2).map((event) => (
                            <Badge key={event} variant="outline" className="text-xs">
                              {event.split(".")[0]}
                            </Badge>
                          ))}
                          {webhook.events.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{webhook.events.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={webhook.isActive}
                            onCheckedChange={(isActive) =>
                              toggleMutation.mutate({ id: webhook.id, isActive })
                            }
                            data-testid={`switch-webhook-${webhook.id}`}
                          />
                          {webhook.failureCount > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {webhook.failureCount} errors
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[120px]">
                            {webhook.secret.substring(0, 12)}...
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copySecret(webhook.secret)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => testMutation.mutate(webhook.id)}
                              disabled={testMutation.isPending}
                            >
                              <TestTube className="mr-2 h-4 w-4" />
                              Test Webhook
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => copySecret(webhook.secret)}
                              className="md:hidden"
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy Secret
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(webhook.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Webhook Documentation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2 text-sm">Payload Format</h4>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
{`{
  "event": "order.created",
  "timestamp": "2024-01-01T12:00:00Z",
  "payload": {
    "orderId": 123,
    ...
  }
}`}
            </pre>
          </div>
          <div>
            <h4 className="font-medium mb-2 text-sm">Headers</h4>
            <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 list-disc pl-4">
              <li><code>X-Webhook-Event</code> - Event type</li>
              <li><code>X-Webhook-Timestamp</code> - Unix timestamp</li>
              <li><code>X-Webhook-Signature</code> - HMAC-SHA256 signature</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
