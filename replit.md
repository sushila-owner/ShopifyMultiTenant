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
- **Session Storage (Redis)**: Upstash Redis (REST API) for distributed OAuth session storage. Falls back to in-memory storage when not configured. Auto-detects swapped URL/Token values.

### Multi-Currency Support
- **30 Currencies**: USD, EUR, GBP, CAD, AUD, JPY, CNY, INR, BRL, MXN, KRW, RUB, CHF, SEK, NOK, DKK, PLN, TRY, THB, IDR, MYR, SGD, HKD, NZD, ZAR, AED, SAR, PHP, VND, EGP
- **Provider**: `client/src/lib/currency.tsx` - CurrencyProvider context with formatPrice and convertPrice
- **Selector**: GlobeSettings component in sidebar footer (combines language + currency selection)
- **Persistence**: Selected currency saved to localStorage
- **Usage**: `const { formatPrice, currency, setCurrency } = useCurrency();`
- All product prices throughout the app display in the user's selected currency

### DeepL Translation Integration
- **Purpose**: App-wide translation for dynamic content (product titles, descriptions, tags) based on customer's language preference
- **Service**: `server/deepl.ts` - DeepL API service with in-memory caching (24-hour TTL)
- **Frontend Hook**: `client/src/hooks/useTranslation.ts` - React hooks for translating text, products, and batch content
- **Components**: `client/src/components/TranslatedText.tsx` - Ready-to-use translation components

**API Endpoints**:
- `GET /api/translation/status` - Check if DeepL is configured and usage stats
- `POST /api/translation/translate` - Translate single text or batch texts
- `POST /api/translation/product` - Translate product object (title, description, tags)
- `GET /api/translation/product/:id?lang=xx` - Get translated product by ID
- `GET /api/translation/languages` - Get supported source/target languages

**Frontend Usage**:
```tsx
import { useTranslateProduct, useTranslateText } from "@/hooks/useTranslation";
import { TranslatedText } from "@/components/TranslatedText";

// Hook for product translation
const { title, description, tags, isLoading } = useTranslateProduct(product);

// Hook for simple text
const { text, isLoading } = useTranslateText("Hello world");

// Component for inline translation
<TranslatedText text={someText} showLoading={true} />
```

**Supported Languages**: EN, ES, FR, DE, IT, PT, RU, ZH, JA, KO, AR, NL, PL, TR, ID (and 10+ more)
- **Required Secret**: `DEEPL_API_KEY` (free tier: 500,000 chars/month)
- **Caching**: In-memory cache prevents duplicate API calls, 24-hour TTL

### Wallet System (Pre-funded Balance)
- **Purpose**: Merchants pre-fund their wallet to automatically pay for order fulfillment costs
- **Database Tables**: `wallet_balances` (current balance per merchant), `wallet_transactions` (audit trail)
- **Top-up Flow**: Stripe PaymentIntent → Payment confirmation → Balance credited
- **Order Integration**: When merchant fulfills an order, supplier cost is automatically deducted from wallet
- **Insufficient Funds**: Returns 402 status with error message and redirect to wallet page

**API Endpoints**:
- `GET /api/wallet/balance` - Get current wallet balance (auto-creates if not exists)
- `GET /api/wallet/transactions` - Get transaction history with pagination
- `POST /api/wallet/top-up` - Create Stripe PaymentIntent for top-up ($5 min, $10,000 max)
- `POST /api/wallet/confirm` - Confirm payment and credit wallet balance

**Frontend**:
- Wallet page at `/dashboard/wallet` with balance display, add funds modal, and transaction history
- Sidebar shows wallet balance badge next to Wallet menu item
- Stripe Elements integration for payment form
- **Stripe Fallback**: 5-second timeout fallback enables payment form even if `onReady` callback doesn't fire (handles certain browser environments)

**Transaction Types**: credit (top-up), debit (order payment), refund (order cancellation)

**Localization**: Fully translated across all 12 languages (EN, ES, FR, DE, ZH, JA, AR, KO, PT, RU, HI, IT). Uses locale-aware date formatting with date-fns locales.

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
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` - Redis session storage (optional, recommended for production)
- `DEEPL_API_KEY` - DeepL translation API (optional, free tier: 500,000 chars/month)

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