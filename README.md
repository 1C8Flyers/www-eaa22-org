# EAA Chapter 22 Hugo Website

Modern Hugo site for EAA Chapter 22 with automatic Google Calendar event ingestion and photo feed integration.

## Features

- Hugo-powered static site (no CMS)
- Calendar pipeline: public ICS feed first, Google Calendar API fallback
- Recurring event expansion and rolling window (`EVENTS_DAYS_AHEAD`, default 180)
- Category parsing from title prefixes (`YE:`, `Meeting:`, `Fly-In:`)
- Event detail pages generated at build time
- Per-event `.ics` files generated at build time
- Home photo strip populated from Google Drive feed via Apps Script
- Fixed chapter brand palette in `site/assets/css/brand.css`
- Docker multi-stage production image + dev workflow

## Environment Variables

- `GOOGLE_CALENDAR_API_KEY` (optional, only used if ICS fetch fails)
- `EVENTS_DAYS_AHEAD` (optional, default: `180`)
- `PHOTO_FEED_URL` (optional, default: chapter Apps Script photo feed)
- `PHOTO_STRIP_LIMIT` (optional, default: `12`)

## Local Dev (Docker)

- Start live Hugo dev server:
  - `docker compose up dev`
- Site URL:
  - http://localhost:1313

This runs:
1. Event fetch/generation
2. Photo feed fetch/generation
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

2. `scripts/fetch-photos.mjs`
   - Calls photo API list endpoint at `PHOTO_FEED_URL?action=list`
   - For each item, fetches `imageApi` JSON payload with base64 image data
   - Writes generated static images to:
     - `site/static/images/photo-feed/`
   - Stores normalized strip metadata in:
     - `site/data/photos.json`
     - `site/data/photos.cache.json` (last successful fetch)

3. (Optional manual) `scripts/extract-brand-colors.mjs`
   - Rebuilds `site/assets/css/brand.css` if you intentionally want to refresh the palette

## Structure

- `site/` Hugo site
- `scripts/` Node build scripts
- `Dockerfile` multi-stage build
- `docker-compose.yml` dev + prod services
