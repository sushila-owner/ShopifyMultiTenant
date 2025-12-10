# Apex Mart Wholesale - B2B Wholesale SaaS Platform

## Overview

Apex Mart Wholesale is a multi-tenant B2B wholesale marketplace connecting suppliers with e-commerce merchants (Shopify, etc.). It enables merchants to import products, automate order fulfillment, and manage their wholesale business via a subscription model. The platform focuses on supplier and global catalog management by admins, one-click product imports for merchants, automated order fulfillment, complete data isolation per merchant, and subscription-based access with product limits.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Technology Stack**: React 18, TypeScript, Vite, Wouter (routing), TanStack Query (server state), Tailwind CSS.
- **UI Component System**: shadcn/ui on Radix UI, custom design system (Shopify Polaris/Linear aesthetic), theme support, responsive (desktop-first).
- **Design Philosophy**: "New York" style from shadcn, professional B2B aesthetics, data density, clear hierarchy, Inter font, Tailwind 12-column grid.
- **State Management**: React Context (auth, theme), TanStack Query (server state), localStorage (tokens, theme).

### Backend Architecture
- **Server Framework**: Express.js with TypeScript on Node.js, modular routing, custom logging.
- **API Design**: RESTful, `/api/*` prefix, planned storage interface (currently in-memory placeholder, designed for database swap).
- **Build System**: esbuild (server bundling), Vite (client bundling), two-step build process.

### Authentication & Authorization
- **Multi-Role System**: Admin (platform-wide), Merchant (isolated tenant access), Staff (planned role-based permissions).
- **Authentication Method**: Email/Password with bcrypt password hashing.
- **Implementation**: Custom auth context, JWT (localStorage, 7-day expiry), `ProtectedRoute` component, role-based UI rendering.
- **Security**: `SESSION_SECRET` env var required, bcrypt password hashing, protected routes, role enforcement.

### Shopify OAuth Integration (Public App)
- **OAuth Flow**: Secure public app OAuth for Shopify App Store distribution.
- **Multi-Tenant Security**:
  - OAuth nonces bound to merchantId at creation (prevents cross-tenant reuse)
  - Pending connections stored server-side with merchantId binding
  - Connect endpoint validates authenticated merchantId matches pending connection
  - Install endpoint requires authentication (POST-only with JSON response)
  - Frontend sessionStorage markers prevent phishing attacks with crafted URLs
- **Token Storage**: Access tokens stored in merchant.shopifyStore JSON field, never exposed to client
- **Service Caching**: ShopifyService instances keyed by `merchantId:domain` for proper cache invalidation
- **Required Secrets**: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` from Shopify Partner Dashboard
- **Files**: `server/shopifyOAuth.ts` (OAuth helpers), `server/routes.ts` (OAuth endpoints)

### Data Storage
- **Database**: Drizzle ORM configured for PostgreSQL, PlanetScale PostgreSQL (`us-east-3.pg.psdb.cloud`).
- **Schema**: Defined in `shared/schema.ts` with Zod validation.
- **Data Models**: Users, Authentication, Product Catalog (suppliers, global/merchant products, variants, images, categories), Order Management (orders, items, fulfillment, customers), Business Logic (subscription tiers, pricing rules, customer tiers).
- **Multi-Tenancy**: `merchantId` foreign key for data isolation, admin bypasses filters.
- **PlanetScale Compatibility**: Product queries use explicit column selection to avoid selecting `categoryId` column (not yet in PlanetScale). Helper methods `productSelectColumns` and `addNullCategoryId` in `DatabaseStorage` class handle this.

### System Design Choices
- **Subscription System**: 6-tier plans (Free, Starter, Growth, Professional, Millionaire, FREE FOR LIFE) with varying product/order limits and features (AI ads, white-label, VIP support).
- **Admin Product Pricing**: Single and bulk markup editing (percentage/fixed amount).
- **Merchant Catalog Redesign**: GigaB2B-style layout with tabs (All, New Arrivals, Hot Deals, Trending), collapsible filters (Price, Availability, Suppliers, Categories), sorting, grid/list views, multi-select product import with custom pricing.
- **Server-Side Pagination**: Catalog supports 60,000+ products with server-side pagination (50 per page), filters (supplier, category, price range, stock), debounced search (300ms), and sorting (price, stock, date). Database indexes on `is_global+status`, `supplier_price`, `created_at`, `category`, `inventory_quantity` for query performance.
- **Semantic Search**: Integrated Claude AI for natural language product query analysis.
- **Image Storage**: AWS S3 for secure, tenant-scoped image storage with signed URLs, validation, and encryption.
- **Caching**: Simple in-memory cache for performance.

### File Structure
- **Monorepo**: `/client`, `/server`, `/shared`, `/migrations`, `/attached_assets`, `/script`.
- **Path Aliases**: `@/*`, `@shared/*`, `@assets/*`.
- **Component Organization**: `/components/ui`, role-specific sidebars, `/pages` by role, `/lib` (utilities, hooks).

## Deployment

### Heroku Deployment
- **Procfile**: Configured for Heroku with `web: npm run start`
- **Build Process**: `npm run build` creates optimized production bundle
- **Environment**: Node.js 20.x recommended
- **Guide**: See `HEROKU_DEPLOYMENT.md` for full deployment instructions

### Required Environment Variables
- `DATABASE_URL`, `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGPORT`
- `SESSION_SECRET` - For JWT authentication
- `SHOPIFY_STORE_URL`, `SHOPIFY_ACCESS_TOKEN` - Shopify integration
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_REGION` - Image storage
- `ANTHROPIC_API_KEY` - Claude AI semantic search

### Performance Optimizations
- **Batch Sync**: Imports 250 products per batch (10-50x faster than one-by-one)
- **Background Processing**: Product sync runs asynchronously with progress tracking
- **Database Indexes**: Optimized for 64,000+ product queries

## External Dependencies

- **UI Frameworks**: Radix UI, shadcn/ui, Lucide React, React Icons.
- **Forms & Validation**: React Hook Form, Zod, @hookform/resolvers, drizzle-zod.
- **Development Tools**: Replit plugins, TypeScript, ESLint, Prettier.
- **Third-Party Integrations**:
    - Shopify API (product import/export, order fulfillment)
    - Stripe (subscription billing)
    - Email service (Nodemailer)
    - Supplier APIs (GigaB2B, Amazon, WooCommerce - planned)
    - Claude AI (Anthropic) for semantic search (`claude-3-5-sonnet-20241022`)
    - AWS S3 for image storage.
    - PlanetScale PostgreSQL (database).