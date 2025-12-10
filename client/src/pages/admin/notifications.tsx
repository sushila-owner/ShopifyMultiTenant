import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  Mail,
  MessageSquare,
  Send,
  Users,
  AlertTriangle,
  CheckCircle,
  Info,
  Clock,
  Trash2,
  Eye,
} from "lucide-react";
import { useState } from "react";

const notificationHistory = [
  {
    id: 1,
    title: "System Maintenance Scheduled",
    message: "Scheduled maintenance on Dec 15, 2024 from 2-4 AM EST",
    type: "info",
    audience: "all",
    sentAt: "2024-12-10 09:30 AM",
    delivered: 156,
    opened: 89,
  },
  {
    id: 2,
    title: "New Feature: AI Product Descriptions",
    message: "We've launched AI-powered product descriptions for all Pro+ plans",
    type: "success",
    audience: "pro",
    sentAt: "2024-12-08 02:00 PM",
    delivered: 78,
    opened: 45,
  },
  {
    id: 3,
    title: "Payment Issue Detected",
    message: "Your subscription payment failed. Please update your payment method.",
    type: "warning",
    audience: "specific",
    sentAt: "2024-12-07 11:15 AM",
    delivered: 12,
    opened: 10,
  },
  {
    id: 4,
    title: "Welcome to Apex Mart!",
    message: "Thank you for joining. Here's how to get started...",
    type: "info",
    audience: "new",
    sentAt: "2024-12-06 04:30 PM",
    delivered: 23,
    opened: 21,
  },
];

const emailSettings = [
  { id: "new_order", label: "New Order Notifications", description: "Send email when a new order is placed", enabled: true },
  { id: "order_fulfilled", label: "Order Fulfilled", description: "Notify when orders are shipped", enabled: true },
  { id: "low_stock", label: "Low Stock Alerts", description: "Alert when product inventory is low", enabled: true },
  { id: "new_merchant", label: "New Merchant Signup", description: "Notify admins of new registrations", enabled: true },
  { id: "subscription_change", label: "Subscription Changes", description: "Alert on plan upgrades/downgrades", enabled: false },
  { id: "weekly_digest", label: "Weekly Digest", description: "Send weekly summary to all merchants", enabled: true },
];

export default function AdminNotifications() {
  const [notificationType, setNotificationType] = useState("info");
  const [audience, setAudience] = useState("all");
  const [settings, setSettings] = useState(emailSettings);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "success": return CheckCircle;
      case "warning": return AlertTriangle;
      case "error": return AlertTriangle;
      default: return Info;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "success": return "text-chart-2";
      case "warning": return "text-amber-500";
      case "error": return "text-destructive";
      default: return "text-blue-500";
    }
  };

  const toggleSetting = (id: string) => {
    setSettings(settings.map(s => 
      s.id === id ? { ...s, enabled: !s.enabled } : s
    ));
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-notifications-title">Notifications</h1>
          <p className="text-muted-foreground">Manage platform notifications and alerts</p>
        </div>
      </div>

      <Tabs defaultValue="send" className="space-y-6">
        <TabsList>
          <TabsTrigger value="send" data-testid="tab-send">
            <Send className="h-4 w-4 mr-2" />
            Send Notification
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <Clock className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Bell className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card data-testid="card-compose">
              <CardHeader>
                <CardTitle>Compose Notification</CardTitle>
                <CardDescription>Send a notification to merchants</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Notification Type</Label>
                  <Select value={notificationType} onValueChange={setNotificationType}>
                    <SelectTrigger data-testid="select-notification-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-blue-500" />
                          Information
                        </div>
                      </SelectItem>
                      <SelectItem value="success">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-chart-2" />
                          Success
                        </div>
                      </SelectItem>
                      <SelectItem value="warning">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          Warning
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Audience</Label>
                  <Select value={audience} onValueChange={setAudience}>
                    <SelectTrigger data-testid="select-audience">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Merchants</SelectItem>
                      <SelectItem value="pro">Pro & Above Plans</SelectItem>
                      <SelectItem value="free">Free Plan Only</SelectItem>
                      <SelectItem value="trial">Trial Users</SelectItem>
                      <SelectItem value="new">New Signups (Last 7 days)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Title</Label>
                  <Input placeholder="Notification title..." data-testid="input-title" />
                </div>

                <div className="grid gap-2">
                  <Label>Message</Label>
                  <Textarea 
                    placeholder="Write your notification message..." 
                    rows={4}
                    data-testid="input-message"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch id="send-email" />
                    <Label htmlFor="send-email" className="text-sm">Also send via email</Label>
                  </div>
                </div>

                <Button className="w-full" data-testid="button-send">
                  <Send className="h-4 w-4 mr-2" />
                  Send Notification
                </Button>
              </CardContent>
            </Card>

            <Card data-testid="card-preview">
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>How the notification will appear</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full bg-blue-500/10 ${getTypeColor(notificationType)}`}>
                      {notificationType === "info" && <Info className="h-5 w-5" />}
                      {notificationType === "success" && <CheckCircle className="h-5 w-5" />}
                      {notificationType === "warning" && <AlertTriangle className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">Notification Title</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your notification message will appear here. This is a preview of how it will look to merchants.
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">Just now</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Audience Summary</h4>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>
                      {audience === "all" && "All 156 merchants"}
                      {audience === "pro" && "78 Pro+ merchants"}
                      {audience === "free" && "89 Free plan merchants"}
                      {audience === "trial" && "12 trial users"}
                      {audience === "new" && "23 new signups"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card data-testid="card-history">
            <CardHeader>
              <CardTitle>Notification History</CardTitle>
              <CardDescription>Previously sent notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {notificationHistory.map((notification) => {
                  const TypeIcon = getTypeIcon(notification.type);
                  return (
                    <div 
                      key={notification.id}
                      className="flex items-start gap-4 p-4 border rounded-lg"
                      data-testid={`notification-${notification.id}`}
                    >
                      <div className={`p-2 rounded-full bg-muted ${getTypeColor(notification.type)}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{notification.title}</h4>
                          <Badge variant="outline" className="text-xs">
                            {notification.audience === "all" ? "All Users" : 
                             notification.audience === "pro" ? "Pro+" :
                             notification.audience === "specific" ? "Specific" : "New Users"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{notification.message}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {notification.sentAt}
                          </span>
                          <span className="flex items-center gap-1">
                            <Send className="h-3 w-3" />
                            {notification.delivered} delivered
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {notification.opened} opened
                          </span>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card data-testid="card-email-settings">
            <CardHeader>
              <CardTitle>Email Notification Settings</CardTitle>
              <CardDescription>Configure automatic email notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {settings.map((setting) => (
                  <div 
                    key={setting.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                    data-testid={`setting-${setting.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <h4 className="font-medium">{setting.label}</h4>
                        <p className="text-sm text-muted-foreground">{setting.description}</p>
                      </div>
                    </div>
                    <Switch 
                      checked={setting.enabled}
                      onCheckedChange={() => toggleSetting(setting.id)}
                      data-testid={`switch-${setting.id}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
