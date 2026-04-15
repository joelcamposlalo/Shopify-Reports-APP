# 📊 Shopify Reports APP — ReportesAPI

Custom embedded Shopify app that extends the platform's native reporting limitations, giving merchants access to deeper customer analytics, flexible date ranges, and presentation-ready export formats.

## The Problem

Shopify's built-in reports have hard limits on data scope and date ranges. Merchants who need long-range customer analytics — for quarterly reviews, investor decks, or strategic planning — hit a wall quickly. They end up pulling data manually, stitching spreadsheets together, and formatting everything by hand before it's usable.

## What This App Does

**ReportesAPI** is an embedded Shopify app that sits inside the merchant's admin panel and solves this by:

- **Extending data scope** — Uses expanded API scopes (`read_analytics`, `read_customers`, `read_orders`, `read_all_orders`, `read_products`, `read_reports`) to pull customer and order data beyond Shopify's default reporting limits.
- **Flexible date ranges** — Merchants can generate reports across custom time windows without the restrictions of Shopify's native tools.
- **In-app dashboard** — Visual analytics rendered directly inside the Shopify admin via App Bridge, so merchants don't need to leave their workflow.
- **Presentation-ready exports** — Data is exported in formats ready for business presentations and deeper analysis — no more manual cleanup.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React Router v7 (migrated from Remix) |
| **Frontend** | React 18, Shopify App Bridge, Polaris |
| **Backend** | Node.js, Shopify App React Router |
| **Database** | Prisma ORM (SQLite in dev) |
| **API** | Shopify Admin GraphQL API |
| **Deployment** | Docker, Render |
| **Auth** | Shopify OAuth (embedded app flow) |

## Architecture

```
┌─────────────────────────────────────┐
│         Shopify Admin (iframe)      │
│  ┌───────────────────────────────┐  │
│  │   React + App Bridge + Polaris│  │
│  │   Dashboard & Export UI       │  │
│  └──────────────┬────────────────┘  │
└─────────────────┼───────────────────┘
                  │
      ┌───────────▼───────────┐
      │  React Router Server  │
      │  (Node.js on Render)  │
      ├───────────────────────┤
      │  Shopify Auth (OAuth) │
      │  Session Management   │
      └───────────┬───────────┘
                  │
      ┌───────────▼───────────┐
      │  Shopify GraphQL API  │
      │  (Admin API 2026-04)  │
      │                       │
      │  • Orders             │
      │  • Customers          │
      │  • Products           │
      │  • Analytics          │
      │  • Reports            │
      └───────────┬───────────┘
                  │
      ┌───────────▼───────────┐
      │  Prisma + SQLite      │
      │  (Session Storage)    │
      └───────────────────────┘
```

## Project Structure

```
├── app/                    # React Router app (routes, components, server logic)
├── extensions/             # Shopify app extensions
├── prisma/                 # Prisma schema & migrations (session storage)
├── public/                 # Static assets
├── auth.js                 # Authentication configuration
├── reporte.js              # Report generation logic
├── shopify.app.toml        # Shopify CLI app configuration
├── shopify.web.toml        # Web server configuration
├── Dockerfile              # Production container setup
└── vite.config.js          # Vite bundler configuration
```

## API Scopes

The app requests read-only access to ensure merchant data stays safe:

```
read_analytics, read_customers, read_orders,
read_all_orders, read_products, read_reports
```

No write operations — this app only reads and presents data.

## Local Development

### Prerequisites

- Node.js >= 20.19
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- A Shopify Partner account and dev store

### Setup

```bash
# Clone the repo
git clone https://github.com/joelcamposlalo/Shopify-Reports-APP.git
cd Shopify-Reports-APP

# Install dependencies
npm install

# Set up the database
npx prisma generate
npx prisma migrate deploy

# Start development
npm run dev
```

Press `P` in the terminal to open the app in your dev store.

## Deployment

The app is containerized with Docker and deployed to [Render](https://render.com).

```bash
# Build for production
npm run build

# Deploy to Shopify
npm run deploy
```

## Key Decisions

- **Read-only scopes** — The app never modifies merchant data. All scopes are read-only by design.
- **Embedded app** — Runs inside the Shopify admin via iframe + App Bridge, so merchants never leave their workflow.
- **React Router over Remix** — Migrated to React Router v7 following Shopify's updated template direction.
- **Prisma for sessions** — Lightweight session storage that can scale to PostgreSQL or MySQL when needed.

## Author

**Joel Campos** — Full-Stack Software Engineer

- 🌐 [Portfolio](https://joelcamposlalo.github.io/portfolio/)
- 💼 [LinkedIn](https://www.linkedin.com/in/joel-campos/)
- 📧 joelcamposlalo@gmail.com
