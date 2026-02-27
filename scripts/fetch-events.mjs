import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import IcalExpander from "ical-expander";
import { DateTime } from "luxon";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "c_tvdc23j8raicrfbmq04erhmnoc@group.calendar.google.com";
const TIMEZONE = "America/Chicago";
const DAYS_AHEAD = Number.parseInt(process.env.EVENTS_DAYS_AHEAD || "180", 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const DATA_DIR = path.join(SITE_DIR, "data");
const CONTENT_EVENTS_DIR = path.join(SITE_DIR, "content", "events");
const ICS_DIR = path.join(SITE_DIR, "static", "ics");

const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const CACHE_FILE = path.join(DATA_DIR, "events.cache.json");

function log(message) {
  console.log(`[fetch-events] ${message}`);
}

function escapeICS(text = "") {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeFrontMatterValue(text = "") {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function parseCategory(rawTitle = "") {
  const capPattern = /\bcivil\s+air\s+patrol\b|\bcap\b/i;

  if (/^ye:/i.test(rawTitle)) return { category: "Young Eagles", title: rawTitle.replace(/^ye:\s*/i, "") };
  if (/^cap:/i.test(rawTitle)) return { category: "Civil Air Patrol", title: rawTitle.replace(/^cap:\s*/i, "") };
  if (/^meeting:/i.test(rawTitle)) {
    const title = rawTitle.replace(/^meeting:\s*/i, "");
    if (capPattern.test(title)) return { category: "Civil Air Patrol", title };
    return { category: "Meeting", title };
  }
  if (/^fly-in:/i.test(rawTitle)) return { category: "Fly-In", title: rawTitle.replace(/^fly-in:\s*/i, "") };

  // Keyword fallback so categories still work when upstream titles don't use prefixes.
  const normalized = rawTitle.toLowerCase();
  if (capPattern.test(normalized)) {
    return { category: "Civil Air Patrol", title: rawTitle };
  }
  if (/\byoung\s*eagle(s)?\b|\bye\b/.test(normalized)) {
    return { category: "Young Eagles", title: rawTitle };
  }
  if (/\bfly[\s-]?in\b|\bflyin\b/.test(normalized)) {
    return { category: "Fly-In", title: rawTitle };
  }
  if (/\bmeeting\b|\bboard\b|\bclub\b/.test(normalized)) {
    return { category: "Meeting", title: rawTitle };
  }

  return { category: "General", title: rawTitle };
}

function truncate(input = "", len = 170) {
  const clean = input.replace(/\s+/g, " ").trim();
  if (clean.length <= len) return clean;
  return `${clean.slice(0, len - 1)}…`;
}

function cleanDescription(input = "") {
  return String(input)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toGoogleCalendarRenderLink(evt) {
  const fmt = "yyyyLLdd'T'HHmmss'Z'";
  const startUTC = DateTime.fromISO(evt.start, { zone: TIMEZONE }).toUTC().toFormat(fmt);
  const endUTC = DateTime.fromISO(evt.end, { zone: TIMEZONE }).toUTC().toFormat(fmt);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: evt.title,
    dates: `${startUTC}/${endUTC}`,
    details: evt.description || "",
    location: evt.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toICSDate(dtISO, allDay) {
  const dt = DateTime.fromISO(dtISO, { zone: TIMEZONE });
  if (allDay) return dt.toFormat("yyyyLLdd");
  return dt.toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
}

function buildICS(event) {
  const uid = `${event.slug}@eaa22.org`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EAA Chapter 22//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeICS(uid)}`,
    `DTSTAMP:${DateTime.utc().toFormat("yyyyLLdd'T'HHmmss'Z'")}`,
    event.allDay
      ? `DTSTART;VALUE=DATE:${toICSDate(event.start, true)}`
      : `DTSTART:${toICSDate(event.start, false)}`,
    event.allDay
      ? `DTEND;VALUE=DATE:${toICSDate(event.end, true)}`
      : `DTEND:${toICSDate(event.end, false)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    `DESCRIPTION:${escapeICS(event.description || "")}`,
    `LOCATION:${escapeICS(event.location || "")}`,
    `URL:${escapeICS(event.url || "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];
  return lines.join("\r\n");
}

function friendlyId(base, startISO) {
  return `${base}-${DateTime.fromISO(startISO).toFormat("yyyyLLddHHmm")}`;
}

function normalizeEvent(raw) {
  const start = raw.start;
  const end = raw.end;
  const allDay = Boolean(raw.allDay);

  let startDT = DateTime.fromJSDate(start instanceof Date ? start : new Date(start), { zone: "utc" }).setZone(TIMEZONE);
  let endDT = DateTime.fromJSDate(end instanceof Date ? end : new Date(end), { zone: "utc" }).setZone(TIMEZONE);

  if (!endDT.isValid || endDT <= startDT) {
    endDT = allDay ? startDT.plus({ days: 1 }) : startDT.plus({ hours: 1 });
  }

  const rawTitle = (raw.title || "Untitled Event").trim();
  const { category, title } = parseCategory(rawTitle);
  const stableSlug = slugify(`${title}-${startDT.toFormat("yyyy-LL-dd")}`);

  const description = cleanDescription(raw.description || "");

  const normalized = {
    id: friendlyId(raw.id || stableSlug, startDT.toISO()),
    title,
    start: startDT.toISO(),
    end: endDT.toISO(),
    allDay,
    location: raw.location || "",
    description,
    excerpt: truncate(description),
    category,
    url: raw.url || "",
    slug: stableSlug,
  };

  normalized.icsPath = `/ics/${normalized.slug}.ics`;
  normalized.googleCalendarUrl = toGoogleCalendarRenderLink(normalized);
  return normalized;
}

async function fetchICS() {
  const icsUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
  log(`Trying ICS feed: ${icsUrl}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(icsUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`ICS request failed (${response.status})`);
    }

    const ics = await response.text();
    if (!ics.includes("BEGIN:VCALENDAR")) {
      throw new Error("Invalid ICS payload");
    }

    const now = DateTime.now().setZone(TIMEZONE).startOf("day");
    const until = now.plus({ days: DAYS_AHEAD }).endOf("day");

    const expander = new IcalExpander({
      ics,
      maxIterations: 2000,
      skipInvalidDates: true,
    });

    const expanded = expander.between(now.toJSDate(), until.toJSDate());
    const rows = [];

    for (const event of expanded.events) {
      const status = String(event?.component?.getFirstPropertyValue?.("status") || "").toUpperCase();
      if (status === "CANCELLED") continue;

      rows.push({
        id: event.uid,
        title: event.summary,
        start: event.startDate?.toJSDate?.() || event.startDate,
        end: event.endDate?.toJSDate?.() || event.endDate,
        allDay: Boolean(event.startDate?.isDate),
        location: event.location,
        description: event.description,
        url: event.url,
      });
    }

    for (const occurrence of expanded.occurrences) {
      const parent = occurrence.item;
      const status = String(parent?.component?.getFirstPropertyValue?.("status") || "").toUpperCase();
      if (status === "CANCELLED") continue;

      rows.push({
        id: parent?.uid || parent?.id,
        title: parent?.summary,
        start: occurrence.startDate?.toJSDate?.() || occurrence.startDate,
        end: occurrence.endDate?.toJSDate?.() || occurrence.endDate,
        allDay: Boolean(occurrence.startDate?.isDate),
        location: parent?.location,
        description: parent?.description,
        url: parent?.url,
      });
    }

    log(`ICS parse succeeded with ${rows.length} expanded rows.`);
    return rows;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleApi() {
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_CALENDAR_API_KEY missing for API fallback");
  }

  log("Falling back to Google Calendar API events.list");

  const now = DateTime.now().setZone(TIMEZONE).startOf("day");
  const until = now.plus({ days: DAYS_AHEAD }).endOf("day");

  const rows = [];
  let pageToken = "";

  while (true) {
    const params = new URLSearchParams({
      key: apiKey,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      timeMin: now.toUTC().toISO(),
      timeMax: until.toUTC().toISO(),
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google API events.list failed (${response.status})`);
    }

    const payload = await response.json();
    const items = payload.items || [];

    for (const item of items) {
      if (item.status === "cancelled") continue;

      const allDay = Boolean(item?.start?.date);
      const startRaw = item?.start?.dateTime || item?.start?.date;
      const endRaw = item?.end?.dateTime || item?.end?.date;

      rows.push({
        id: item.id,
        title: item.summary,
        start: allDay
          ? DateTime.fromISO(startRaw, { zone: TIMEZONE }).startOf("day").toJSDate()
          : DateTime.fromISO(startRaw).toJSDate(),
        end: allDay
          ? DateTime.fromISO(endRaw, { zone: TIMEZONE }).startOf("day").toJSDate()
          : DateTime.fromISO(endRaw).toJSDate(),
        allDay,
        location: item.location,
        description: item.description,
        url: item.htmlLink,
      });
    }

    if (!payload.nextPageToken) break;
    pageToken = payload.nextPageToken;
  }

  log(`Google API returned ${rows.length} rows.`);
  return rows;
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CONTENT_EVENTS_DIR, { recursive: true });
  await fs.mkdir(ICS_DIR, { recursive: true });
}

async function clearGeneratedArtifacts() {
  try {
    const eventFiles = await fs.readdir(CONTENT_EVENTS_DIR);
    await Promise.all(
      eventFiles
        .filter((name) => name.endsWith(".md") && name !== "_index.md")
        .map((name) => fs.unlink(path.join(CONTENT_EVENTS_DIR, name)))
    );
  } catch {}

  try {
    const icsFiles = await fs.readdir(ICS_DIR);
    await Promise.all(icsFiles.filter((name) => name.endsWith(".ics")).map((name) => fs.unlink(path.join(ICS_DIR, name))));
  } catch {}
}

async function writeEventArtifacts(events) {
  await clearGeneratedArtifacts();

  for (const event of events) {
    const body = `---\ntitle: "${escapeFrontMatterValue(event.title)}"\nlayout: "single"\ntype: "events"\nslug: "${event.slug}"\nstart: "${event.start}"\nend: "${event.end}"\nallDay: ${event.allDay}\nlocation: "${escapeFrontMatterValue(event.location || "")}"\ncategory: "${escapeFrontMatterValue(event.category)}"\ndescription: "${escapeFrontMatterValue(event.description || "")}"\nexcerpt: "${escapeFrontMatterValue(event.excerpt || "")}"\nurl: "${escapeFrontMatterValue(event.url || "")}"\nicsPath: "${event.icsPath}"\ngoogleCalendarUrl: "${event.googleCalendarUrl}"\n---\n\n${event.description || event.excerpt || "Details coming soon."}\n`;

    await fs.writeFile(path.join(CONTENT_EVENTS_DIR, `${event.slug}.md`), body, "utf8");
    await fs.writeFile(path.join(ICS_DIR, `${event.slug}.ics`), buildICS(event), "utf8");
  }
}

async function saveEvents(events, alsoCache) {
  await fs.writeFile(EVENTS_FILE, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  if (alsoCache) {
    await fs.writeFile(CACHE_FILE, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  }
}

async function loadFallbackEvents() {
  try {
    const cacheRaw = await fs.readFile(CACHE_FILE, "utf8");
    const cached = JSON.parse(cacheRaw);
    if (Array.isArray(cached) && cached.length > 0) {
      log(`Using cache fallback (${cached.length} events).`);
      return cached;
    }
  } catch {}

  try {
    const existingRaw = await fs.readFile(EVENTS_FILE, "utf8");
    const existing = JSON.parse(existingRaw);
    if (Array.isArray(existing)) {
      log(`Using existing events.json fallback (${existing.length} events).`);
      return existing;
    }
  } catch {}

  log("No cache available. Using empty events list.");
  return [];
}

function uniqueSort(events) {
  const seen = new Map();
  for (const evt of events) {
    const key = `${evt.slug}-${evt.start}`;
    if (!seen.has(key)) {
      seen.set(key, evt);
    }
  }

  return [...seen.values()].sort((a, b) => DateTime.fromISO(a.start).toMillis() - DateTime.fromISO(b.start).toMillis());
}

async function main() {
  await ensureDirs();

  let normalized = [];
  let success = false;

  try {
    const raw = await fetchICS();
    normalized = uniqueSort(raw.map(normalizeEvent));
    success = true;
  } catch (icsError) {
    log(`ICS fetch failed: ${icsError.message}`);
    try {
      const raw = await fetchGoogleApi();
      normalized = uniqueSort(raw.map(normalizeEvent));
      success = true;
    } catch (apiError) {
      log(`Google API fallback failed: ${apiError.message}`);
      normalized = await loadFallbackEvents();
    }
  }

  await saveEvents(normalized, success);
  await writeEventArtifacts(normalized);
  log(`Wrote ${normalized.length} events to data + generated detail and ICS files.`);
}

main().catch(async (error) => {
  log(`Fatal error: ${error.stack || error.message}`);
  const fallback = await loadFallbackEvents();
  await saveEvents(fallback, false);
  await writeEventArtifacts(fallback);
  process.exitCode = 0;
});
