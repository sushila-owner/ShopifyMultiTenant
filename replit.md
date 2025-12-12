# Apex Mart Wholesale - B2B Wholesale SaaS Platform

## Overview

Apex Mart Wholesale is a multi-tenant B2B wholesale marketplace designed to connect suppliers with e-commerce merchants (e.g., Shopify). It enables merchants to import products, automate order fulfillment, and manage their wholesale operations through a subscription-based model. Key capabilities include comprehensive supplier and global catalog management, one-click product imports for merchants, automated order fulfillment, complete data isolation per merchant, and tiered subscription plans with product limits.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18, TypeScript, Vite, Wouter for routing, TanStack Query for server state, and Tailwind CSS for styling. It utilizes shadcn/ui on Radix UI for its component system, following a "New York" style aesthetic inspired by Shopify Polaris and Linear, focusing on professionalism, data density, and clear hierarchy. State management employs React Context for authentication and theme, TanStack Query for server state, and localStorage for tokens and theme.

### Backend
The backend uses Express.js with TypeScript on Node.js, featuring modular routing and custom logging. It follows a RESTful API design with a `/api/*` prefix and incorporates a planned storage interface designed for database interchangeability. The build process uses esbuild for server bundling and Vite for client bundling in a two-step process.

### Authentication & Authorization
The platform supports a multi-role system including Admin, Merchant, and planned Staff roles. Authentication is handled via Email/Password with bcrypt hashing and JWTs (stored in localStorage with a 7-day expiry). A custom auth context and `ProtectedRoute` component enforce role-based access and UI rendering, ensuring data isolation for each merchant.

### Data Storage
Drizzle ORM is used with PostgreSQL, specifically PlanetScale PostgreSQL. The database schema is defined in `shared/schema.ts` with Zod validation. Key data models include Users, Authentication, Product Catalog, Order Management, and Business Logic. Multi-tenancy is enforced using a `merchantId` foreign key for data isolation, with admin roles bypassing these filters.

### Key Features and System Design
- **Subscription System**: Offers 6 tiers with varying product/order limits and features like AI ads and white-labeling.
- **Admin Product Pricing**: Supports single and bulk markup editing (percentage/fixed).
- **Merchant Catalog**: Features a GigaB2B-style layout with tabs, collapsible filters, sorting, and multi-select product import with custom pricing.
- **Server-Side Pagination**: Handles large product catalogs (60,000+) with server-side pagination, filters, debounced search, and sorting, optimized with database indexes.
- **Semantic Search**: Integrates Claude AI for natural language product query analysis.
- **Image Storage**: Utilizes AWS S3 for secure, tenant-scoped image storage with signed URLs, validation, and encryption.
- **Caching**: Simple in-memory cache for performance. Upstash Redis (REST API) is used for distributed OAuth session storage.
- **Multi-Currency Support**: Supports 30 currencies with client-side selection, persistence via localStorage, and a `CurrencyProvider` context for formatting and conversion.
- **DeepL Translation Integration**: Provides app-wide translation for dynamic content (product titles, descriptions) using the DeepL API, featuring in-memory caching and React hooks for seamless integration.
- **Wallet System**: Merchants can pre-fund a wallet via Stripe to automatically cover order fulfillment costs, with transaction history and top-up functionality.
- **Product Push to Shopify**: Merchants can publish imported products, including titles, descriptions, variants, images, and tags, directly to their connected Shopify store, with inventory management and sync status tracking.
- **Email Notification Service**: Provides email alerts for various events (e.g., new orders, low stock, wallet low balance) using either Console (default) or SendGrid.
- **Inventory Sync Service**: Automatically synchronizes supplier inventory levels to merchant products at configurable intervals, supporting manual triggers and low stock alerts.
- **Returns & Refunds Management**: Manages the Return Merchandise Authorization (RMA) workflow, including request creation, approval/rejection, and processing refunds to the merchant's wallet.
- **Shipping Configuration**: Allows merchants to manage shipping zones and rates with various rate types (flat, weight-based, price-based).
- **GDPR Compliance**: Includes services for data export, deletion, and customer data anonymization, fulfilling Shopify App Store requirements via webhooks.
- **Analytics Dashboard**: Real-time analytics showing revenue, profit, orders, and conversion metrics with period filtering (7d, 30d, 90d, 1y). Includes revenue/profit charts, orders by period, top products by sales, and category distribution.
- **Automatic Shopify App Store Installation**: When merchants install the app from Shopify App Store, the system automatically:
  - Creates merchant accounts using Shopify store information
  - Connects the Shopify store with proper OAuth flow
  - Registers webhooks for automatic order syncing (orders/create, orders/updated, app/uninstalled)
  - Auto-logs in the merchant and redirects to dashboard
  - Entry point: GET `/api/shopify/install?shop=store.myshopify.com`

### File Structure
The project uses a monorepo structure with `/client`, `/server`, `/shared`, `/migrations`, `/attached_assets`, and `/script` directories, alongside path aliases like `@/*` and `@shared/*`.

### Deployment
Deployment is configured for Heroku with a `Procfile` and an optimized build process.

## External Dependencies

- **UI Libraries**: Radix UI, shadcn/ui, Lucide React, React Icons.
- **Form Management**: React Hook Form, Zod, @hookform/resolvers, drizzle-zod.
- **Development Tools**: TypeScript, ESLint, Prettier.
- **Third-Party Integrations**:
    - Shopify API (product management, order fulfillment).
    - Stripe (subscription billing, wallet top-ups).
    - Nodemailer (email service).
    - Claude AI (Anthropic) for semantic search.
    - AWS S3 (image storage).
    - PlanetScale PostgreSQL (database).
    - Upstash Redis (session storage).
    - DeepL API (translation services).
    - GigaB2B Open API 2.0 (wholesale supplier integration).

### GigaB2B Supplier Integration
The platform integrates with GigaB2B as a wholesale supplier using their Open API 2.0 with HMAC-SHA256 signature authentication. Key features:
- **Product Sync**: Fetches product SKUs and pricing from GigaB2B catalog (`/b2b-overseas-api/v1/buyer/product/skus/v1` and `/price/v1`)
- **Drop Shipping Order Sync**: Pushes orders to GigaB2B for fulfillment (`/b2b-overseas-api/v1/buyer/order/dropShip-sync/v1`)
- **Tracking Query**: Retrieves tracking information for shipped orders (`/b2b-overseas-api/v1/buyer/order/track-no/v1`)
- **Authentication**: Uses HMAC-SHA256 with signature format: `clientId&uri&timestamp&nonce` signed with key `clientId&clientSecret&nonce`
- **Environment Variables**: Requires `GIGAB2B_CLIENT_ID` and `GIGAB2B_CLIENT_SECRET`
- **Files**: `server/gigab2b.ts` (service), `server/supplierAdapters/gigab2bAdapter.ts` (adapter pattern)