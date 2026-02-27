import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PHOTO_FEED_URL =
  process.env.PHOTO_FEED_URL ||
  "https://script.google.com/macros/s/AKfycbzEHSF9l1Bv2-oWE_axQP2EZxHz8hXS8sHFcA7f4iSFpBgknkNh9e8BzevqEA9QU8u3/exec";
const PHOTO_STRIP_LIMIT = Number.parseInt(process.env.PHOTO_STRIP_LIMIT || "12", 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const DATA_DIR = path.join(SITE_DIR, "data");

const PHOTOS_FILE = path.join(DATA_DIR, "photos.json");
const PHOTOS_CACHE_FILE = path.join(DATA_DIR, "photos.cache.json");

function log(message) {
  console.log(`[fetch-photos] ${message}`);
}

function toAlt(name = "") {
  const clean = String(name)
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "Chapter photo";
}

function normalizePhoto(photo, index) {
  const src = photo.thumb || photo.url;
  if (!src) return null;

  return {
    id: photo.id || `photo-${index + 1}`,
    name: photo.name || `Photo ${index + 1}`,
    src,
    full: photo.url || src,
    alt: toAlt(photo.name),
    mimeType: photo.mimeType || "",
  };
}

function normalizePayload(payload) {
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];
  return photos
    .filter((photo) => String(photo?.mimeType || "").toLowerCase().startsWith("image/"))
    .map(normalizePhoto)
    .filter(Boolean)
    .slice(0, Math.max(1, PHOTO_STRIP_LIMIT));
}

async function writePhotos(photos, alsoCache) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const body = {
    updatedAt: new Date().toISOString(),
    count: photos.length,
    photos,
  };

  await fs.writeFile(PHOTOS_FILE, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  if (alsoCache) {
    await fs.writeFile(PHOTOS_CACHE_FILE, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  }
}

async function loadFallback() {
  for (const filePath of [PHOTOS_CACHE_FILE, PHOTOS_FILE]) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const payload = JSON.parse(raw);
      const photos = normalizePayload(payload);
      if (photos.length > 0) {
        log(`Using fallback from ${path.basename(filePath)} (${photos.length} photos).`);
        return photos;
      }
    } catch {}
  }

  log("No fallback photos available. Writing empty photo feed.");
  return [];
}

async function fetchPhotos() {
  log(`Fetching photo feed: ${PHOTO_FEED_URL}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(PHOTO_FEED_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Feed request failed (${response.status})`);
    }

    const payload = await response.json();
    if (!payload || payload.ok !== true) {
      throw new Error("Feed returned non-ok payload");
    }

    const photos = normalizePayload(payload);
    log(`Fetched ${photos.length} photos.`);
    return photos;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  let photos = [];
  let success = false;

  try {
    photos = await fetchPhotos();
    success = true;
  } catch (error) {
    log(`Feed fetch failed: ${error.message}`);
    photos = await loadFallback();
  }

  await writePhotos(photos, success);
  log(`Wrote ${photos.length} photos to site/data/photos.json${success ? " and cache" : ""}.`);
}

main().catch(async (error) => {
  log(`Fatal error: ${error.stack || error.message}`);
  const fallback = await loadFallback();
  await writePhotos(fallback, false);
  process.exitCode = 0;
});
