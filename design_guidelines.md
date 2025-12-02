# Apex Mart Wholesale - Design Guidelines

## Design Approach

**Selected Approach:** Hybrid Design System combining Shopify Polaris principles with Linear's refinement for a professional B2B SaaS platform.

**Rationale:** This B2B wholesale marketplace requires trustworthy, data-dense interfaces with e-commerce familiarity. Shopify Polaris provides merchant-friendly patterns while Linear's clean aesthetics elevate the admin experience.

**Key Design Principles:**
- Professional credibility for B2B relationships
- Clear visual hierarchy for complex multi-role interfaces
- Data-first layouts optimizing information density
- Merchant familiarity through e-commerce patterns

---

## Typography

**Font System:** Inter (via Google Fonts CDN)

**Hierarchy:**
- **H1:** text-4xl font-bold (Admin panel headers, main dashboard titles)
- **H2:** text-3xl font-semibold (Section headers, page titles)
- **H3:** text-2xl font-semibold (Card headers, subsection titles)
- **H4:** text-xl font-medium (Table headers, form section labels)
- **Body Large:** text-base font-normal (Primary content, descriptions)
- **Body Small:** text-sm font-normal (Table data, secondary text)
- **Caption:** text-xs font-medium (Labels, metadata, timestamps)
- **Button Text:** text-sm font-semibold (All button labels)

---

## Layout System

**Spacing Units:** Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24

**Application:**
- Component padding: p-6 (cards), p-8 (main containers)
- Section gaps: gap-6 (grids), gap-8 (major sections)
- Page margins: px-8 py-6 (dashboard content)
- Stack spacing: space-y-4 (forms), space-y-6 (sections)

**Grid System:**
- Dashboard layouts: 12-column grid with gap-6
- Sidebar: fixed w-64 (collapsed: w-16)
- Main content: max-w-7xl with responsive padding
- Cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4

---

## Component Library

### Navigation

**Admin Sidebar:**
- Fixed left navigation (w-64)
- Logo at top with merchant/admin identifier
- Grouped menu items with icons (Heroicons)
- Active state with subtle background
- Collapsible for focus mode

**Merchant Sidebar:**
- Similar structure with merchant-specific sections
- Subscription tier badge visible
- Product count vs. limit indicator

**Top Navigation:**
- Breadcrumb navigation for deep pages
- Global search bar (center)
- Notification bell with badge
- User profile dropdown (right)

### Data Tables

**Standard Table Pattern:**
- Sticky header row
- Alternating row backgrounds for readability
- Sortable columns with icons
- Action column (right-aligned)
- Pagination with page size selector
- Bulk selection with checkboxes
- Responsive: stacked cards on mobile

**Table Features:**
- Filters sidebar (collapsible)
- Search within table
- Column visibility toggles
- Export functionality (CSV, Excel)

### Cards

**Product Cards:**
- Image thumbnail (aspect-ratio-square)
- Title (truncate 2 lines)
- Pricing display (original + merchant price)
- Supplier badge
- Stock status indicator
- Quick action buttons (hover overlay)

**Dashboard Stat Cards:**
- Large number (text-3xl font-bold)
- Label (text-sm)
- Trend indicator with arrow icon
- Sparkline chart (optional)
- Percentage change badge

**Order Cards:**
- Order number header
- Customer info section
- Items preview (expandable)
- Status badges
- Action buttons footer

### Forms

**Input Pattern:**
- Label above (text-sm font-medium)
- Input field with border
- Helper text below (text-xs)
- Error state with red accent and icon
- Required field indicator (*)

**Form Layouts:**
- Single column for narrow forms
- Two-column for wider screens (grid-cols-2 gap-6)
- Section dividers for grouped fields
- Sticky footer with action buttons

### Buttons

**Primary Actions:** Solid background, semibold text
**Secondary Actions:** Bordered with transparent background
**Destructive Actions:** Red variant
**Icon Buttons:** Square with icon only (common actions)
**Button Groups:** Connected buttons for related actions

### Modals & Dialogs

**Standard Modal:**
- Backdrop with blur
- Centered card (max-w-2xl)
- Header with title and close button
- Body with scrollable content
- Footer with action buttons (right-aligned)

**Confirmation Dialogs:**
- Smaller size (max-w-md)
- Icon at top (warning/success)
- Clear messaging
- Two-button choice (cancel + confirm)

### Status Indicators

**Badges:**
- Rounded full with px-3 py-1
- Text-xs font-medium
- Order status: pending, processing, completed, cancelled
- Product status: active, draft, archived
- Subscription: trial, active, expired

**Progress Indicators:**
- Step indicators for onboarding flows
- Order fulfillment progress bars
- Sync status with animated spinner

### Charts & Analytics

**Dashboard Charts:**
- Line charts for revenue trends
- Bar charts for product performance
- Donut charts for category distribution
- Use Chart.js or Recharts library

**Data Visualization:**
- Tooltips on hover
- Legend placement (top-right)
- Responsive scaling
- Export chart functionality

---

## Page-Specific Layouts

### Landing Page (Public)

**Hero Section:**
- Split layout: headline + features (left) | dashboard preview mockup (right)
- Large headline (text-5xl font-bold)
- Subtitle (text-xl)
- CTA buttons (primary + secondary)
- Trust indicators below (logos of suppliers)

**Features Grid:** 3-column layout showcasing core capabilities with icons
**Pricing Table:** 4-column comparison (Free, Starter, Pro, Enterprise)
**Testimonials:** 2-column merchant success stories with avatars
**CTA Footer:** Sign up prompt with email capture

### Admin Dashboard

**Layout:**
- Fixed sidebar (left)
- Main content area with top navigation
- Platform-wide stats cards (4-column grid)
- Recent merchants table
- Supplier sync status cards
- System health indicators

### Merchant Dashboard

**Layout:**
- Fixed sidebar (left) with subscription info
- Top navigation with Shopify connection status
- Key metrics cards (Revenue, Orders, Products, Customers)
- Quick actions grid (Import Products, View Orders, etc.)
- Recent orders table
- Trending products section

### Product Catalog (Merchant View)

**Layout:**
- Filter sidebar (left, collapsible)
- Grid view with product cards (default)
- List view option (toggle)
- Search and sort controls (top)
- Pagination (bottom)
- Import selected button (sticky bottom bar)

### Order Management

**Layout:**
- Orders table with filters
- Status filter tabs (All, Pending, Processing, etc.)
- Search by order number/customer
- Expandable rows for order details
- Bulk actions toolbar

---

## Images

**Hero Section (Landing Page):**
- Dashboard mockup screenshot showing merchant interface with product grid and analytics
- High-quality, modern UI preview
- Placement: Right side of hero split layout

**Feature Sections:**
- Icons from Heroicons for feature highlights
- Optional: Small illustrations for key workflows (product import, order fulfillment)

**Testimonials:**
- Merchant headshots (circular avatars)
- Optional: Store logo badges

**Empty States:**
- Illustrations for empty tables/lists ("No products yet")
- Helpful imagery encouraging first actions

---

## Accessibility & Interactions

- All interactive elements have focus states
- Form validation with clear error messaging
- Loading states for async operations (skeleton screens)
- Toast notifications for actions (top-right)
- Keyboard navigation throughout
- ARIA labels for icon-only buttons

---

## Responsive Behavior

**Mobile (<768px):**
- Sidebar becomes bottom navigation
- Tables convert to stacked cards
- Grid layouts become single column
- Forms remain single column

**Tablet (768-1024px):**
- Sidebar remains visible
- 2-column layouts where appropriate
- Reduced grid density

**Desktop (>1024px):**
- Full layout with sidebar
- Multi-column grids
- Enhanced data tables