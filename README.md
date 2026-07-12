# Status Page Monitoring System

A self-hosted, real-time service monitoring and status page application built with Next.js 16. Inspired by UptimeRobot and BetterStack, it provides a polished public status page with a 90-day uptime grid, an admin dashboard with interactive charts, automatic incident management, and security-hardened API endpoints.

---

## Features

- **Public Status Page** — UptimeRobot/BetterStack-style landing page with overall system health, per-service status bars, and active incident banners
- **90-Day Uptime Grid** — GitHub contributions-style heatmap showing daily availability at a glance
- **Dark / Light Mode** — System-aware theme toggle with persistent user preference
- **Service Monitoring** — HTTP health checks via `GET`, `HEAD`, or `POST` with configurable timeouts and intervals
- **Automatic Incident Lifecycle** — Incidents are created on down transitions and auto-resolved when services recover
- **Admin Dashboard** — Rich panel with Chart.js-powered response-time and availability charts, service CRUD, incident management, and maintenance scheduling
- **Maintenance Scheduling** — Plan and display scheduled maintenance windows on the public page
- **Check History Viewer** — Paginated log of every health check with status, latency, and error details
- **JWT Authentication** — Token-based auth with `Authorization: Bearer` header or cookie fallback; forced password change on first login
- **Rate Limiting** — Sliding-window rate limiter applied to every API endpoint with per-route granularity
- **SSRF Protection** — Private IP blocking, scheme whitelisting (HTTP/HTTPS only), credential-URL rejection, and safe single-hop redirect following
- **OWASP-aligned Headers** — CSP, HSTS, X-Frame-Options, nosniff, Permissions-Policy, and powered-by removal baked into `next.config.ts`
- **Standalone Mini-Monitor** — A lightweight Bun-based monitor service (`mini-services/monitor/`) that runs health checks on a 60-second loop independently of the web server

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, standalone output) |
| UI | React 19, TailwindCSS 4, shadcn/ui, Lucide Icons, Framer Motion |
| Language | TypeScript 5 |
| Database | SQLite (dev) / Turso (production-ready) |
| ORM | Prisma 6 |
| Charts | Chart.js 4 + react-chartjs-2 |
| Auth | jose (HS256 JWT), bcryptjs (12-round bcrypt) |
| Validation | Zod 4 |
| Dates | date-fns 4 |
| Runtime | Node.js or Bun |

---

## Project Structure

```
src/
  app/
    api/
      auth/login/route.ts            # POST — authenticate and issue JWT
      auth/change-password/route.ts  # POST — change password (forced on first login)
      services/route.ts              # GET (list) / POST (create)
      services/[id]/route.ts         # PUT (update) / DELETE (remove)
      status/route.ts                # GET — public status overview
      incidents/route.ts             # GET (list)
      incidents/[id]/route.ts        # PUT (update status)
      history/route.ts               # GET — paginated check history
      maintenance/route.ts           # GET (list) / POST (create)
      maintenance/[id]/route.ts      # PUT (update) / DELETE (remove)
      stats/route.ts                 # GET — dashboard statistics
      cron/monitor/route.ts          # POST — trigger monitoring cycle
    page.tsx                         # Root page (renders StatusPage)
    layout.tsx                       # Root layout with theme provider
    globals.css                      # TailwindCSS 4 entry point
  components/
    status/StatusPage.tsx            # Public-facing status page
    admin/AdminPanel.tsx             # Full admin dashboard
    admin/LoginDialog.tsx            # Login / change-password dialog
    ui/                              # shadcn/ui primitives (button, card, dialog, table, …)
  hooks/
    use-api.ts                       # Typed API client hook
    use-toast.ts                     # Toast notification hook
    use-mobile.ts                    # Responsive breakpoint hook
  lib/
    auth.ts                          # JWT sign/verify, bcrypt helpers, auth extraction
    db.ts                            # Singleton Prisma client (HMR-safe in dev)
    monitor.ts                       # HTTP health check engine with SSRF protection
    seed.ts                          # Database seeder (creates default admin)
    stats.ts                         # Availability, latency, uptime/downtime calculators
    rate-limit.ts                    # In-memory sliding-window rate limiter
    utils.ts                         # cn() and general utilities
  types/
    index.ts                         # Shared TypeScript interfaces
database/
  status.db                          # SQLite database file (dev)
mini-services/
  monitor/
    index.ts                         # Standalone Bun monitor (60s loop + /health + /check)
    package.json
    prisma/schema.prisma
prisma/
  schema.prisma                      # Database schema (User, Service, CheckHistory, Incident, Maintenance, DailyStats)
```

---

## Installation

### Prerequisites

- **Node.js** >= 18.17 or **Bun** >= 1.0
- A package manager (npm, yarn, pnpm, or bun)

### Clone

```bash
git clone https://github.com/your-username/status-page.git
cd status-page
```

### Install Dependencies

```bash
npm install
# or: bun install
```

### Environment Setup

Create a `.env` file in the project root (see [Configuration](#configuration) for all variables):

```env
# Required — use a random string of at least 32 characters
JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars

# Required for the cron monitor endpoint
CRON_SECRET=your-cron-secret-key

# Database (SQLite for local dev)
DATABASE_URL=file:./database/status.db

# Admin credentials (only used during seeding)
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
```

### Database Setup

```bash
# Generate the Prisma client
npx prisma generate

# Push the schema to the database (creates tables without migration files)
npx prisma db push

# Seed the default admin user
npx tsx src/lib/seed.ts
```

### Run in Development

```bash
npm run dev
# or: bun run dev
```

The application starts at [http://localhost:3000](http://localhost:3000).

### Default Credentials

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

> You will be forced to change the password on first login.

---

## Configuration

All configuration is done through environment variables. Create a `.env` file in the project root.

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | — | Secret key for signing JWTs. Must be at least 32 characters. Use `openssl rand -base64 48` to generate one. |
| `CRON_SECRET` | **Yes** | — | Shared secret for authenticating cron monitor requests. Sent in the `CRON_SECRET` request header. |
| `DATABASE_URL` | No | `file:./database/status.db` | Prisma database connection string. For SQLite use `file:./path/to/db`. For Turso use `libsql://your-db.turso.io` with `DATABASE_URL` and `DATABASE_AUTH_TOKEN`. |
| `DATABASE_AUTH_TOKEN` | No | — | Turso authentication token. Only required when using Turso as the database provider. |
| `ADMIN_USER` | No | `admin` | Username for the default admin account created during seeding. |
| `ADMIN_PASSWORD` | No | `admin123` | Password for the default admin account created during seeding. |
| `ALLOWED_ORIGIN` | No | `""` (empty) | Value for the `Access-Control-Allow-Origin` response header on API routes. Set to your domain (e.g. `https://status.example.com`) if the API is consumed from a different origin. |

### Turso Example

```env
DATABASE_URL=libsql://status-page-your-org.turso.io
DATABASE_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
JWT_SECRET=<generated-48-char-secret>
CRON_SECRET=<generated-cron-secret>
```

When using Turso, update the Prisma schema datasource:

```prisma
datasource db {
  provider = "libsql"
  url      = env("DATABASE_URL")
}
```

Then re-run `npx prisma generate` and `npx prisma db push`.

---

## Deployment

### Vercel (Recommended)

1. Push your repository to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Set all environment variables from the [Configuration](#configuration) section in the Vercel dashboard under **Settings → Environment Variables**.
4. Deploy.

#### Cron Jobs on Vercel

Vercel does not run background processes. You must use an external cron service (e.g. [EasyCron](https://easycron.com), [Cron-job.org](https://cron-job.org), or GitHub Actions) to call the monitor endpoint on a schedule.

**Setup:**

1. Set `CRON_SECRET` in your Vercel environment variables.
2. Configure your cron service to make a `POST` request every 60 seconds:

```
POST https://your-deployment.vercel.app/api/cron/monitor
Header: CRON_SECRET: your-cron-secret-key
```

3. Adjust the frequency based on your monitoring needs. The minimum practical interval depends on your Vercel plan's function execution limits.

#### GitHub Actions Alternative

Create `.github/workflows/monitor.yml`:

```yaml
name: Status Monitor
on:
  schedule:
    - cron: '*/1 * * * *'  # every minute
jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST "${{ secrets.STATUS_URL }}/api/cron/monitor" \
            -H "CRON_SECRET: ${{ secrets.CRON_SECRET }}"
```

Add `STATUS_URL` and `CRON_SECRET` to your GitHub repository secrets.

### Docker / Self-Hosted

The project uses Next.js `standalone` output. Build and run with Node.js or Bun:

```bash
npm run build
npm run start
# or: bun run build && bun run start
```

This starts the production server on port 3000.

#### Caddy Reverse Proxy (Included)

A `Caddyfile` is provided in the project root. It proxies requests on port 81 to the Next.js server on port 3000 and forwards real client IPs:

```
caddy run --config Caddyfile
```

#### Using the Standalone Mini-Monitor

For self-hosted setups that need a persistent monitoring process instead of cron:

```bash
cd mini-services/monitor
bun install
bun run dev
```

This starts a Bun HTTP server on port 3001 that runs health checks every 60 seconds. It exposes:

- `GET /health` — Returns `{ status: "ok", timestamp: "..." }`
- `POST /check` — Manually triggers a monitoring cycle

> The mini-monitor shares the same Prisma schema and database. Make sure `DATABASE_URL` points to the same database file or Turso instance.

---

## Build Instructions

```bash
# 1. Generate Prisma client
npx prisma generate

# 2. Build the Next.js application
npm run build
```

The `build` script in `package.json` performs three steps:

1. `next build` — Compiles the application into `.next/standalone/`
2. `cp -r .next/static .next/standalone/.next/` — Copies static assets
3. `cp -r public .next/standalone/` — Copies public files

The result is a self-contained output in `.next/standalone/` that can be deployed without `node_modules`.

---

## Database Migrations

This project uses `prisma db push` for development, which applies schema changes directly without generating migration files.

### For Development

```bash
# Apply schema changes to the database
npx prisma db push

# Reset the database (drops all data)
npx prisma db reset

# Regenerate the Prisma client after schema changes
npx prisma generate
```

### For Production

If you prefer versioned migrations:

```bash
# Create a migration
npx prisma migrate dev --name describe-your-change

# Apply pending migrations in production
npx prisma migrate deploy
```

> When using Turso, prefer `prisma db push` for schema changes. Turso does not support Prisma's migration history tables natively.

### Schema Overview

| Model | Purpose |
|---|---|
| `User` | Admin accounts with bcrypt-hashed passwords and forced-change flag |
| `Service` | Monitored endpoints (URL, HTTP method, timeout, check interval) |
| `CheckHistory` | Individual health check results (status, latency, error) |
| `Incident` | Downtime events auto-created on down transitions, auto-resolved on recovery |
| `Maintenance` | Scheduled maintenance windows |
| `DailyStats` | Aggregated daily metrics per service (uptime, downtime, availability, avg response time) |

---

## How It Works

### Monitoring Engine

The health check engine (`src/lib/monitor.ts`) performs the following for each active service:

1. **URL Validation** — Parses the URL and rejects non-HTTP/HTTPS schemes, private/internal IP addresses (RFC 1918, loopback, link-local, carrier-grade NAT, benchmark ranges), and URLs containing embedded credentials.
2. **HTTP Request** — Sends a request using the configured method (`GET`, `HEAD`, or `POST`) with the configured timeout (default 30 seconds). Redirects are not followed automatically; if a 3xx response is received, the redirect target is validated through the same SSRF checks before being followed once.
3. **Status Determination** — HTTP status codes below 400 are classified as `up`; 4xx/5xx responses and network errors are classified as `down`.
4. **Latency Recording** — The time from request start to response end is recorded in milliseconds.

### Cron Cycle

When the cron endpoint (`POST /api/cron/monitor`) is called:

1. The `CRON_SECRET` header is verified using constant-time comparison (SHA-256) to prevent timing attacks.
2. All active services are fetched from the database.
3. For each service, the previous check status is retrieved.
4. A health check is performed and the result is stored in `CheckHistory`.
5. **State transitions** are handled:
   - **up → down**: A new `Incident` is created with status `investigating`.
   - **down → up**: The most recent unresolved `Incident` for that service is updated to `resolved` with the calculated duration.
6. Daily statistics are recomputed for all services and upserted into `DailyStats`.

### API Layer

All API routes follow a consistent pattern:

- **Authentication** — Admin endpoints extract the JWT from the `Authorization: Bearer` header or from a `token` cookie. Public endpoints (`/api/status`, `/api/cron/monitor`) require no auth.
- **Rate Limiting** — Every endpoint calls `checkRateLimit()` before processing. Rate limits are IP-based (via `X-Forwarded-For` > `X-Real-IP` > fallback) and scoped per route type.
- **Input Validation** — Request bodies are validated with Zod schemas before processing.
- **Response Format** — All responses use a consistent `ApiResponse<T>` wrapper: `{ success: boolean, data?: T, error?: string, message?: string }`.

### Frontend

- **Status Page** (`StatusPage.tsx`) — Server-side rendered public page. Fetches service statuses, 90-day history, active incidents, and scheduled maintenance. Renders the uptime grid, overall availability bar, and incident timeline.
- **Admin Panel** (`AdminPanel.tsx`) — Client-side React component behind JWT auth. Uses `use-api.ts` hook for typed API calls. Includes tabs for Services, Incidents, Maintenance, History, and a Dashboard with Chart.js charts.
- **Theme** — Managed by `next-themes`. The layout wraps the app in a `ThemeProvider` that persists the user's preference to `localStorage`.

---

## Updating

### Standard Update

```bash
git pull origin main
npm install
npx prisma generate
npx prisma db push    # applies any schema changes
npm run build
npm run start         # or restart your process manager
```

### Zero-Downtime Updates (Docker / PM2)

If using a process manager that supports graceful restarts:

```bash
git pull origin main
npm install
npx prisma generate
npx prisma db push
npm run build
pm2 restart status-page   # or: docker compose up -d --build
```

> Prisma `db push` is additive — it creates new tables and columns but does not drop existing ones, so it is safe to run on a live database.

---

## Backup Instructions

### SQLite

The database file is located at `database/status.db` (configurable via `DATABASE_URL`).

```bash
# Create a backup
cp database/status.db backups/status-$(date +%Y%m%d-%H%M%S).db

# Compress for storage
gzip backups/status-$(date +%Y%m%d-%H%M%S).db
```

For automated backups, add a cron job:

```bash
# Run daily at 2 AM
0 2 * * * cp /path/to/status-page/database/status.db /path/to/backups/status-$(date +\%Y\%m\%d).db
```

### Turso

Turso provides built-in database backups. You can also export manually:

```bash
# Create a local copy
turso db shell status-page-your-org .dump > backup.sql

# Restore from dump
turso db shell status-page-your-org < backup.sql
```

### Restoring a Backup

1. Stop the application.
2. Replace the database file with the backup copy.
3. Run `npx prisma generate` to regenerate the client.
4. Start the application.

---

## Security Overview

### Authentication

- Passwords are hashed with **bcrypt** at 12 salt rounds.
- JWTs are signed with **HS256** using `jose` and expire after **24 hours**.
- New users are flagged with `mustChangePwd: true`, forcing an immediate password change before accessing the admin panel.

### Transport Security

- **HSTS** header with 2-year max-age, includeSubDomains, and preload.
- **CSP** restricts script, style, image, font, and connect sources to `'self'`.
- **X-Frame-Options: DENY** prevents clickjacking.
- **X-Content-Type-Options: nosniff** prevents MIME sniffing.
- **Permissions-Policy** disables camera, microphone, geolocation, and interest-cohort.
- **X-Powered-By** header is removed.

### SSRF Protection

- Only `http://` and `https://` schemes are allowed.
- Private/internal IPv4 ranges are blocked: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8, 224.0.0.0/4, 100.64.0.0/10, 198.18.0.0/15.
- Private IPv6 ranges are blocked: `::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`, and IPv4-mapped private ranges.
- URLs with embedded credentials (`http://user:pass@host`) are rejected.
- Redirects are not followed automatically; redirect targets undergo the same SSRF validation.

### Rate Limiting

| Endpoint Type | Limit | Window |
|---|---|---|
| Login | 5 requests | 15 minutes |
| Password change | 3 requests | 15 minutes |
| Authenticated mutations | 60 requests | 1 minute |
| Authenticated reads | 120 requests | 1 minute |
| Public reads | 30 requests | 1 minute |
| Cron | 10 requests | 1 minute |

Rate limiting is in-memory with automatic cleanup of stale entries every 5 minutes. For multi-instance deployments, consider replacing this with a Redis-backed solution.

### Input Validation

All API request bodies are validated with **Zod** schemas before processing. Invalid input returns a `400 Bad Request` with a descriptive error message.

### Cron Security

The `/api/cron/monitor` endpoint uses **constant-time comparison** (`crypto.timingSafeEqual`) on SHA-256 hashes of the expected and provided secrets, preventing timing side-channel attacks.

---

## API Documentation

### Authentication

#### `POST /api/auth/login`

Authenticate and receive a JWT.

**Request Body:**

```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "clx...",
      "username": "admin",
      "mustChangePwd": true
    }
  }
}
```

**Usage:** Include `Authorization: Bearer <token>` in subsequent requests, or store the token in a cookie named `token`.

---

#### `POST /api/auth/change-password`

Change the authenticated user's password. Required on first login when `mustChangePwd` is `true`.

**Request Body:**

```json
{
  "currentPassword": "admin123",
  "newPassword": "my-secure-new-password"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### Services

#### `GET /api/services`

List all services. **Requires authentication.**

**Query Parameters:** `page` (default 1), `limit` (default 20)

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "name": "API Server",
      "description": "Main REST API",
      "url": "https://api.example.com/health",
      "method": "GET",
      "timeout": 30000,
      "interval": 60,
      "active": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5 }
}
```

---

#### `POST /api/services`

Create a new service. **Requires authentication.**

**Request Body:**

```json
{
  "name": "Website",
  "description": "Public website",
  "url": "https://example.com",
  "method": "GET",
  "timeout": 30000,
  "interval": 60
}
```

**Response (201):**

```json
{
  "success": true,
  "data": { "id": "clx...", "name": "Website", ... }
}
```

---

#### `PUT /api/services/[id]`

Update a service. **Requires authentication.**

**Request Body:** Partial — only include fields to update.

```json
{
  "name": "Website (Updated)",
  "active": false
}
```

---

#### `DELETE /api/services/[id]`

Delete a service and all associated check history and incidents (cascade). **Requires authentication.**

**Response (200):**

```json
{
  "success": true,
  "message": "Service deleted"
}
```

---

### Public Status

#### `GET /api/status`

Returns the public status overview including all services with their current status, 90-day uptime, and active incidents. **No authentication required.**

**Response (200):**

```json
{
  "success": true,
  "data": {
    "services": [
      {
        "id": "clx...",
        "name": "API Server",
        "currentStatus": "up",
        "availability90d": 99.95,
        "avgLatency": 142,
        "uptime24h": 100,
        "uptime7d": 99.98,
        "uptime30d": 99.95,
        "uptime90d": 99.95
      }
    ],
    "activeIncidents": [],
    "activeMaintenances": []
  }
}
```

---

### Incidents

#### `GET /api/incidents`

List all incidents. **Requires authentication.**

**Query Parameters:** `page`, `limit`, `status` (optional filter: `investigating`, `identified`, `monitoring`, `resolved`)

---

#### `PUT /api/incidents/[id]`

Update an incident (e.g. change status to `resolved`). **Requires authentication.**

**Request Body:**

```json
{
  "status": "resolved",
  "title": "Updated incident title",
  "description": "Root cause identified and fixed"
}
```

---

### Check History

#### `GET /api/history`

Paginated log of health check results. **Requires authentication.**

**Query Parameters:** `page`, `limit`, `serviceId` (optional filter), `status` (optional filter: `up`/`down`)

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "serviceId": "clx...",
      "checkedAt": "2025-01-15T10:30:00.000Z",
      "status": "up",
      "statusCode": 200,
      "latency": 142,
      "error": null
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1240 }
}
```

---

### Maintenance

#### `GET /api/maintenance`

List maintenance windows. **No authentication required.**

#### `POST /api/maintenance`

Create a maintenance window. **Requires authentication.**

**Request Body:**

```json
{
  "title": "Database Migration",
  "description": "Scheduled downtime for database upgrade",
  "startsAt": "2025-02-01T02:00:00.000Z",
  "endsAt": "2025-02-01T04:00:00.000Z"
}
```

#### `PUT /api/maintenance/[id]`

Update a maintenance window. **Requires authentication.**

#### `DELETE /api/maintenance/[id]`

Delete a maintenance window. **Requires authentication.**

---

### Statistics

#### `GET /api/stats`

Dashboard statistics and chart data. **Requires authentication.**

**Response (200):**

```json
{
  "success": true,
  "data": {
    "overview": {
      "totalServices": 5,
      "onlineServices": 4,
      "offlineServices": 1,
      "overallAvailability": 99.87,
      "activeIncidents": 1,
      "avgLatency": 198
    },
    "chartData": { ... },
    "dailyStats": [ ... ]
  }
}
```

---

### Cron Monitor

#### `POST /api/cron/monitor`

Trigger a monitoring cycle for all active services. **Requires `CRON_SECRET` header.**

**Request:**

```
POST /api/cron/monitor
CRON_SECRET: your-cron-secret-key
```

**Response (200):**

```json
{
  "checked": 5,
  "up": 4,
  "down": 1,
  "incidents": 0
}
```

**Error Responses:**

| Status | Condition |
|---|---|
| `401` | Invalid or missing `CRON_SECRET` header |
| `429` | Rate limited (max 10 requests per minute) |
| `503` | `CRON_SECRET` environment variable not configured |

---

### Common Error Responses

All endpoints may return:

| Status | Description |
|---|---|
| `400` | Invalid request body (failed Zod validation) |
| `401` | Missing or invalid JWT token |
| `403` | Insufficient permissions or password change required |
| `404` | Resource not found |
| `429` | Rate limited (includes `Retry-After` header with seconds) |
| `500` | Internal server error |

---

## License

MIT