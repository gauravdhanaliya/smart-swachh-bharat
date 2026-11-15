#!/usr/bin/env node
// Real-browser layout check (jsdom has no layout engine) for the start screen
// and the citizen Home, plus the screenshots for review.
//
//   npm run test:layout                 # checks, screenshots to a temp folder
//   npm run test:layout -- --out shots  # screenshots to ./shots
//
// Starts Vite in browser-only mode with Firebase replaced by a fake (so a
// refused log-in can be shown, and accounts created), drives headless Chrome
// or Edge over the DevTools protocol, and at several phone sizes (360x740 and
// up) checks the start screen in each state (log in, an error under each
// field, a refused log-in, create account, forgot password) and the
// "Try the demo" sheet:
//   - nothing scrolls: not the page, not any scroll container, either axis
//   - header + card are centred in the space above the one-line footer
//   - the header is at the same position in every state (the block reserves
//     the height of its tallest state, and that reserve is checked too)
//   - every visible control is at least 44px tall
//   - disabled controls meet WCAG AA contrast, at full opacity
//   - nothing moves while idle (no decoration: the "clean white" style)
// The consent step (a first visit) must not scroll sideways, and sends no auth
// or API request. Then, at 360x740: create an account (the verify banner),
// the citizen Home for a new account and for one with reports (one screen,
// no gap, the tab bar's labels on one line, sorted by distance after "Use my
// location"), the tab bar on a long page (nothing under it), the profile,
// Delete my data, and an official's "Add worker" dialog.
// Exits 1 with a list of problems if any check fails. Needs Chrome or Edge;
// set CHROME_PATH to use another Chromium.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createServer } from "vite";
import { CONSENT_ITEMS, DEFAULT_CONSENT_VERSION } from "../server/src/constants.js";

// What the consent step stores on the device once the user agrees (consentService.js).
const DEVICE_CONSENT = JSON.stringify({ version: DEFAULT_CONSENT_VERSION, items: Object.fromEntries(CONSENT_ITEMS.map((k) => [k, true])), acceptedAt: "2026-11-01T00:00:00.000Z" });

const ROOT = resolve(import.meta.dirname, "..");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(tmpdir(), "ssb-login-layout");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "360x740", width: 360, height: 740, mobile: true, shots: true },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "412x915", width: 412, height: 915, mobile: true },
  { name: "desktop-1280x800", width: 1280, height: 800, mobile: false },
];

// Firebase stand-in. "Log in" fails while the page's localStorage has
// "fake-auth-fail" (to show the refused log-in under the button).
const FAKE_AUTH = `
const user = (uid, email, emailVerified) => ({ uid, idToken: "fake", email, emailVerified });
export async function firebaseAvailable() { return true; }
export async function logIn({ email }) {
  if (localStorage.getItem("fake-auth-fail")) throw { code: "auth/invalid-credential" };
  return user("layout-saved", email, true);
}
export async function createAccount({ email }) { return { ...user("layout-new", email, false), verificationSent: true }; }
export async function sendPasswordReset() {}
export async function refreshAccount() { return user("layout-new", "asha@example.com", true); }
export async function resendVerification() {}
export async function changePassword() {}
export async function verifyPassword() {}
export async function deleteFirebaseAccount() { return { deleted: true }; }
export async function signOutUser() {}
`;

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
  return found;
}

async function startVite() {
  const envDir = mkdtempSync(join(tmpdir(), "ssb-env-")); // no .env files: browser-only mode
  const server = await createServer({
    root: ROOT,
    configFile: join(ROOT, "vite.config.js"),
    envDir,
    logLevel: "error",
    server: { port: 5199, strictPort: false },
    plugins: [
      {
        name: "fake-firebase-auth",
        enforce: "pre",
        load(id) {
          if (id.replaceAll("\\", "/").endsWith("/src/services/authService.js")) return FAKE_AUTH;
          return null;
        },
      },
    ],
  });
  await server.listen();
  return { server, url: server.resolvedUrls.local[0].replace(/\/$/, ""), envDir };
}

async function startBrowser() {
  const profile = mkdtempSync(join(tmpdir(), "ssb-chrome-"));
  const proc = spawn(findBrowser(), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await wait(100);
  const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = fail;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    const p = msg.id && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.fail(new Error(msg.error.message));
    else p.ok(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      seq += 1;
      pending.set(seq, { ok, fail });
      ws.send(JSON.stringify({ id: seq, method, params }));
    });
  const close = () => {
    try {
      ws.close();
    } catch {
      // already closed
    }
    proc.kill();
    setTimeout(() => rmSync(profile, { recursive: true, force: true, maxRetries: 5 }), 500).unref();
  };
  return { send, close };
}

async function evaluate(send, expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

// Runs in the page: every way the current screen can fail the layout rules.
const MEASURE = `(() => {
  const problems = [];
  const name = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.getAttribute("aria-label") ? "[" + el.getAttribute("aria-label") + "]" : "") + (el.textContent ? " '" + el.textContent.trim().slice(0, 24) + "'" : "");
  const vw = window.innerWidth, vh = window.innerHeight;
  const doc = document.scrollingElement;
  if (doc.scrollHeight > vh + 1) problems.push("page scrolls vertically: " + doc.scrollHeight + " > " + vh);
  if (doc.scrollWidth > vw + 1) problems.push("page scrolls horizontally: " + doc.scrollWidth + " > " + vw);
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (/auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) problems.push("scrolls vertically: " + name(el) + " " + el.scrollHeight + " > " + el.clientHeight);
    if (/auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) problems.push("scrolls horizontally: " + name(el) + " " + el.scrollWidth + " > " + el.clientWidth);
  }
  for (const el of document.querySelectorAll("[data-one-line]")) {
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    if (el.getBoundingClientRect().height > lineHeight * 1.5) problems.push("wraps onto a second line: " + name(el));
  }
  const dialog = document.querySelector('[role="dialog"]');
  const scope = dialog ?? document;
  for (const el of scope.querySelectorAll("button, a[href], input")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
    if (r.height < 43.5) problems.push("touch target under 44px tall: " + name(el) + " " + r.height.toFixed(1));
    if (r.right > vw + 0.5 || r.left < -0.5) problems.push("control outside the screen: " + name(el));
  }
  if (dialog) {
    const r = dialog.getBoundingClientRect();
    if (r.top < -0.5 || r.bottom > vh + 0.5) problems.push("sheet doesn't fit the screen: " + JSON.stringify(r));
  }

  // Header + card centred in the space above the footer; the footer on the bottom edge.
  const block = document.querySelector("[data-login-block]");
  const footer = document.querySelector("[data-page-footer]");
  if (block && footer) {
    const area = block.parentElement.getBoundingClientRect();
    const b = block.getBoundingClientRect();
    const gapTop = b.top - area.top;
    const gapBottom = area.bottom - b.bottom;
    if (Math.abs(gapTop - gapBottom) > 2) problems.push("login block not centred: " + gapTop.toFixed(1) + "px above, " + gapBottom.toFixed(1) + "px below");
    const f = footer.getBoundingClientRect();
    const frame = footer.closest(".device-frame") ?? document.body;
    const frameBottom = frame.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(frame).borderBottomWidth) || 0); // inside the desktop phone frame's border
    if (Math.abs(f.bottom - frameBottom) > 1 && !document.querySelector('[role="dialog"]')) problems.push("footer not on the bottom edge: " + f.bottom.toFixed(1) + " vs " + frameBottom.toFixed(1));
  }

  // The block's reserved height must match its tallest state (errors under the fields):
  // too small and the header would jump when it appears; much too large and the gap below is wasted.
  const startError = document.querySelector("[data-start-error], [data-field-error]");
  if (block && startError) {
    const natural = block.lastElementChild.getBoundingClientRect().bottom - block.getBoundingClientRect().top;
    const reserved = parseFloat(getComputedStyle(block).minHeight) || 0;
    if (reserved < natural - 0.5) problems.push("login block reserve too small: min-height " + reserved + "px, tallest state needs " + natural.toFixed(1) + "px");
    if (reserved > natural + 32) problems.push("login block reserve too large: min-height " + reserved + "px, tallest state needs only " + natural.toFixed(1) + "px");
  }

  // Disabled controls: their text must meet AA (4.5:1) against what is behind it.
  const rgb = (c) => {
    const m = /^rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)$/.exec(c);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  for (const el of scope.querySelectorAll("button:disabled")) {
    if (!el.getBoundingClientRect().height) continue;
    const fg = rgb(getComputedStyle(el).color);
    let bg = null;
    for (let n = el; n && !bg; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) bg = c;
    }
    if (!fg || !bg) {
      problems.push("can't read the colours of disabled " + name(el));
      continue;
    }
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (hi + 0.05) / (lo + 0.05);
    if (ratio < 4.5 || Number(getComputedStyle(el).opacity) < 1) problems.push("disabled control below AA: " + name(el) + " " + ratio.toFixed(2) + ":1, opacity " + getComputedStyle(el).opacity);
  }
  return problems;
})()`;

// Where the content is right now (to compare over time).
const SNAPSHOT = `(() => ({
  content: JSON.stringify([...document.querySelectorAll("[data-login-block], section, footer, input, button")].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => v.toFixed(1)); })),
}))()`;

const click = (selectorJs) => `(() => { const el = ${selectorJs}; if (!el) throw new Error("not found: ${selectorJs.replaceAll('"', "'")}"); el.click(); return true; })()`;
const byText = (tag, text) => `[...document.querySelectorAll("${tag}")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))`;

async function run() {
  const { server, url, envDir } = await startVite();
  const browser = await startBrowser();
  const { send } = browser;
  const failures = [];
  const shot = async (name) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  };
  const waitFor = async (js, what) => {
    for (let i = 0; i < 100; i += 1) {
      if (await evaluate(send, `Boolean(${js})`)) return;
      await wait(150);
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  // A first visit: the consent step, nothing else.
  const openFirstVisit = async () => {
    // Signed out first, on a page that never redirects.
    await send("Page.navigate", { url: `${url}/privacy` });
    await waitFor(`document.querySelector("h1")`, "the privacy notice");
    await evaluate(send, `(localStorage.clear(), sessionStorage.clear(), true)`);
    await send("Page.navigate", { url: `${url}/login` });
    await waitFor(`${byText("h1", "Before you start")}`, "the consent step");
    await wait(400);
  };
  // The start screen, once this device has agreed.
  const openStartScreen = async () => {
    // Signed out first (a signed-in visitor is sent on to their home), on a page that doesn't redirect.
    await send("Page.navigate", { url: `${url}/privacy` });
    await waitFor(`document.querySelector("h1")`, "the privacy notice");
    await evaluate(send, `(localStorage.clear(), sessionStorage.clear(), localStorage.setItem("ssb_device_consent_v1", ${JSON.stringify(DEVICE_CONSENT)}), true)`);
    await send("Page.navigate", { url: `${url}/login` });
    await waitFor(`document.querySelector('[data-email-view="login"]')`, "the log-in card");
    await waitFor(`${byText("button", "Try the demo")}`, "the demo link");
    await wait(400);
  };
  const closeSheet = async () => {
    await evaluate(send, click(`document.querySelector('[role="dialog"] button[aria-label="Close"]')`));
    await waitFor(`!document.querySelector('[role="dialog"]')`, "the sheet to close");
  };
  const cardButton = (text) => `[...document.querySelectorAll("[data-email-card] button")].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`;
  const typeInto = async (labelText, value, nth = 0) => {
    await evaluate(send, `(() => { const l = [...document.querySelectorAll("label")].filter((x) => x.textContent.trim().startsWith(${JSON.stringify(labelText)}))[${nth}]; const el = document.getElementById(l.htmlFor); el.focus(); el.select?.(); return true; })()`);
    await send("Input.insertText", { text: value });
  };
  const report = (name, problems) => {
    for (const p of problems) failures.push(`${name}: ${p}`);
    console.log(`${problems.length ? "FAIL" : "ok  "} ${name}${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
  };
  // No emoji anywhere on screen (one outline icon set).
  const NO_EMOJI = `(() => { const m = document.body.innerText.match(/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u); return m ? ["emoji on screen: " + m[0]] : []; })()`;
  // Every map tile on screen has loaded (screenshots never show half a map).
  const TILES_LOADED = `(() => { const t = [...document.querySelectorAll("img.leaflet-tile")]; return t.length > 0 && t.every((i) => i.complete && i.naturalWidth > 0); })()`;
  // Only sideways scrolling (for screens that are meant to scroll down).
  const SIDEWAYS = `(() => { const p = []; const vw = innerWidth; if (document.documentElement.scrollWidth > vw + 1) p.push("page scrolls sideways: " + document.documentElement.scrollWidth + " > " + vw); for (const el of document.querySelectorAll("button, a[href], label, input")) { const r = el.getBoundingClientRect(); if (r.width && (r.right > vw + 0.5 || r.left < -0.5)) p.push("outside the screen: " + (el.textContent || el.id).trim().slice(0, 40)); } return p; })()`;
  // No dashed borders anywhere (one solid 1px card style).
  const NO_DASHED = `(() => { const p = []; for (const el of document.querySelectorAll("body *")) { const cs = getComputedStyle(el); if ([cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle].includes("dashed") && el.getBoundingClientRect().width) p.push("dashed border: <" + el.tagName.toLowerCase() + "> " + (el.textContent || "").trim().slice(0, 40)); } return p.slice(0, 5); })()`;
  // No card has a visible box shadow (dialogs, sheets and the map may).
  const NO_CARD_SHADOW = `(() => { const p = []; for (const el of document.querySelectorAll("body *")) { if (el.closest('[role="dialog"], .leaflet-container, [data-bottom-nav]')) continue; const cs = getComputedStyle(el); if (!cs.boxShadow || cs.boxShadow === "none" || parseFloat(cs.borderRadius) < 12) continue; const visible = cs.boxShadow.split(/,(?![^(]*\\))/).some((one) => !/rgba\\([^)]*,\\s*0\\)/.test(one) && /\\d+px/.test(one) && !/^\\s*\\S*\\s*0px 0px 0px 0px/.test(one.replace(/rgba?\\([^)]*\\)/, "c"))); const r = el.getBoundingClientRect(); if (visible && r.width > 120 && r.height > 40) p.push("card shadow: " + (el.textContent || "").trim().slice(0, 40)); } return [...new Set(p)].slice(0, 5); })()`;
  // Every pin of a map sits fully inside the map (with a margin) and none is under the legend.
  const PINS_INSIDE = (sel, margin = 2) => `(() => {
    const p = []; const wrap = document.querySelector(${JSON.stringify(sel)});
    if (!wrap) return ["no map: ${sel}"];
    const map = wrap.querySelector(".leaflet-container"); if (!map) return ["no leaflet map in ${sel}"];
    const m = map.getBoundingClientRect();
    const legend = document.querySelector("[data-map-legend]")?.getBoundingClientRect();
    const pins = [...map.querySelectorAll(".leaflet-marker-icon")];
    if (!pins.length) p.push("no pins on the map");
    for (const pin of pins) {
      const r = pin.getBoundingClientRect();
      if (r.left < m.left + ${margin} || r.top < m.top + ${margin} || r.right > m.right - ${margin} || r.bottom > m.bottom - ${margin}) p.push("pin clipped at the edge (l/t/r/b): " + [r.left - m.left, r.top - m.top, m.right - r.right, m.bottom - r.bottom].map(Math.round).join("/"));
      if (legend && r.right > legend.left && r.left < legend.right && r.bottom > legend.top && r.top < legend.bottom) p.push("pin under the legend");
    }
    if (legend && legend.top < m.bottom - 0.5) p.push("the legend overlaps the map");
    return p;
  })()`;
  // A notification badge never covers the bell icon.
  const BELL_CLEAR = `(() => { const b = document.querySelector("[data-unread-badge]"); if (!b) return []; const icon = b.parentElement.querySelector("svg").getBoundingClientRect(); const r = b.getBoundingClientRect(); return r.right > icon.left && r.left < icon.right && r.bottom > icon.top && r.top < icon.bottom ? ["the badge covers the bell icon"] : []; })()`;
  // A full-page screenshot of a screen whose content area scrolls on its own.
  const fullShot = async (name, width = 360, height = 740) => {
    const extra = await evaluate(send, `Math.max(document.documentElement.scrollHeight - innerHeight, ...[...document.querySelectorAll("*")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY)).map((e) => e.scrollHeight - e.clientHeight))`);
    await send("Emulation.setDeviceMetricsOverride", { width, height: height + Math.ceil(extra), deviceScaleFactor: 2, mobile: true });
    await wait(800);
    await waitFor(TILES_LOADED, "the map tiles").catch(() => {});
    await shot(name);
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
    await wait(300);
  };
  // The citizen Home: one screen, the map filling what's left, no gap above the
  // tab bar, no city-wide tiles, tab labels on one line inside their tab.
  // allowScroll: with the verify banner, the content area may scroll (never the page).
  const HOME = (allowScroll = false) => `(() => {
    const p = [];
    if (document.documentElement.scrollHeight > innerHeight + 1) p.push("page scrolls: " + document.documentElement.scrollHeight + " > " + innerHeight);
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const ok = ${allowScroll} && el.matches("[data-shell-content]");
      if (/auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && !el.closest(".leaflet-container") && !ok) p.push("scrolls: " + (el.className || el.tagName).toString().slice(0, 60));
    }
    // Nothing overlaps: each block starts below the one before it.
    const blocks = [...document.querySelectorAll("[data-verify-banner], main h1, [data-my-reports], [aria-labelledby='home-map-title'], [aria-labelledby='home-toilets-title']")];
    const sections = [document.querySelector("[aria-labelledby='home-map-title']"), document.querySelector("[aria-labelledby='home-toilets-title']")];
    if (sections[0] && sections[1] && sections[0].getBoundingClientRect().bottom > sections[1].getBoundingClientRect().top + 0.5) p.push("the map runs into the toilet list");
    const map = document.querySelector('button[aria-label^="Open the full map"]');
    if (map && sections[1] && map.getBoundingClientRect().bottom > sections[1].getBoundingClientRect().top + 0.5) p.push("the map preview covers the toilet list");
    void blocks;
    for (const label of ["Bins Need Collection", "Overflowing Bins", "Complaints Resolved", "Total Complaints", "Open Map", "Good Night", "(DEMO)"]) if (document.body.textContent.includes(label)) p.push("shows " + label);
    const nav = document.querySelector("[data-bottom-nav]");
    const toilets = document.querySelector('[aria-labelledby="home-toilets-title"]');
    if (nav && toilets && !${allowScroll}) { const gap = nav.getBoundingClientRect().top - toilets.getBoundingClientRect().bottom; if (gap > 16) p.push("empty gap above the tab bar: " + gap.toFixed(1) + "px"); if (gap < -0.5) p.push("the tab bar covers the toilets by " + (-gap).toFixed(1) + "px"); }
    if (!map) {
      p.push("no map preview");
    } else {
      // No grey area: every corner of the preview has a loaded tile under it.
      const r = map.getBoundingClientRect();
      for (const [x, y] of [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]]) {
        // (geometry, not elementsFromPoint: the preview map ignores pointer events)
        const tile = [...map.querySelectorAll("img.leaflet-tile")].find((t) => {
          const b = t.getBoundingClientRect();
          return t.complete && t.naturalWidth > 0 && getComputedStyle(t).opacity !== "0" && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
        });
        if (!tile) p.push("no map tile at " + Math.round(x - r.left) + "," + Math.round(y - r.top) + " in the preview (grey area)");
      }
      if (r.height < 95.5) p.push("map preview squeezed to " + r.height.toFixed(1) + "px");
    }
    for (const label of document.querySelectorAll("[data-bottom-nav] [data-one-line]")) {
      const tab = label.closest("button").getBoundingClientRect();
      const r = label.getBoundingClientRect();
      if (r.left < tab.left - 0.5 || r.right > tab.right + 0.5) p.push("tab label doesn't fit its tab: " + label.textContent);
    }
    for (const el of document.querySelectorAll("main button, [data-shell-content] button, [data-bottom-nav] button, [data-verify-banner] button")) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height < 43.5) p.push("touch target under 44px: " + (el.getAttribute("aria-label") || el.textContent).trim().slice(0, 30) + " " + r.height.toFixed(1));
    }
    return p;
  })()`;
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    for (const vp of VIEWPORTS) {
      await send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.shots ? 2 : 1, mobile: vp.mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile });
      // A first visit: the consent step (long, so it may scroll down, never sideways).
      await openFirstVisit();
      {
        const problems = await evaluate(send, SIDEWAYS);
        const requests = await evaluate(send, `performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\\/api\\/|identitytoolkit|securetoken|firebase/.test(n))`);
        if (requests.length) problems.push("auth or API requests before consent: " + requests.join(", "));
        report(`${vp.name.padEnd(17)} consent-screen (no sideways scroll, no requests)`, problems);
        if (vp.shots) {
          await shot("consent-screen");
          await evaluate(send, `(document.querySelector("[data-consent-step]").scrollTop = 1e6, true)`);
          await wait(300);
          await shot("consent-screen-2");
          await evaluate(send, `(document.querySelector("[data-consent-step]").scrollTop = 0, true)`);
        }
      }

      await openStartScreen();

      const headerTops = {};
      const check = async (state) => {
        await wait(700); // let enter animations finish
        const problems = await evaluate(send, MEASURE);
        headerTops[state] = await evaluate(send, "document.querySelector('header').getBoundingClientRect().top");
        report(`${vp.name.padEnd(17)} ${state}`, problems);
        if (vp.shots) await shot(state);
      };

      await check("start-screen");

      // Nothing moves while idle.
      {
        const a = await evaluate(send, SNAPSHOT);
        await wait(1500);
        const b = await evaluate(send, SNAPSHOT);
        report(`${vp.name.padEnd(17)} nothing moves while idle`, a.content !== b.content ? ["content moved while idle"] : []);
      }

      // Log in pressed with nothing filled in: an error under each field.
      await evaluate(send, click(cardButton("Log in")));
      await waitFor(`document.querySelectorAll("[data-field-error]").length === 2`, "the field errors");
      await check("start-field-errors");
      // A refused log-in: the error under the fields, above the button.
      await typeInto("Email", "asha@example.com");
      await evaluate(send, `(document.querySelector('[data-email-card] input[type="password"]').focus(), true)`);
      await send("Input.insertText", { text: "wrong-password" });
      await evaluate(send, `(localStorage.setItem("fake-auth-fail", "1"), true)`);
      await evaluate(send, click(cardButton("Log in")));
      await waitFor(`document.querySelector("[data-start-error]")`, "the refused log-in");
      await check("start-error");
      await evaluate(send, `(localStorage.removeItem("fake-auth-fail"), true)`);
      // Create account, and Forgot password?, in the same card.
      await evaluate(send, click(cardButton("Create account")));
      await waitFor(`document.querySelector('[data-email-view="create"]')`, "the create-account view");
      await check("create-account");
      await evaluate(send, click(cardButton("Log in")));
      await waitFor(`document.querySelector('[data-email-view="login"]')`, "back to log in");
      await evaluate(send, click(cardButton("Forgot password?")));
      await waitFor(`document.querySelector('[data-email-view="forgot"]')`, "the forgot-password view");
      await check("forgot-password");
      {
        const tops = Object.entries(headerTops);
        const distinct = new Set(tops.map(([, t]) => t.toFixed(1)));
        report(`${vp.name.padEnd(17)} header stays at ${tops[0][1].toFixed(1)}px in every state`, distinct.size === 1 ? [] : ["header moves: " + tops.map(([st, t]) => `${st}=${t.toFixed(1)}`).join(", ")]);
      }

      await evaluate(send, click(cardButton("Back to log in")));
      await waitFor(`document.querySelector('[data-email-view="login"]')`, "back to log in");
      await evaluate(send, click(byText("button", "Try the demo")));
      await waitFor(`document.querySelector('[role="dialog"] li button')`, "the demo sheet");
      await check("demo-sheet");
      const rows = await evaluate(send, `[...document.querySelectorAll('[role="dialog"] li button')].map((b) => b.querySelector("span span").textContent.trim())`);
      if (JSON.stringify(rows) !== JSON.stringify(["Citizen", "Sanitation Worker", "Government Official"])) failures.push(`${vp.name} demo-sheet: expected Citizen, Sanitation Worker, Government Official, got ${JSON.stringify(rows)}`);
      await closeSheet();
    }

    // prefers-reduced-motion: the Home's content is fully there at once (no entrance animation).
    await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await openStartScreen();
    await evaluate(send, click(byText("button", "Try the demo")));
    await waitFor(`document.querySelector('[role="dialog"] li button')`, "the demo sheet");
    await evaluate(send, click(`[...document.querySelectorAll('[role="dialog"] li button')][0]`));
    await waitFor(`location.pathname === "/citizen" && document.querySelector("[data-home-content]")`, "the citizen Home");
    {
      const opacity = await evaluate(send, `getComputedStyle(document.querySelector("[data-home-content]")).opacity`);
      report(`${"360x740".padEnd(17)} reduced motion: Home cards shown at once`, Number(opacity) === 1 ? [] : [`cards start at opacity ${opacity}`]);
    }
    await send("Emulation.setEmulatedMedia", { features: [] });

    // From a first visit to the Home (screenshots): consent, Create account, the verify banner.
    await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
    await openFirstVisit();
    await evaluate(send, `([...document.querySelectorAll('input[type="checkbox"]')].forEach((c) => c.checked || c.click()), true)`);
    await evaluate(send, click(byText("button", "Agree and continue")));
    await waitFor(`document.querySelector('[data-email-view="login"]')`, "the start screen after consent");
    await wait(400);
    await evaluate(send, click(cardButton("Create account")));
    await waitFor(`document.querySelector('[data-email-view="create"]')`, "the create-account view");
    await typeInto("Email", "asha@example.com");
    await typeInto("Choose a password", "a-long-password");
    await wait(300);
    await shot("create-account-filled");
    await evaluate(send, click(cardButton("Create account")));
    await waitFor(`location.pathname === "/citizen" && document.querySelector("[data-verify-banner]")`, "the citizen Home with the verify banner");
    await waitFor(TILES_LOADED, "the map tiles");
    report(`${"360x740".padEnd(17)} citizen-home, new account, verify banner (nothing overlaps; scrolls in its area)`, await evaluate(send, HOME(true)));
    await shot("verify-banner");
    await evaluate(send, click(`document.querySelector('[data-verify-banner] button[aria-label="Dismiss"]')`));
    await waitFor(`!document.querySelector("[data-verify-banner]")`, "the banner to close");
    await waitFor(TILES_LOADED, "the map tiles");
    await wait(400);
    report(`${"360x740".padEnd(17)} citizen-home, new account (one screen, no gap, no badge)`, [
      ...(await evaluate(send, HOME())),
      ...((await evaluate(send, `Boolean(document.querySelector("[data-unread-badge]"))`)) ? ["a new account shows a notification badge"] : []),
    ]);
    await shot("citizen-home-new-user");

    // The same account with reports (filed through the app's own store), sorted by distance.
    await evaluate(send, `(async () => {
      const svc = await import("/src/services/complaintService.js");
      const where = { address: "Main Gate, COER University", latitude: 29.8884, longitude: 77.9589 };
      const a = svc.createComplaint({ citizenId: "layout-new", citizenName: "citizen", issueType: "Overflowing Bin", description: "Bin at the main gate is overflowing", location: where });
      svc.createComplaint({ citizenId: "layout-new", citizenName: "citizen", issueType: "Dirty Toilet", description: "No water in the hostel toilet", location: where });
      svc.updateComplaintStatus(a.id, "RESOLVED", { resolutionNote: "Emptied" });
      return true;
    })()`);
    await send("Browser.grantPermissions", { permissions: ["geolocation"] }).catch(() => {});
    await send("Emulation.setGeolocationOverride", { latitude: 29.8879, longitude: 77.9586, accuracy: 20 });
    await send("Page.navigate", { url: `${url}/citizen` });
    await waitFor(`${byText("button", "Use my location")}`, "the Home");
    await evaluate(send, click(byText("button", "Use my location")));
    await waitFor(`document.querySelector("[data-distance]")`, "the distances");
    await waitFor(TILES_LOADED, "the map tiles");
    await wait(400);
    report(`${"360x740".padEnd(17)} citizen-home, with reports and location (one screen, no gap)`, await evaluate(send, HOME()));
    report(`${"360x740".padEnd(17)} citizen-home map preview (no pin clipped or under the legend)`, await evaluate(send, PINS_INSIDE("[data-map-preview]", 2)));
    report(`${"360x740".padEnd(17)} citizen-home (no dashed borders, no card shadows, badge clear of the bell)`, [...(await evaluate(send, NO_DASHED)), ...(await evaluate(send, NO_CARD_SHADOW)), ...(await evaluate(send, BELL_CLEAR))]);
    await shot("citizen-home-with-reports");

    // The tab bar on a long page: the page scrolls inside its own area; nothing goes under the bar.
    await send("Page.navigate", { url: `${url}/citizen/help` });
    await waitFor(`document.querySelector("[data-bottom-nav]") && document.querySelector("h1")`, "the help page");
    await wait(600);
    await evaluate(send, `(document.querySelector("[data-shell-content]").scrollTop = 1e6, true)`);
    await wait(400);
    {
      const problems = await evaluate(send, `(() => {
        const p = [];
        const area = document.querySelector("[data-shell-content]");
        const nav = document.querySelector("[data-bottom-nav]").getBoundingClientRect();
        if (area.scrollHeight <= area.clientHeight) p.push("the help page isn't long enough to test");
        if (document.documentElement.scrollHeight > innerHeight + 1) p.push("the page itself scrolls");
        if (area.getBoundingClientRect().bottom > nav.top + 0.5) p.push("the content area runs under the tab bar");
        const last = [...area.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().height).at(-1).getBoundingClientRect();
        if (last.bottom > nav.top + 0.5) p.push("the last item is under the tab bar");
        if (Math.abs(nav.bottom - innerHeight) > 1) p.push("the tab bar isn't at the bottom");
        return p;
      })()`);
      report(`${"360x740".padEnd(17)} tab bar on a long page (nothing under it)`, problems);
    }
    await shot("bottom-nav-long-page");

    await send("Page.navigate", { url: `${url}/citizen/profile` });
    await waitFor(`document.querySelector("#account-title")`, "the account section");
    await evaluate(send, click(byText("button", "Change password")));
    await wait(300);
    await evaluate(send, `(document.querySelector("#account-title").scrollIntoView({ block: "start" }), true)`);
    await wait(500);
    await shot("profile-account");
    console.log("ok   360x740           screenshot: profile, your account");

    await send("Page.navigate", { url: `${url}/account/delete` });
    await waitFor(`${byText("h1", "Delete my data")}`, "Delete my data");
    await wait(500);
    await shot("delete-my-data");
    console.log("ok   360x740           screenshot: Delete my data");

    // An official adds a worker (demo login, then the worker directory).
    await openStartScreen();
    await evaluate(send, click(byText("button", "Try the demo")));
    await waitFor(`document.querySelector('[role="dialog"] li button')`, "the demo sheet");
    await evaluate(send, click(`[...document.querySelectorAll('[role="dialog"] li button')].find((b) => b.textContent.includes("Government Official"))`));
    await waitFor(`location.pathname === "/official"`, "the official dashboard");
    await send("Page.navigate", { url: `${url}/official/workers` });
    await waitFor(`${byText("button", "Add worker")}`, "the worker directory");
    await evaluate(send, click(byText("button", "Add worker")));
    await waitFor(`document.querySelector('[role="dialog"]')`, "the Add worker dialog");
    await typeInto("Name", "Anita Sharma");
    await typeInto("Email", "anita.sharma@example.com");
    await typeInto("Area", "Main Gate");
    await wait(500);
    {
      const problems = await evaluate(send, MEASURE);
      const note = await evaluate(send, `document.querySelector("[data-email-note]").textContent`);
      if (!note.includes("an***@e***.com")) problems.push("the hint doesn't mask the typed address: " + note);
      report(`${"360x740".padEnd(17)} official-add-worker (hint masks the typed address)`, problems);
    }
    await shot("official-add-worker");

    // A Government screen: the official's dashboard.
    await evaluate(send, click(`document.querySelector('[role="dialog"] button')`)).catch(() => {});
    await send("Page.navigate", { url: `${url}/official` });
    await waitFor(`location.pathname === "/official" && document.querySelector("h1, h2")`, "the official dashboard");
    await wait(1200);
    report(`${"360x740".padEnd(17)} government dashboard (no sideways scroll, no emoji, no dashed borders, no card shadows)`, [...(await evaluate(send, SIDEWAYS)), ...(await evaluate(send, NO_EMOJI)), ...(await evaluate(send, NO_DASHED)), ...(await evaluate(send, NO_CARD_SHADOW)), ...(await evaluate(send, BELL_CLEAR))]);
    {
      // Compact tiles (about half the old height), no empty cell at the end of the grid, subtitle not cut off.
      const problems = await evaluate(send, `(() => {
        const p = []; const cards = [...document.querySelectorAll("[data-kpi-card]")];
        if (!cards.length) return ["no stat tiles"];
        for (const c of cards) if (c.getBoundingClientRect().height > 72) p.push("tile too tall: " + Math.round(c.getBoundingClientRect().height) + "px");
        const grid = cards[0].parentElement.getBoundingClientRect(); const last = cards.at(-1).getBoundingClientRect();
        if (Math.abs(last.right - grid.right) > 1) p.push("the last tile leaves an empty gap");
        for (const c of cards) for (const t of c.querySelectorAll(".truncate")) if (t.scrollWidth > t.clientWidth + 1) p.push("tile text cut off: " + t.textContent);
        const sub = document.querySelector("h1")?.nextElementSibling; if (sub && sub.scrollWidth > sub.clientWidth + 1) p.push("the subtitle is cut off");
        return p;
      })()`);
      report(`${"360x740".padEnd(17)} government stat tiles (compact, no gap, subtitle not cut off)`, problems);
    }
    await waitFor(TILES_LOADED, "the government map tiles").catch(() => {});
    await wait(500);
    {
      // The map frames the district's bins and toilets: at least one pin fully visible, none clipped.
      const problems = await evaluate(send, `(() => {
        const map = document.querySelector("[data-gov-map] .leaflet-container");
        if (!map) return ["no government map"];
        const m = map.getBoundingClientRect();
        const pins = [...map.querySelectorAll(".leaflet-marker-icon")].map((x) => x.getBoundingClientRect());
        const inside = pins.filter((r) => r.width && r.left >= m.left && r.top >= m.top && r.right <= m.right && r.bottom <= m.bottom);
        const p = [];
        if (!inside.length) p.push("no pin visible on the map (" + pins.length + " markers)");
        if (pins.length && inside.length < pins.length) p.push((pins.length - inside.length) + " pin(s) clipped at the edge");
        return p;
      })()`);
      report(`${"360x740".padEnd(17)} government map (fits every bin and toilet, at least one pin visible)`, problems);
    }
    await shot("government-dashboard");
    await fullShot("government-dashboard-full");

    // A Worker screen: the worker's dashboard.
    await openStartScreen();
    await evaluate(send, click(byText("button", "Try the demo")));
    await waitFor(`document.querySelector('[role="dialog"] li button')`, "the demo sheet");
    await evaluate(send, click(`[...document.querySelectorAll('[role="dialog"] li button')].find((b) => b.textContent.includes("Sanitation Worker"))`));
    await waitFor(`location.pathname === "/worker" && document.querySelector("h1, h2")`, "the worker dashboard");
    await wait(1200);
    report(`${"360x740".padEnd(17)} worker dashboard (no sideways scroll, no emoji, no dashed borders, no card shadows)`, [...(await evaluate(send, SIDEWAYS)), ...(await evaluate(send, NO_EMOJI)), ...(await evaluate(send, NO_DASHED)), ...(await evaluate(send, NO_CARD_SHADOW)), ...(await evaluate(send, BELL_CLEAR))]);
    await waitFor(TILES_LOADED, "the worker map tiles");
    await wait(500);
    {
      // The map looks at the worker's own area (Roorkee for the demo worker), never another city.
      const problems = await evaluate(send, `(() => {
        const p = []; const wrap = document.querySelector("[data-worker-map]");
        if (!wrap) return ["no worker map"];
        const [alat, alng] = wrap.dataset.areaCenter.split(",").map(Number);
        const c = wrap.querySelector(".leaflet-container")?.dataset.mapCenter;
        if (!c) return ["the map doesn't report its centre"];
        const [lat, lng] = c.split(",").map(Number);
        const km = (a, b, c2, d) => { const R = 6371, r = Math.PI / 180; const x = (d - b) * r * Math.cos(((a + c2) / 2) * r), y = (c2 - a) * r; return Math.hypot(x, y) * R; };
        if (wrap.dataset.areaCity !== "Roorkee") p.push("the demo worker's area isn't read as Roorkee: " + wrap.dataset.areaCity);
        const d = km(lat, lng, alat, alng); if (d > 15) p.push("the map is " + Math.round(d) + " km from the worker's area");
        if (km(lat, lng, 26.85, 80.95) < 50) p.push("the map shows Lucknow");
        if ([...document.querySelectorAll("button, a")].some((b) => /^(open map|\\d+ active tasks?)$/i.test(b.textContent.trim()))) p.push("the old Open Map / Active Tasks pills are back");
        if (!/see full map/i.test(document.body.innerText)) p.push("no 'See full map' link");
        if (document.body.innerText.includes("EcoSetu · Smart Swachh Bharat")) p.push("the small brand line is still in the header");
        for (const t of document.querySelectorAll("[data-kpi-card] .truncate")) if (t.scrollWidth > t.clientWidth + 1) p.push("tile text cut off: " + t.textContent);
        const list = document.querySelector("[data-empty-state]") ?? document.querySelector("[data-worker-map]").closest("div.flex-col").querySelector(".overflow-y-auto > *");
        const nav = document.querySelector("[data-bottom-nav]")?.getBoundingClientRect();
        if (list && nav && list.getBoundingClientRect().bottom > nav.top + 0.5) p.push("the first task (or the empty state) is under the tab bar");
        return p;
      })()`);
      if ((await evaluate(send, `document.querySelectorAll("[data-worker-map] .leaflet-marker-icon").length`)) > 0) problems.push(...(await evaluate(send, PINS_INSIDE("[data-worker-map]", 0))));
      report(`${"360x740".padEnd(17)} worker map (centred on the worker's area, pins inside)`, problems);
    }
    await shot("worker-dashboard");

    // The Help page, as a citizen: the real setup, icons not emoji.
    await openStartScreen();
    await evaluate(send, click(byText("button", "Try the demo")));
    await waitFor(`document.querySelector('[role="dialog"] li button')`, "the demo sheet");
    await evaluate(send, click(`[...document.querySelectorAll('[role="dialog"] li button')][0]`));
    await waitFor(`location.pathname === "/citizen"`, "the citizen Home");
    await send("Page.navigate", { url: `${url}/citizen/help` });
    await waitFor(`${byText("h1", "Help")}`, "the Help page");
    await wait(600);
    {
      const problems = [...(await evaluate(send, SIDEWAYS)), ...(await evaluate(send, NO_EMOJI))];
      const about = await evaluate(send, `document.querySelector("[data-about-setup]")?.textContent ?? ""`);
      if (!/server database/i.test(about) || /this device/i.test(about)) problems.push("About doesn't describe the server setup: " + about.slice(0, 80));
      problems.push(...(await evaluate(send, NO_DASHED)), ...(await evaluate(send, NO_CARD_SHADOW)));
      if (await evaluate(send, `document.body.innerText.includes("1969")`)) problems.push("the unconfirmed 1969 helpline is listed");
      report(`${"360x740".padEnd(17)} help page (real setup, no emoji, no unconfirmed helpline, one card style)`, problems);
    }
    await shot("help-page");
  } finally {
    browser.close();
    await server.close();
    rmSync(envDir, { recursive: true, force: true });
  }
  console.log(`\nScreenshots (360x740 @2x): ${OUT}`);
  if (failures.length) {
    console.error(`\n${failures.length} layout problem(s).`);
    process.exit(1);
  }
  console.log("Consent step: no sideways scroll, no request before agreeing. Start screen: no scrolling, centred above the footer, header fixed in every state, touch targets >= 44px, disabled controls AA, demo sheet with three roles, nothing moves while idle. Citizen Home: one screen, no gap, no city-wide tiles, tab labels fit; tab bar never covers a long page. Map preview: every pin inside the map, none under the legend. Worker map centred on the worker's area. Government map shows its pins. Help, worker and government screens: no sideways scroll, no emoji, no dashed borders, no card shadows; bell badge clear of the icon.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
