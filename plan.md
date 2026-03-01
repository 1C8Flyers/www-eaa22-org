You are building a modern, fun, aviation-themed website for EAA Chapter 22 (www.eaa22.org) using Hugo. No CMS. It must deploy via Docker and automatically pull upcoming events from Google Calendar and render them on the homepage and /events.

CALENDAR
- Google Calendar ID: c_tvdc23j8raicrfbmq04erhmnoc@group.calendar.google.com
- Prefer a “public feed” approach first:
  1) Try downloading ICS from:
     https://calendar.google.com/calendar/ical/<urlencoded calendarId>/public/basic.ics
  2) If that fails, fall back to Google Calendar API events.list using an API key (env var GOOGLE_CALENDAR_API_KEY) and the calendarId above.
- Expand recurring events and list a rolling window (default next 180 days).
- Ignore cancelled events.
- Normalize to America/Chicago timezone for display.

DESIGN / BRANDING
- The new Hugo theme must look modern and fun but still professional and aviation-forward (hangar + community vibe).
- Must “match our branding” by automatically extracting a color palette from the existing homepage https://www.eaa22.org/ at build time:
  - Use a small Node script with Playwright to take a screenshot of the homepage (desktop viewport).
  - Use a palette extractor (e.g., node-vibrant) to derive 6–8 brand colors.
  - Generate a CSS file in the Hugo assets (e.g., assets/css/brand.css) defining CSS variables:
    --brand-primary, --brand-accent, --brand-bg, --brand-text, --brand-muted, --brand-card, --brand-border
  - If extraction fails (network/offline), fall back to a sane default aviation palette (navy/sky/white + warm accent).
- Typography: modern sans for body; slightly bolder display for headings. Keep it readable, airy, and card-based.
- Subtle animations only (hover lift, fade-in). Avoid heavy JS frameworks.

SITE IA / PAGES
- Home:
  - Hero section with large headline “EAA Chapter 22 — Cottonwood Airport” and subtext about events, Young Eagles, education.
  - Prominent CTAs: “Upcoming Events”, “Join / Get Involved”, “Donate”.
  - “Next Up” event card (from calendar feed) with date/time/location + buttons:
    - Details
    - Add to Calendar (ICS link or Google calendar link)
  - Grid of 3–4 “What we do” program cards (Young Eagles, Ground School, Fly-ins/Events, Community).
  - Photo strip placeholder section (no CMS; just pull from static images folder for now).
- /events:
  - Upcoming list (cards), grouped by month.
  - Optional filters by category if present in event title prefix (e.g., “YE:”, “Meeting:”, “Fly-In:”); implement simple parsing:
    - If title starts with “YE:” => category Young Eagles
    - “Meeting:” => Meeting
    - “Fly-In:” => Fly-In
    - else => General
  - Event detail pages: generate pages at build time from the events data (use Hugo data-driven content generation or render dynamic detail routes using a slug lookup page).
  - Each event card shows title, date/time, location, short excerpt, and “Add to Calendar”.
- Keep existing important pages as placeholders with simple content and nav:
  - /programs (index) + /programs/young-eagles, /programs/pilot-ground-school
  - /about, /contact, /donate
  - They can be basic now but must share the same header/footer and styling.

HUGO IMPLEMENTATION REQUIREMENTS
- Use Hugo extended.
- Use Hugo pipes for CSS processing (PostCSS optional; keep it simple if possible).
- Store fetched events at build time in: data/events.json
- Create a small events pipeline:
  - scripts/fetch-events.mjs:
    - downloads ICS OR calls API
    - converts to normalized JSON: [{ id, title, start, end, allDay, location, description, category, url, slug }]
    - writes site/data/events.json
  - Provide robust error handling and logging.
  - Ensure stable slug generation: slugify(title + startDate).
- Templates:
  - layouts/_default/baseof.html
  - layouts/partials/header.html, footer.html
  - layouts/index.html (home)
  - layouts/events/list.html (events list)
  - layouts/events/single.html OR a data-driven detail page approach
- Date formatting: friendly (e.g., “Sat, Feb 14 • 10:00 AM”).
- Add-to-calendar:
  - Provide a Google Calendar “render” link if possible (or generate a simple ICS download endpoint via static file generation per event).
  - At minimum: create a “download .ics” link that is generated per event at build time in public/ics/<slug>.ics

DOCKER
- Provide Dockerfile (multi-stage):
  - Stage 1: node (runs scripts/fetch-events.mjs and palette extraction scripts)
  - Stage 2: hugo build
  - Stage 3: nginx or caddy to serve /public
- Provide docker-compose.yml:
  - environment variables:
    - GOOGLE_CALENDAR_API_KEY (optional)
    - EVENTS_DAYS_AHEAD=180
  - volumes optional for local dev
- Provide Makefile or simple commands in README.

DEV EXPERIENCE
- Provide a “dev” mode:
  - docker compose up dev
  - runs: fetch events + extract colors + hugo server with live reload
- Provide a “prod” mode:
  - docker compose up -d
  - serves built static content

DELIVERABLES
Create/modify files in a new repo structure:
- site/
  - hugo.toml
  - content/ (basic pages)
  - layouts/ (templates)
  - assets/css/main.css + generated brand.css
  - static/ (images, generated ics files)
  - data/events.json (generated)
- scripts/
  - fetch-events.mjs
  - extract-brand-colors.mjs
  - ics-to-json helpers (if needed)
- Dockerfile, docker-compose.yml, README.md

IMPORTANT
- Do not leave stubs: implement the actual scripts and wiring so running docker build produces a site with real events from the calendar.
- Keep dependencies minimal but functional.
- Ensure the site still builds if Google fetch fails by using cached events.json (store last success at data/events.cache.json) and falling back gracefully.

Now implement everything.