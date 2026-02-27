# EAA Chapter 22 Hugo Website

Modern Hugo site for EAA Chapter 22 with automatic Google Calendar event ingestion and brand color extraction.

## Features

- Hugo-powered static site (no CMS)
- Calendar pipeline: public ICS feed first, Google Calendar API fallback
- Recurring event expansion and rolling window (`EVENTS_DAYS_AHEAD`, default 180)
- Category parsing from title prefixes (`YE:`, `Meeting:`, `Fly-In:`)
- Event detail pages generated at build time
- Per-event `.ics` files generated at build time
- Build-time palette extraction from `BRAND_SOURCE_URL` (default: https://www.eaa320.com/) via Playwright + node-vibrant
- Graceful fallback to cached events and default brand palette
- Docker multi-stage production image + dev workflow

## Environment Variables

- `GOOGLE_CALENDAR_API_KEY` (optional, only used if ICS fetch fails)
- `EVENTS_DAYS_AHEAD` (optional, default: `180`)
- `BRAND_SOURCE_URL` (optional, default: `https://www.eaa320.com/`)

## Local Dev (Docker)

- Start live Hugo dev server:
  - `docker compose up dev`
- Site URL:
  - http://localhost:1313

This runs:
1. Event fetch/generation
2. Brand color extraction
3. `hugo server` with live reload

## Production

- Build and serve:
  - `docker compose up -d web`
- Site URL:
  - http://localhost:8080

## Build Pipeline

At build/start time:

1. `scripts/fetch-events.mjs`
   - Tries Google public ICS feed first
   - Falls back to Google Calendar API if needed and key is available
   - Normalizes and stores events in:
     - `site/data/events.json`
     - `site/data/events.cache.json` (last successful fetch)
   - Generates:
     - `site/content/events/<slug>.md`
     - `site/static/ics/<slug>.ics`

2. `scripts/extract-brand-colors.mjs`
   - Screenshots existing site homepage
   - Extracts palette and writes:
     - `site/assets/css/brand.css`
   - On failure writes fallback aviation palette

## Structure

- `site/` Hugo site
- `scripts/` Node build scripts
- `Dockerfile` multi-stage build
- `docker-compose.yml` dev + prod services
