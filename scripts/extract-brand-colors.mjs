import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { Vibrant } from "node-vibrant/node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const BRAND_CSS_PATH = path.join(ROOT, "site", "assets", "css", "brand.css");
const BRAND_SOURCE_URL = process.env.BRAND_SOURCE_URL || "https://www.eaa320.com/";

const fallbackPalette = {
  primary: "#0f3a66",
  accent: "#f4c400",
  bg: "#f4f8fd",
  text: "#152535",
  muted: "#63758a",
  card: "#ffffff",
  border: "#cfdae8",
};

function log(msg) {
  console.log(`[extract-brand-colors] ${msg}`);
}

function cssFromPalette(palette) {
  return `:root {\n  --brand-primary: ${palette.primary};\n  --brand-accent: ${palette.accent};\n  --brand-bg: ${palette.bg};\n  --brand-text: ${palette.text};\n  --brand-muted: ${palette.muted};\n  --brand-card: ${palette.card};\n  --brand-border: ${palette.border};\n}\n`;
}

function withFallback(value, fallback) {
  return value || fallback;
}

async function writePalette(palette) {
  await fs.mkdir(path.dirname(BRAND_CSS_PATH), { recursive: true });
  await fs.writeFile(BRAND_CSS_PATH, cssFromPalette(palette), "utf8");
}

async function extractPalette() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const screenshotPath = path.join(os.tmpdir(), `eaa22-brand-${Date.now()}.png`);

  try {
    await page.goto(BRAND_SOURCE_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const palette = await Vibrant.from(screenshotPath).getPalette();

    const primary = palette.Vibrant?.hex || palette.DarkVibrant?.hex;
    const accent = palette.LightVibrant?.hex || palette.Muted?.hex;
    const bg = palette.LightMuted?.hex;
    const text = palette.DarkMuted?.hex || palette.DarkVibrant?.hex;
    const muted = palette.Muted?.hex;

    return {
      primary: withFallback(primary, fallbackPalette.primary),
      accent: withFallback(accent, fallbackPalette.accent),
      bg: withFallback(bg, fallbackPalette.bg),
      text: withFallback(text, fallbackPalette.text),
      muted: withFallback(muted, fallbackPalette.muted),
      card: fallbackPalette.card,
      border: fallbackPalette.border,
    };
  } finally {
    await browser.close();
    try {
      await fs.unlink(screenshotPath);
    } catch {}
  }
}

async function main() {
  try {
    const palette = await extractPalette();
    await writePalette(palette);
    log(`Brand palette extracted from ${BRAND_SOURCE_URL} and written.`);
  } catch (error) {
    log(`Palette extraction failed. Using fallback colors. (${error.message})`);
    await writePalette(fallbackPalette);
  }
}

main();
