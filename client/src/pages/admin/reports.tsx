import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  Download,
  Calendar,
  Clock,
  FileSpreadsheet,
  TrendingUp,
  Users,
  Package,
  ShoppingCart,
  RefreshCw,
  Search,
  Filter,
} from "lucide-react";
import { useState } from "react";

const reportTypes = [
  {
    id: "sales",
    name: "Sales Report",
    description: "Complete sales data with revenue breakdown",
    icon: TrendingUp,
    lastGenerated: "2024-12-10 09:30 AM",
    status: "ready",
  },
  {
    id: "merchants",
    name: "Merchant Report",
    description: "Active merchants, subscriptions, and activity",
    icon: Users,
    lastGenerated: "2024-12-10 08:00 AM",
    status: "ready",
  },
  {
    id: "products",
    name: "Product Performance",
    description: "Product views, imports, and sales metrics",
    icon: Package,
    lastGenerated: "2024-12-09 11:45 PM",
    status: "ready",
  },
  {
    id: "orders",
    name: "Order Summary",
    description: "Order fulfillment, returns, and status",
    icon: ShoppingCart,
    lastGenerated: "2024-12-10 10:15 AM",
    status: "ready",
  },
];

const recentReports = [
  {
    id: 1,
    name: "Monthly Sales Report - November 2024",
    type: "Sales",
    generatedAt: "2024-12-01 09:00 AM",
    size: "2.4 MB",
    format: "CSV",
    status: "completed",
  },
  {
    id: 2,
    name: "Q3 Merchant Analysis",
    type: "Merchants",
    generatedAt: "2024-11-15 02:30 PM",
    size: "1.8 MB",
    format: "PDF",
    status: "completed",
  },
  {
    id: 3,
    name: "Product Performance - October 2024",
    type: "Products",
    generatedAt: "2024-11-01 11:00 AM",
    size: "3.2 MB",
    format: "XLSX",
    status: "completed",
  },
  {
    id: 4,
    name: "Weekly Order Summary",
    type: "Orders",
    generatedAt: "2024-12-09 06:00 PM",
    size: "856 KB",
    format: "CSV",
    status: "completed",
  },
  {
    id: 5,
    name: "Annual Revenue Report 2024",
    type: "Sales",
    generatedAt: "2024-12-10 08:45 AM",
    size: "5.1 MB",
    format: "PDF",
    status: "generating",
  },
];

export default function AdminReports() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  const filteredReports = recentReports.filter((report) => {
    const matchesSearch = report.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || report.type.toLowerCase() === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-reports-title">Reports</h1>
          <p className="text-muted-foreground">Generate and download platform reports</p>
        </div>
        <Button data-testid="button-schedule-report">
          <Calendar className="h-4 w-4 mr-2" />
          Schedule Report
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {reportTypes.map((report) => (
          <Card key={report.id} className="hover-elevate cursor-pointer" data-testid={`card-report-${report.id}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <report.icon className="h-5 w-5 text-primary" />
                </div>
                <Badge variant="secondary" className="text-xs">
                  {report.status === "ready" ? "Ready" : "Generating"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="font-semibold mb-1">{report.name}</h3>
              <p className="text-sm text-muted-foreground mb-3">{report.description}</p>
              <div className="flex items-center text-xs text-muted-foreground mb-3">
                <Clock className="h-3 w-3 mr-1" />
                Last: {report.lastGenerated}
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" data-testid={`button-generate-${report.id}`}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Generate
                </Button>
                <Button size="sm" variant="outline" data-testid={`button-download-${report.id}`}>
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card data-testid="card-recent-reports">
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Recent Reports</CardTitle>
              <CardDescription>Previously generated reports available for download</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[200px]"
                  data-testid="input-search-reports"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px]" data-testid="select-filter-type">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="merchants">Merchants</SelectItem>
                  <SelectItem value="products">Products</SelectItem>
                  <SelectItem value="orders">Orders</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => (
                <TableRow key={report.id} data-testid={`row-report-${report.id}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      {report.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{report.type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{report.generatedAt}</TableCell>
                  <TableCell>{report.size}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{report.format}</Badge>
                  </TableCell>
                  <TableCell>
                    {report.status === "completed" ? (
                      <Badge className="bg-chart-2/20 text-chart-2 border-chart-2/30">Completed</Badge>
                    ) : (
                      <Badge variant="secondary">
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        Generating
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      disabled={report.status !== "completed"}
                      data-testid={`button-download-report-${report.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
