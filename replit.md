# Apex Mart Wholesale - B2B Wholesale SaaS Platform

## Overview

Apex Mart Wholesale is a multi-tenant B2B wholesale marketplace that connects suppliers with merchants who sell on Shopify and other e-commerce platforms. The platform enables merchants to import products from verified suppliers, automate order fulfillment, and manage their wholesale business through a subscription-based model.

**Core Value Proposition:**
- Admin manages suppliers and the global product catalog
- Merchants connect their Shopify stores and import products with one click
- Orders automatically fulfill through supplier integrations
- Complete data isolation between merchant accounts
- Subscription-based access with product limits

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **React 18** with TypeScript for type-safe component development
- **Vite** as the build tool and development server
- **Wouter** for lightweight client-side routing
- **TanStack Query (React Query)** for server state management and data fetching
- **Tailwind CSS** for utility-first styling with custom design system

**UI Component System:**
- **shadcn/ui** components built on Radix UI primitives
- Custom design system combining Shopify Polaris patterns with Linear aesthetics
- Theme support (light/dark mode) with CSS variables
- Responsive design optimized for desktop-first B2B workflows

**Design Philosophy:**
The application follows a "New York" style from shadcn with professional B2B aesthetics. The design prioritizes data density, clear visual hierarchy, and merchant familiarity through e-commerce patterns. Typography uses Inter font with a structured hierarchy (H1-H4, body, captions). Layout uses Tailwind's 12-column grid system with standardized spacing (2, 4, 6, 8, 12, 16, 20, 24).

**State Management:**
- React Context for auth state (`AuthProvider`) and theme (`ThemeProvider`)
- TanStack Query for server state with custom query client configuration
- Local storage for authentication tokens and theme preferences
- No global state management library (Redux/Zustand) - keeps state local and lifted only when necessary

### Backend Architecture

**Server Framework:**
- **Express.js** with TypeScript on Node.js
- Custom logging middleware for request/response tracking
- Modular route registration pattern
- Development mode with Vite middleware integration
- Production mode serves static built files

**API Design:**
- RESTful API endpoints under `/api/*` prefix
- Planned storage interface pattern for data operations
- Currently using in-memory storage (`MemStorage`) as placeholder
- Designed to swap to database implementation without route changes

**Build System:**
- esbuild for server bundling with selective dependency bundling
- Vite for client bundling with tree-shaking and code splitting
- Two-step build process: client first, then server
- Allowlist approach for bundling specific dependencies to improve cold start times

### Authentication & Authorization

**Multi-Role System:**
- **Admin Role:** Platform-wide access to manage suppliers, merchants, products, and orders
- **Merchant Role:** Isolated access to their own products, orders, customers, and integrations
- **Staff Role:** Team member access with role-based permissions (planned)

**Implementation Approach:**
- Custom authentication context with login/register flows
- JWT tokens stored in localStorage with user data
- Route protection through `ProtectedRoute` component with role checking
- Role-based UI rendering (AdminSidebar vs MerchantSidebar)
- Session-based approach planned with express-session and connect-pg-simple

**Security Considerations:**
- Protected routes redirect to login when unauthenticated
- Role enforcement prevents cross-tenant data access
- Admin routes require `requireAdmin` flag

### Data Storage

**Database Setup:**
- **Drizzle ORM** configured for PostgreSQL
- **PlanetScale PostgreSQL** (us-east-3.pg.psdb.cloud) as primary database
- Schema defined in `shared/schema.ts` with Zod validation
- Migration files in `/migrations` directory
- Database provisioning via `DATABASE_URL` environment variable

**Data Models (from schema.ts):**

1. **Users & Authentication:**
   - User model with roles (admin, merchant, staff)
   - Address schema for user locations
   - Merchant model with subscription details and Shopify integration

2. **Product Catalog:**
   - Suppliers with multi-platform support (GigaB2B, Shopify, Amazon, WooCommerce, Custom)
   - Global products synced from suppliers
   - Merchant-imported products with custom pricing rules
   - Product variants, images, and categories
   - Sync status tracking (pending, synced, failed)

3. **Order Management:**
   - Orders with payment and fulfillment status
   - Order items linked to products and suppliers
   - Item-level fulfillment tracking
   - Customer records with tier-based pricing

4. **Business Logic:**
   - Subscription tiers with product limits
   - Billing intervals (monthly, yearly)
   - Pricing rules (fixed, percentage markup)
   - Customer tiers (bronze, silver, gold, platinum)

**Multi-Tenancy Strategy:**
- Each merchant has a unique `merchantId` foreign key
- Data queries filter by merchant context
- Admin role bypasses tenant filters for platform-wide access
- Complete data isolation prevents cross-merchant data leaks

### External Dependencies

**UI Framework:**
- **Radix UI** primitives for accessible, unstyled components
- **shadcn/ui** for pre-built component patterns
- **Lucide React** for consistent iconography
- **React Icons** for platform-specific icons (Shopify logo)

**Forms & Validation:**
- **React Hook Form** for performant form state management
- **Zod** for runtime schema validation
- **@hookform/resolvers** for Zod integration
- **drizzle-zod** for database schema validation

**Development Tools:**
- **Replit plugins** for development banner, error overlay, and cartographer
- **TypeScript** with strict mode for type safety
- **ESLint** and **Prettier** (implied by shadcn setup)

**Planned Integrations:**
- **Shopify OAuth** for merchant store connections
- **Stripe** for subscription billing
- **Email service** (Nodemailer dependency present)
- **Supplier APIs** (GigaB2B, Amazon, WooCommerce) for product syncing

**Third-Party Services:**
- Shopify API for product import/export and order fulfillment
- Payment processing through Stripe
- Email notifications for order updates and alerts
- **Claude AI (Anthropic)** for semantic product search - understands natural language queries
- **AWS S3** for secure image storage with tenant-scoped access
- Simple in-memory cache for performance optimization

### File Structure Patterns

**Monorepo Structure:**
- `/client` - Frontend React application
- `/server` - Backend Express API
- `/shared` - Shared TypeScript types and schemas
- `/migrations` - Database migration files
- `/attached_assets` - Project documentation and requirements
- `/script` - Build scripts

**Path Aliases:**
- `@/*` resolves to `client/src/*`
- `@shared/*` resolves to `shared/*`
- `@assets/*` resolves to `attached_assets/*`

**Component Organization:**
- `/components/ui` - Reusable shadcn/ui components
- `/components/*-sidebar.tsx` - Role-specific navigation
- `/pages` - Route-level page components organized by role
- `/lib` - Utilities, hooks, and context providers

## Recent Changes

**December 5, 2025 (Infrastructure Upgrades):**
- Migrated database to **PlanetScale PostgreSQL** (us-east-3.pg.psdb.cloud)
- Integrated **Claude AI (Anthropic)** for semantic product search:
  - Uses claude-3-5-sonnet-20241022 for query analysis
  - Extracts keywords, categories, price ranges, and product attributes
  - Fallback to basic keyword search if AI unavailable
  - API endpoint: `GET /api/search/products?q=<query>`
  - Autocomplete: `GET /api/search/suggestions?q=<query>`
- Integrated **AWS S3** for image storage with tenant-scoped security:
  - Signed URL uploads for direct browser uploads
  - Tenant isolation - merchants can only access their own files
  - File type validation (JPEG, PNG, GIF, WebP) and 10MB size limit
  - Server-side encryption (AES256)
  - API endpoints: `POST /api/upload/signed-url`, `DELETE /api/upload/:key`
- Added simple in-memory cache service (replaces Redis requirement)
- New service files: `server/services/ai-search.ts`, `server/services/s3-storage.ts`, `server/services/cache.ts`

**December 3, 2025 (Catalog Redesign):**
- Completely redesigned merchant catalog page with GigaB2B-style B2B marketplace layout:
  - Navigation tabs: All Products, New Arrivals (last 30 days), Hot Deals (products with discount), Trending (top 50 by inventory)
  - Collapsible filter sidebar with sections: Price Range (slider + inputs), Availability (in-stock toggle + minimum quantity), Suppliers (multi-select checkboxes), Categories (multi-select checkboxes)
  - Sort buttons with ASC/DESC toggle for Price, Stock, Date (with aria-pressed/data-sort-direction for accessibility)
  - Grid/List view modes with responsive product cards
  - Multi-select product import with custom pricing rules
  - Active filters badge showing count of applied filters
  - Search across title, category, and SKU
- Fixed getCompareAtPrice to check all product variants for discounts (not just first variant)
- Added stable accessibility attributes (aria-pressed, data-sort-direction) to sort buttons

**December 3, 2025:**
- Added admin product price markup editing with bulk edit capabilities:
  - Single product markup editing via dialog with percentage or fixed amount options
  - Bulk selection with checkboxes for selecting multiple products
  - Bulk edit dialog to apply same markup to multiple products at once
  - Preview price calculation before saving
  - API endpoints: `PATCH /api/admin/products/:id/pricing` and `PATCH /api/admin/products/bulk-pricing`
  - Storage methods: `updateProductPricing` and `bulkUpdateProductPricing`
- Updated landing page pricing section with new 5-tier plan display:
  - Free ($0), Starter ($29), Growth ($49), Professional ($99), Millionaire ($499)
  - Millionaire plan has "FUTURE MILLIONAIRE CHOICE" gold badge
- Implemented comprehensive 6-tier subscription system:
  - Free: 25 products, 50 orders, no AI ads
  - Starter ($29/mo): 100 products, 500 orders, 1 AI ad/day
  - Growth ($49/mo): 500 products, 2500 orders, 2 AI ads/day
  - Professional ($99/mo): 2500 products, unlimited orders, 3 AI ads/day + video ads
  - Millionaire ($499/mo): Unlimited products/orders, 5 AI ads/day + white-label + VIP support
  - FREE FOR LIFE: Automatically unlocked at $50k lifetime sales - all features forever
- Added `ad_creatives` table for AI-generated marketing content
- Updated `subscriptions` table with lifetimeSales tracking and progressToFreeForLife
- Added storage methods: `getPlanBySlug`, `updateSubscriptionLifetimeSales`, `checkAndUnlockFreeForLife`, ad creative CRUD
- Built merchant subscription page with:
  - FREE FOR LIFE progress bar showing sales milestone
  - 6-tier plan cards with feature icons (AI ads, video, white-label, VIP support)
  - Plan upgrade flow with mutation
  - Current plan usage stats (products, orders, team)
- Added API routes for subscription upgrade and ad creative generation

**December 2, 2025:**
- Converted 18+ Zod schemas to Drizzle ORM tables with full multi-tenant structure
- Implemented complete storage layer with CRUD operations for all entities (users, merchants, suppliers, products, orders, customers, subscriptions)
- Built comprehensive API routes: authentication (login/register with bcrypt + JWT), admin endpoints (dashboard stats, suppliers, merchants, products, orders), and merchant endpoints
- Connected frontend to backend: updated queryClient with Authorization headers, fixed auth context to store merchant data
- Fixed routing and navigation: login/register redirects properly to /admin or /dashboard based on role
- Fixed API endpoint references in merchant pages:
  - Catalog: `/api/merchant/catalog`
  - Products: `/api/merchant/products`
  - Orders: `/api/merchant/orders`
  - Customers: `/api/merchant/customers`
- Added order fulfill endpoint (`POST /api/merchant/orders/:id/fulfill`)
- Fixed data references to match schema (flat fields instead of nested objects for orders and customers)

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login with JWT token
- `GET /api/auth/me` - Get current user

### Admin Routes (requires admin role)
- `GET /api/admin/dashboard` - Admin dashboard stats
- `GET/POST /api/admin/suppliers` - Supplier management
- `GET/POST /api/admin/products` - Global product catalog
- `PATCH /api/admin/products/:id/pricing` - Update single product markup
- `PATCH /api/admin/products/bulk-pricing` - Bulk update product markup
- `GET /api/admin/merchants` - Merchant listing
- `GET /api/admin/orders` - All orders across merchants

### Merchant Routes (requires merchant role)
- `GET /api/merchant/dashboard` - Merchant dashboard stats
- `GET /api/merchant/catalog` - Browse global product catalog
- `GET/POST /api/merchant/products` - Merchant's imported products
- `PUT/DELETE /api/merchant/products/:id` - Update/delete product
- `POST /api/merchant/products/import` - Import product from catalog
- `GET /api/merchant/orders` - Merchant's orders
- `POST /api/merchant/orders/:id/fulfill` - Fulfill an order
- `GET/POST /api/merchant/customers` - Customer management