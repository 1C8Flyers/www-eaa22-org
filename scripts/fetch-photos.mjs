import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PHOTO_FEED_URL =
  process.env.PHOTO_FEED_URL ||
  "https://script.google.com/macros/s/AKfycbzEHSF9l1Bv2-oWE_axQP2EZxHz8hXS8sHFcA7f4iSFpBgknkNh9e8BzevqEA9QU8u3/exec";
const PHOTO_STRIP_LIMIT = Number.parseInt(process.env.PHOTO_STRIP_LIMIT || "12", 10);
const PHOTO_FETCH_TIMEOUT_MS = Number.parseInt(process.env.PHOTO_FETCH_TIMEOUT_MS || "60000", 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const DATA_DIR = path.join(SITE_DIR, "data");
const STATIC_IMAGES_DIR = path.join(SITE_DIR, "static", "images", "photo-feed");

const PHOTOS_FILE = path.join(DATA_DIR, "photos.json");
const PHOTOS_CACHE_FILE = path.join(DATA_DIR, "photos.cache.json");
const DISPLAY_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const CONVERTIBLE_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const SUPPORTED_MIME_TYPES = new Set([...DISPLAY_MIME_TYPES, ...CONVERTIBLE_MIME_TYPES]);

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

function extensionFromMime(mimeType = "") {
  const mime = String(mimeType).toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "";
}

function isConvertibleHeic(mimeType = "", name = "") {
  const mime = String(mimeType || "").toLowerCase();
  const filename = String(name || "").toLowerCase();
  return CONVERTIBLE_MIME_TYPES.has(mime) || /\.(heic|heif)$/i.test(filename);
}

async function normalizeImageData(data, mimeType, name) {
  if (!isConvertibleHeic(mimeType, name)) {
    return {
      data,
      mimeType,
      ext: extensionFromMime(mimeType),
    };
  }

  return {
    data: await sharp(data).rotate().jpeg({ quality: 88 }).toBuffer(),
    mimeType: "image/jpeg",
    ext: "jpg",
  };
}

function sanitizeBaseName(name = "") {
  return String(name)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

function shuffleInPlace(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

async function removeDirectorySafe(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {}
}

async function moveFileSafe(fromPath, toPath) {
  try {
    await fs.rename(fromPath, toPath);
  } catch {
    await fs.copyFile(fromPath, toPath);
    await fs.unlink(fromPath);
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sourceToStaticPath(src = "") {
  const value = String(src || "");
  if (!value.startsWith("/images/photo-feed/")) return null;
  const relative = value.replace(/^\//, "");
  return path.join(SITE_DIR, "static", relative);
}

async function keepExistingPhotoFiles(photos) {
  const kept = [];

  for (const photo of photos) {
    const localPath = sourceToStaticPath(photo?.src);
    if (!localPath || (await fileExists(localPath))) {
      kept.push(photo);
    }
  }

  return kept;
}

function normalizeCachedPhoto(photo, index) {
  if (!photo?.src) return null;
  const mimeType = String(photo.mimeType || "").toLowerCase();
  if (mimeType && !DISPLAY_MIME_TYPES.has(mimeType)) return null;

  const src = String(photo.src || "").toLowerCase();
  if (!src.match(/\.(jpg|jpeg|png|webp|gif)$/)) return null;

  return {
    id: photo.id || `photo-${index + 1}`,
    name: photo.name || `Photo ${index + 1}`,
    src: photo.src,
    full: photo.full || photo.src,
    alt: photo.alt || toAlt(photo.name),
    mimeType,
  };
}

function normalizeCachePayload(payload) {
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];
  return photos.map(normalizeCachedPhoto).filter(Boolean).slice(0, Math.max(1, PHOTO_STRIP_LIMIT));
}

async function clearGeneratedPhotos() {
  try {
    const files = await fs.readdir(STATIC_IMAGES_DIR);
    await Promise.all(
      files
        .filter((name) => /\.(jpg|jpeg|png|webp|gif)$/i.test(name))
        .map((name) => fs.unlink(path.join(STATIC_IMAGES_DIR, name)))
    );
  } catch {}
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

async function fetchJson(url, timeoutMs = PHOTO_FETCH_TIMEOUT_MS, retries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error(`Request failed for ${url}`);
}

async function fetchPhotosFromApi() {
  log(`Fetching photo list: ${PHOTO_FEED_URL}?action=list`);

  const listPayload = await fetchJson(`${PHOTO_FEED_URL}?action=list`);
  if (!listPayload || listPayload.ok !== true || !Array.isArray(listPayload.photos)) {
    throw new Error("List response missing photos array");
  }

  const photos = shuffleInPlace([...listPayload.photos]).slice(0, Math.max(1, PHOTO_STRIP_LIMIT));
  await fs.mkdir(STATIC_IMAGES_DIR, { recursive: true });

  const stageDir = path.join(
    STATIC_IMAGES_DIR,
    `.staging-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  await fs.mkdir(stageDir, { recursive: true });

  const normalized = [];

  try {
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      if (!photo?.imageApi) continue;

      try {
        const imagePayload = await fetchJson(photo.imageApi);
        if (!imagePayload?.ok || !imagePayload?.dataBase64) continue;

        const originalMimeType = String(imagePayload.mimeType || photo.mimeType || "").toLowerCase();
        const originalName = imagePayload.name || photo.name || photo.id || `photo-${index + 1}`;
        if (!SUPPORTED_MIME_TYPES.has(originalMimeType) && !isConvertibleHeic(originalMimeType, originalName)) continue;

        const data = Buffer.from(imagePayload.dataBase64, "base64");
        const normalizedImage = await normalizeImageData(data, originalMimeType, originalName);
        const { mimeType, ext } = normalizedImage;
        if (!ext) continue;
        const base = sanitizeBaseName(originalName);
        const filename = `${String(index + 1).padStart(2, "0")}-${base || `photo-${index + 1}`}.${ext}`;

        const filePath = path.join(stageDir, filename);
        await fs.writeFile(filePath, normalizedImage.data);

        normalized.push({
          id: photo.id || `photo-${index + 1}`,
          name: imagePayload.name || photo.name || `Photo ${index + 1}`,
          src: `/images/photo-feed/${filename}`,
          full: `/images/photo-feed/${filename}`,
          alt: toAlt(imagePayload.name || photo.name || `Photo ${index + 1}`),
          mimeType,
        });
      } catch (error) {
        log(`Skipping photo ${photo.id || index + 1}: ${error.message}`);
      }
    }

    if (normalized.length === 0) {
      throw new Error("No photos were downloaded from feed");
    }

    await clearGeneratedPhotos();
    const stagedFiles = await fs.readdir(stageDir);
    await Promise.all(
      stagedFiles.map((name) =>
        moveFileSafe(path.join(stageDir, name), path.join(STATIC_IMAGES_DIR, name))
      )
    );
  } finally {
    await removeDirectorySafe(stageDir);
  }

  log(`Fetched and wrote ${normalized.length} photos.`);
  return normalized;
}

async function loadFallback() {
  for (const filePath of [PHOTOS_CACHE_FILE, PHOTOS_FILE]) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const payload = JSON.parse(raw);
      const cached = normalizeCachePayload(payload);
      const photos = await keepExistingPhotoFiles(cached);
      if (photos.length > 0) {
        log(`Using fallback from ${path.basename(filePath)} (${photos.length} photos).`);
        return photos;
      }
    } catch {}
  }

  log("No fallback photos available. Writing empty photo feed.");
  return [];
}

async function main() {
  let photos = [];
  let success = false;

  try {
    photos = await fetchPhotosFromApi();
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
