const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { GOOGLE_PHOTOS_ALBUMS_URL, isGooglePhotosNavigation } = require("../main.js");

test("the Asset Vault offers the Google Photos albums launcher", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "renderer.js"), "utf8");
  assert.match(html, /id="open-google-photos"/);
  assert.match(preload, /openGooglePhotos.*magicus:google-photos-open/);
  assert.match(renderer, /window\.magicus\.openGooglePhotos\(\)/);
});

test("Google Photos kiosk navigation stays on secure Google pages", () => {
  assert.equal(GOOGLE_PHOTOS_ALBUMS_URL, "https://photos.google.com/albums");
  assert.equal(isGooglePhotosNavigation(GOOGLE_PHOTOS_ALBUMS_URL), true);
  assert.equal(isGooglePhotosNavigation("https://accounts.google.com/signin"), true);
  assert.equal(isGooglePhotosNavigation("http://photos.google.com/albums"), false);
  assert.equal(isGooglePhotosNavigation("https://google.com.evil.example/albums"), false);
  assert.equal(isGooglePhotosNavigation("https://example.com"), false);
});
