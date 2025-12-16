import {
  BaseAdapter,
  NormalizedProduct,
  NormalizedInventory,
  NormalizedOrder,
  OrderCreateRequest,
  OrderCreateResponse,
  TrackingInfo,
  ConnectionTestResult,
  PaginatedResult,
  ShopifyCredentials,
} from "./types";

const SHOPIFY_API_VERSION = "2024-10";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

export class ShopifyAdapter extends BaseAdapter {
  readonly type = "shopify" as const;
  private storeDomain: string;
  private accessToken: string;
  private apiVersion = SHOPIFY_API_VERSION;

  constructor(credentials: ShopifyCredentials) {
    super(credentials);
    
    const envStoreDomain = (process.env.SHOPIFY_STORE_URL || "").trim();
    const envAccessToken = (process.env.SHOPIFY_ACCESS_TOKEN || "").trim();
    
    const dbStoreDomain = (credentials.storeDomain || "").trim();
    const dbAccessToken = (credentials.accessToken || "").trim();
    
    this.storeDomain = (dbStoreDomain === "FROM_ENV" || !dbStoreDomain) ? envStoreDomain : dbStoreDomain;
    this.accessToken = (dbAccessToken === "FROM_ENV" || !dbAccessToken) ? envAccessToken : dbAccessToken;
  }

  private getDomain(): string {
    return this.storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  private async graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<GraphQLResponse<T>> {
    const url = `https://${this.getDomain()}/admin/api/${this.apiVersion}/graphql.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify GraphQL error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const result = await this.graphqlRequest<{
        shop: { name: string; id: string };
        productsCount: { count: number };
      }>(`
        query {
          shop {
            name
            id
          }
          productsCount {
            count
          }
        }
      `);

      if (result.errors?.length) {
        return {
          success: false,
          message: result.errors[0].message,
        };
      }

      return {
        success: true,
        message: `Connected to ${result.data?.shop.name}`,
        details: {
          storeName: result.data?.shop.name,
          productsCount: result.data?.productsCount.count,
          apiVersion: this.apiVersion,
          capabilities: {
            readProducts: true,
            readInventory: true,
            createOrders: true,
            readOrders: true,
            getTracking: true,
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Failed to connect to Shopify",
      };
    }
  }

  async fetchProducts(page = 1, pageSize = 50, cursor?: string): Promise<PaginatedResult<NormalizedProduct>> {
    try {
      const result = await this.graphqlRequest<{
        products: {
          edges: Array<{
            cursor: string;
            node: {
              id: string;
              title: string;
              descriptionHtml: string;
              vendor: string;
              productType: string;
              tags: string[];
              status: string;
              images: {
                edges: Array<{
                  node: { id: string; url: string; altText: string | null };
                }>;
              };
              variants: {
                edges: Array<{
                  node: {
                    id: string;
                    title: string;
                    sku: string;
                    price: string;
                    compareAtPrice: string | null;
                    inventoryQuantity: number;
                    barcode: string | null;
                    weight: number | null;
                    weightUnit: string | null;
                    inventoryItem: { tracked: boolean } | null;
                  };
                }>;
              };
            };
          }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
        productsCount: { count: number };
      }>(`
        query GetProducts($first: Int!, $cursor: String) {
          products(first: $first, after: $cursor, query: "status:active") {
            edges {
              cursor
              node {
                id
                title
                descriptionHtml
                vendor
                productType
                tags
                status
                images(first: 10) {
                  edges {
                    node {
                      id
                      url
                      altText
                    }
                  }
                }
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      compareAtPrice
                      inventoryQuantity
                      barcode
                      inventoryItem {
                        tracked
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
          productsCount {
            count
          }
        }
      `, { first: pageSize, cursor: cursor || null });

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      const normalizedProducts: NormalizedProduct[] = [];
      
      for (const edge of result.data?.products.edges || []) {
        const p = edge.node;
        const normalized = this.normalizeGraphQLProduct(p);
        
        const hasInventoryTracking = p.variants.edges.some(
          v => v.node.inventoryItem?.tracked === true
        );
        
        if (hasInventoryTracking) {
          const totalInventory = normalized.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
          if (totalInventory === 0) {
            continue;
          }
        } else {
          normalized.variants = normalized.variants.map(v => ({
            ...v,
            inventoryQuantity: 999
          }));
        }
        
        normalizedProducts.push(normalized);
      }

      const pageInfo = result.data?.products.pageInfo;

      return {
        items: normalizedProducts,
        total: result.data?.productsCount.count || 0,
        page,
        pageSize,
        hasMore: pageInfo?.hasNextPage || false,
        nextCursor: pageInfo?.endCursor || undefined,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }
  }

  async fetchProduct(supplierProductId: string): Promise<NormalizedProduct | null> {
    try {
      const gid = supplierProductId.startsWith("gid://") 
        ? supplierProductId 
        : `gid://shopify/Product/${supplierProductId}`;

      const result = await this.graphqlRequest<{
        product: {
          id: string;
          title: string;
          descriptionHtml: string;
          vendor: string;
          productType: string;
          tags: string[];
          status: string;
          images: {
            edges: Array<{
              node: { id: string; url: string; altText: string | null };
            }>;
          };
          variants: {
            edges: Array<{
              node: {
                id: string;
                title: string;
                sku: string;
                price: string;
                compareAtPrice: string | null;
                inventoryQuantity: number;
                barcode: string | null;
                inventoryItem: { tracked: boolean } | null;
              };
            }>;
          };
        } | null;
      }>(`
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            title
            descriptionHtml
            vendor
            productType
            tags
            status
            images(first: 10) {
              edges {
                node {
                  id
                  url
                  altText
                }
              }
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                  barcode
                  weight
                  weightUnit
                  inventoryItem {
                    tracked
                  }
                }
              }
            }
          }
        }
      `, { id: gid });

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      if (!result.data?.product) {
        return null;
      }

      const p = result.data.product;
      const normalized = this.normalizeGraphQLProduct(p);
      
      const hasInventoryTracking = p.variants.edges.some(
        v => v.node.inventoryItem?.tracked === true
      );
      
      if (hasInventoryTracking) {
        const totalInventory = normalized.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
        if (totalInventory === 0) {
          return null;
        }
      } else {
        normalized.variants = normalized.variants.map(v => ({
          ...v,
          inventoryQuantity: 999
        }));
      }
      
      return normalized;
    } catch (error: any) {
      if (error.message.includes("404") || error.message.includes("not found")) {
        return null;
      }
      throw error;
    }
  }

  async fetchInventory(supplierProductIds?: string[]): Promise<NormalizedInventory[]> {
    try {
      const inventoryItems: NormalizedInventory[] = [];
      
      if (supplierProductIds && supplierProductIds.length > 0) {
        for (const productId of supplierProductIds) {
          const product = await this.fetchProduct(productId);
          if (product) {
            for (const variant of product.variants) {
              inventoryItems.push({
                supplierProductId: productId,
                variantId: variant.id,
                sku: variant.sku,
                quantity: variant.inventoryQuantity,
                available: variant.inventoryQuantity > 0,
              });
            }
          }
        }
      }

      return inventoryItems;
    } catch (error: any) {
      throw new Error(`Failed to fetch inventory: ${error.message}`);
    }
  }

  async createOrder(order: OrderCreateRequest): Promise<OrderCreateResponse> {
    try {
      const result = await this.graphqlRequest<{
        draftOrderCreate: {
          draftOrder: {
            id: string;
            totalPrice: string;
          } | null;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(`
        mutation CreateDraftOrder($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              totalPrice
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        input: {
          lineItems: order.items.map(item => ({
            variantId: item.variantId.startsWith("gid://") 
              ? item.variantId 
              : `gid://shopify/ProductVariant/${item.variantId}`,
            quantity: item.quantity,
          })),
          shippingAddress: {
            firstName: order.shippingAddress.firstName,
            lastName: order.shippingAddress.lastName,
            address1: order.shippingAddress.address1,
            address2: order.shippingAddress.address2,
            city: order.shippingAddress.city,
            province: order.shippingAddress.province,
            country: order.shippingAddress.country,
            zip: order.shippingAddress.zip,
            phone: order.shippingAddress.phone,
          },
          note: order.note,
        },
      });

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      const userErrors = result.data?.draftOrderCreate.userErrors || [];
      if (userErrors.length > 0) {
        throw new Error(userErrors.map(e => e.message).join(", "));
      }

      const draftOrder = result.data?.draftOrderCreate.draftOrder;
      if (!draftOrder) {
        throw new Error("Failed to create order");
      }

      const numericId = draftOrder.id.replace("gid://shopify/DraftOrder/", "");

      return {
        supplierOrderId: numericId,
        status: "submitted",
        totalCost: parseFloat(draftOrder.totalPrice),
        rawResponse: draftOrder,
      };
    } catch (error: any) {
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  async getOrder(supplierOrderId: string): Promise<NormalizedOrder | null> {
    try {
      const gid = supplierOrderId.startsWith("gid://") 
        ? supplierOrderId 
        : `gid://shopify/Order/${supplierOrderId}`;

      const result = await this.graphqlRequest<{
        order: {
          id: string;
          displayFulfillmentStatus: string;
          totalPriceSet: { shopMoney: { amount: string } };
          createdAt: string;
          updatedAt: string;
          lineItems: {
            edges: Array<{
              node: {
                id: string;
                title: string;
                quantity: number;
                variant: {
                  id: string;
                  sku: string;
                  price: string;
                  product: { id: string };
                } | null;
              };
            }>;
          };
        } | null;
      }>(`
        query GetOrder($id: ID!) {
          order(id: $id) {
            id
            displayFulfillmentStatus
            totalPriceSet {
              shopMoney {
                amount
              }
            }
            createdAt
            updatedAt
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  quantity
                  variant {
                    id
                    sku
                    price
                    product {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      `, { id: gid });

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      if (!result.data?.order) {
        return null;
      }

      const order = result.data.order;
      return {
        supplierOrderId: order.id.replace("gid://shopify/Order/", ""),
        status: this.mapOrderStatus(order.displayFulfillmentStatus),
        items: order.lineItems.edges.map(edge => ({
          supplierProductId: edge.node.variant?.product.id.replace("gid://shopify/Product/", "") || "",
          variantId: edge.node.variant?.id.replace("gid://shopify/ProductVariant/", "") || "",
          quantity: edge.node.quantity,
          price: parseFloat(edge.node.variant?.price || "0"),
          fulfillmentStatus: order.displayFulfillmentStatus,
        })),
        totalCost: parseFloat(order.totalPriceSet.shopMoney.amount),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    } catch (error: any) {
      if (error.message.includes("404") || error.message.includes("not found")) {
        return null;
      }
      throw error;
    }
  }

  async getTracking(supplierOrderId: string): Promise<TrackingInfo | null> {
    try {
      const gid = supplierOrderId.startsWith("gid://") 
        ? supplierOrderId 
        : `gid://shopify/Order/${supplierOrderId}`;

      const result = await this.graphqlRequest<{
        order: {
          fulfillments: Array<{
            id: string;
            status: string;
            trackingInfo: Array<{
              company: string | null;
              number: string | null;
              url: string | null;
            }>;
            updatedAt: string;
          }>;
        } | null;
      }>(`
        query GetOrderFulfillments($id: ID!) {
          order(id: $id) {
            fulfillments {
              id
              status
              trackingInfo {
                company
                number
                url
              }
              updatedAt
            }
          }
        }
      `, { id: gid });

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      const fulfillments = result.data?.order?.fulfillments;
      if (!fulfillments || fulfillments.length === 0) {
        return null;
      }

      const fulfillment = fulfillments[0];
      const trackingInfo = fulfillment.trackingInfo[0];

      return {
        trackingNumber: trackingInfo?.number || "",
        carrier: trackingInfo?.company || "",
        trackingUrl: trackingInfo?.url || undefined,
        status: this.mapTrackingStatus(fulfillment.status),
        lastUpdate: fulfillment.updatedAt,
      };
    } catch (error: any) {
      if (error.message.includes("404") || error.message.includes("not found")) {
        return null;
      }
      throw error;
    }
  }

  private normalizeGraphQLProduct(product: {
    id: string;
    title: string;
    descriptionHtml: string;
    vendor: string;
    productType: string;
    tags: string[];
    status: string;
    images: {
      edges: Array<{
        node: { id: string; url: string; altText: string | null };
      }>;
    };
    variants: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          sku: string;
          price: string;
          compareAtPrice: string | null;
          inventoryQuantity: number;
          barcode?: string | null;
        };
      }>;
    };
  }): NormalizedProduct {
    const numericId = product.id.replace("gid://shopify/Product/", "");
    const mainVariant = product.variants.edges[0]?.node;

    return {
      supplierProductId: numericId,
      title: product.title,
      description: product.descriptionHtml || "",
      category: product.productType || "Uncategorized",
      tags: product.tags,
      images: product.images.edges.map((edge, idx) => ({
        url: edge.node.url,
        alt: edge.node.altText || product.title,
        position: idx + 1,
      })),
      variants: product.variants.edges.map(edge => ({
        id: edge.node.id.replace("gid://shopify/ProductVariant/", ""),
        sku: edge.node.sku || "",
        barcode: edge.node.barcode || undefined,
        title: edge.node.title,
        price: parseFloat(edge.node.price),
        compareAtPrice: edge.node.compareAtPrice ? parseFloat(edge.node.compareAtPrice) : undefined,
        cost: 0,
        inventoryQuantity: edge.node.inventoryQuantity || 0,
      })),
      supplierSku: mainVariant?.sku || "",
      supplierPrice: mainVariant ? parseFloat(mainVariant.price) : 0,
    };
  }

  private mapOrderStatus(status: string | null): NormalizedOrder["status"] {
    switch (status?.toUpperCase()) {
      case "FULFILLED":
        return "shipped";
      case "PARTIALLY_FULFILLED":
        return "processing";
      case "UNFULFILLED":
      case null:
        return "pending";
      default:
        return "pending";
    }
  }

  private mapTrackingStatus(status: string | null): TrackingInfo["status"] {
    switch (status?.toUpperCase()) {
      case "DELIVERED":
        return "delivered";
      case "IN_TRANSIT":
        return "in_transit";
      case "OUT_FOR_DELIVERY":
        return "out_for_delivery";
      case "FAILURE":
        return "exception";
      default:
        return "pending";
    }
  }
}
