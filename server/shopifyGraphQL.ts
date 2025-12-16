import type { InsertProduct } from "@shared/schema";

const SHOPIFY_API_VERSION = "2024-10";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: Record<string, unknown>;
  }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

export interface ShopifyGraphQLProduct {
  id: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  images: {
    edges: Array<{
      node: {
        id: string;
        url: string;
        altText: string | null;
      };
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
        selectedOptions: Array<{ name: string; value: string }>;
      };
    }>;
  };
}

export interface ShopifyGraphQLOrder {
  id: string;
  name: string;
  email: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
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
  shippingAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    address2: string | null;
    city: string;
    province: string;
    country: string;
    zip: string;
    phone: string | null;
  } | null;
  fulfillments: Array<{
    id: string;
    status: string;
    trackingInfo: Array<{
      company: string | null;
      number: string | null;
      url: string | null;
    }>;
    createdAt: string;
  }>;
}

export class ShopifyGraphQLService {
  private storeUrl: string;
  private accessToken: string;
  private apiVersion: string = SHOPIFY_API_VERSION;

  constructor(storeUrl: string, accessToken: string) {
    this.storeUrl = storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.accessToken = accessToken;
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<GraphQLResponse<T>> {
    const url = `https://${this.storeUrl}/admin/api/${this.apiVersion}/graphql.json`;

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

  async testConnection(): Promise<{ success: boolean; shopName?: string; error?: string }> {
    try {
      const result = await this.query<{ shop: { name: string; primaryDomain: { url: string } } }>(`
        query {
          shop {
            name
            primaryDomain {
              url
            }
          }
        }
      `);

      if (result.errors?.length) {
        return { success: false, error: result.errors[0].message };
      }

      return { success: true, shopName: result.data?.shop.name };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getProductCount(): Promise<number> {
    const result = await this.query<{ productsCount: { count: number } }>(`
      query {
        productsCount {
          count
        }
      }
    `);

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result.data?.productsCount.count || 0;
  }

  async getProducts(first: number = 50, cursor?: string): Promise<{
    products: ShopifyGraphQLProduct[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  }> {
    const result = await this.query<{
      products: {
        edges: Array<{ node: ShopifyGraphQLProduct; cursor: string }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(`
      query GetProducts($first: Int!, $cursor: String) {
        products(first: $first, after: $cursor) {
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
              createdAt
              updatedAt
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
                    selectedOptions {
                      name
                      value
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
      }
    `, { first, cursor });

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return {
      products: result.data?.products.edges.map(e => e.node) || [],
      pageInfo: result.data?.products.pageInfo || { hasNextPage: false, endCursor: null },
    };
  }

  async getProductById(gid: string): Promise<ShopifyGraphQLProduct | null> {
    const result = await this.query<{ product: ShopifyGraphQLProduct | null }>(`
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          descriptionHtml
          vendor
          productType
          tags
          status
          createdAt
          updatedAt
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
                selectedOptions {
                  name
                  value
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

    return result.data?.product || null;
  }

  async getOrders(first: number = 50, cursor?: string, query?: string): Promise<{
    orders: ShopifyGraphQLOrder[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  }> {
    const result = await this.query<{
      orders: {
        edges: Array<{ node: ShopifyGraphQLOrder; cursor: string }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(`
      query GetOrders($first: Int!, $cursor: String, $query: String) {
        orders(first: $first, after: $cursor, query: $query) {
          edges {
            cursor
            node {
              id
              name
              email
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
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
              shippingAddress {
                firstName
                lastName
                address1
                address2
                city
                province
                country
                zip
                phone
              }
              fulfillments {
                id
                status
                trackingInfo {
                  company
                  number
                  url
                }
                createdAt
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `, { first, cursor, query });

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return {
      orders: result.data?.orders.edges.map(e => e.node) || [],
      pageInfo: result.data?.orders.pageInfo || { hasNextPage: false, endCursor: null },
    };
  }

  async getOrderById(gid: string): Promise<ShopifyGraphQLOrder | null> {
    const result = await this.query<{ order: ShopifyGraphQLOrder | null }>(`
      query GetOrder($id: ID!) {
        order(id: $id) {
          id
          name
          email
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
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
          shippingAddress {
            firstName
            lastName
            address1
            address2
            city
            province
            country
            zip
            phone
          }
          fulfillments {
            id
            status
            trackingInfo {
              company
              number
              url
            }
            createdAt
          }
        }
      }
    `, { id: gid });

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result.data?.order || null;
  }

  async createProduct(input: {
    title: string;
    descriptionHtml?: string;
    vendor?: string;
    productType?: string;
    tags?: string[];
    status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  }): Promise<{ success: boolean; productId?: string; error?: string }> {
    const result = await this.query<{
      productCreate: {
        product: { id: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(`
      mutation CreateProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      input: {
        title: input.title,
        descriptionHtml: input.descriptionHtml || "",
        vendor: input.vendor || "Apex Mart Wholesale",
        productType: input.productType || "",
        tags: input.tags || [],
        status: input.status || "ACTIVE",
      },
    });

    if (result.errors?.length) {
      return { success: false, error: result.errors[0].message };
    }

    const userErrors = result.data?.productCreate.userErrors || [];
    if (userErrors.length > 0) {
      return { success: false, error: userErrors.map(e => e.message).join(", ") };
    }

    return {
      success: true,
      productId: result.data?.productCreate.product?.id,
    };
  }

  async createProductVariant(productId: string, input: {
    price: string;
    sku?: string;
    inventoryQuantities?: Array<{ availableQuantity: number; locationId: string }>;
    options?: string[];
  }): Promise<{ success: boolean; variantId?: string; error?: string }> {
    const result = await this.query<{
      productVariantCreate: {
        productVariant: { id: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(`
      mutation CreateProductVariant($productId: ID!, $input: ProductVariantInput!) {
        productVariantCreate(productId: $productId, input: $input) {
          productVariant {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      productId,
      input: {
        price: input.price,
        sku: input.sku,
        inventoryQuantities: input.inventoryQuantities,
        options: input.options,
      },
    });

    if (result.errors?.length) {
      return { success: false, error: result.errors[0].message };
    }

    const userErrors = result.data?.productVariantCreate.userErrors || [];
    if (userErrors.length > 0) {
      return { success: false, error: userErrors.map(e => e.message).join(", ") };
    }

    return {
      success: true,
      variantId: result.data?.productVariantCreate.productVariant?.id,
    };
  }

  async updateInventoryLevel(inventoryItemId: string, locationId: string, availableQuantity: number): Promise<{
    success: boolean;
    error?: string;
  }> {
    const result = await this.query<{
      inventorySetOnHandQuantities: {
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(`
      mutation SetInventory($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `, {
      input: {
        reason: "correction",
        setQuantities: [{
          inventoryItemId,
          locationId,
          quantity: availableQuantity,
        }],
      },
    });

    if (result.errors?.length) {
      return { success: false, error: result.errors[0].message };
    }

    const userErrors = result.data?.inventorySetOnHandQuantities.userErrors || [];
    if (userErrors.length > 0) {
      return { success: false, error: userErrors.map(e => e.message).join(", ") };
    }

    return { success: true };
  }

  async createFulfillment(orderId: string, lineItemIds: string[], trackingInfo?: {
    company?: string;
    number?: string;
    url?: string;
  }): Promise<{ success: boolean; fulfillmentId?: string; error?: string }> {
    const result = await this.query<{
      fulfillmentCreateV2: {
        fulfillment: { id: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(`
      mutation CreateFulfillment($fulfillment: FulfillmentV2Input!) {
        fulfillmentCreateV2(fulfillment: $fulfillment) {
          fulfillment {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      fulfillment: {
        lineItemsByFulfillmentOrder: [{
          fulfillmentOrderId: orderId,
          fulfillmentOrderLineItems: lineItemIds.map(id => ({
            id,
            quantity: 1,
          })),
        }],
        trackingInfo: trackingInfo ? {
          company: trackingInfo.company,
          number: trackingInfo.number,
          url: trackingInfo.url,
        } : undefined,
        notifyCustomer: true,
      },
    });

    if (result.errors?.length) {
      return { success: false, error: result.errors[0].message };
    }

    const userErrors = result.data?.fulfillmentCreateV2.userErrors || [];
    if (userErrors.length > 0) {
      return { success: false, error: userErrors.map(e => e.message).join(", ") };
    }

    return {
      success: true,
      fulfillmentId: result.data?.fulfillmentCreateV2.fulfillment?.id,
    };
  }

  normalizeProductForInsert(product: ShopifyGraphQLProduct, supplierId: number): Partial<InsertProduct> {
    const mainVariant = product.variants.edges[0]?.node;
    const mainImage = product.images.edges[0]?.node;
    const numericId = product.id.replace("gid://shopify/Product/", "");

    return {
      supplierId,
      supplierProductId: numericId,
      supplierSku: mainVariant?.sku || `SHOP-${numericId}`,
      title: product.title,
      description: product.descriptionHtml || "",
      category: product.productType || "Uncategorized",
      supplierPrice: mainVariant ? parseFloat(mainVariant.price) : 0,
      images: product.images.edges.map(e => ({
        url: e.node.url,
        alt: e.node.altText || undefined,
      })),
      inventoryQuantity: mainVariant?.inventoryQuantity || 0,
      status: product.status.toLowerCase() === "active" ? "active" : "draft",
      variants: product.variants.edges.map(e => ({
        id: e.node.id.replace("gid://shopify/ProductVariant/", ""),
        title: e.node.title,
        sku: e.node.sku || "",
        price: parseFloat(e.node.price),
        cost: 0,
        inventoryQuantity: e.node.inventoryQuantity,
        compareAtPrice: e.node.compareAtPrice ? parseFloat(e.node.compareAtPrice) : undefined,
      })),
      tags: product.tags,
    };
  }
}

export function getShopifyGraphQLService(storeUrl: string, accessToken: string): ShopifyGraphQLService {
  return new ShopifyGraphQLService(storeUrl, accessToken);
}
