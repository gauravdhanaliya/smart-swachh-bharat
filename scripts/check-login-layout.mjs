#!/usr/bin/env node
// Real-browser layout check for the login page (jsdom has no layout engine).
//
//   npm run test:layout                 # checks, screenshots to a temp folder
//   npm run test:layout -- --out shots  # screenshots to ./shots
//
// Starts Vite in browser-only mode with Firebase replaced by a fake (so the
// OTP step can be reached), drives headless Chrome or Edge over the DevTools
// protocol, and at several phone sizes (360x740 and up) checks, for the phone
// step, the OTP step and the demo sheet:
//   - nothing scrolls: not the page, not any scroll container, either axis
//   - header + card + demo link are centred above the skyline, and the
//     skyline is whole (scaled, never cut off) and sits on the footer
//   - the header is at the same position in every step (the block reserves
//     the height of its tallest state, and that reserve is checked too)
//   - every visible control is at least 44px tall (OTP boxes 44px wide too)
//   - disabled controls meet WCAG AA contrast, at full opacity
//   - OTP error state: all six boxes share the error border, nothing selected
//   - the backdrop drifts while the content stays perfectly still, and with
//     prefers-reduced-motion the backdrop doesn't move at all
// Exits 1 with a list of problems if any check fails. Needs Chrome or Edge;
// set CHROME_PATH to use another Chromium.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createServer } from "vite";

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

// Firebase stand-in: sending always works; any code but 123456 is "incorrect".
const FAKE_AUTH = `
export const RECAPTCHA_CONTAINER_ID = "recaptcha-container";
export function resetPendingOtp() {}
export async function sendOtp() {}
export async function confirmOtp(code) {
  if (code !== "123456") throw { code: "auth/invalid-verification-code" };
  return { uid: "layout-check-user", idToken: "fake" };
}
export async function firebaseDeletionAvailable() { return false; }
export async function sendDeleteOtp() {}
export async function confirmDeleteOtp() { return {}; }
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
  const sky = document.querySelector('svg[preserveAspectRatio="xMidYMax meet"]');
  if (sky) {
    const r = sky.getBoundingClientRect();
    if (r.top < -0.5 || r.bottom > vh + 0.5 || r.left < -0.5 || r.right > vw + 0.5) problems.push("skyline is cut off: " + JSON.stringify(r));
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
    if (el.matches('[aria-label^="Digit"]') && r.width < 43.5) problems.push("OTP box under 44px wide: " + name(el) + " " + r.width.toFixed(1));
    if (r.right > vw + 0.5 || r.left < -0.5) problems.push("control outside the screen: " + name(el));
  }
  if (dialog) {
    const r = dialog.getBoundingClientRect();
    if (r.top < -0.5 || r.bottom > vh + 0.5) problems.push("sheet doesn't fit the screen: " + JSON.stringify(r));
  }

  // OTP error state: every box, the focused one included, shows the same (error) border, and nothing is selected.
  const boxes = [...document.querySelectorAll('[aria-label^="Digit"]')];
  if (boxes.some((b) => b.getAttribute("aria-invalid") === "true")) {
    const colours = new Set(boxes.map((b) => getComputedStyle(b).borderTopColor));
    if (colours.size !== 1) problems.push("OTP boxes in the error state have different borders: " + [...colours].join(" / "));
    const a = document.activeElement;
    if (boxes.includes(a) && a.selectionEnd !== a.selectionStart) problems.push("a digit is selected in the error state");
  }

  // Header + card + demo link centred in the space above the skyline; skyline sitting on the footer.
  const block = document.querySelector("[data-login-block]");
  const footer = document.querySelector("footer");
  if (block && sky && footer) {
    const area = block.parentElement.getBoundingClientRect();
    const b = block.getBoundingClientRect();
    const gapTop = b.top - area.top;
    const gapBottom = area.bottom - b.bottom;
    if (Math.abs(gapTop - gapBottom) > 2) problems.push("login block not centred: " + gapTop.toFixed(1) + "px above, " + gapBottom.toFixed(1) + "px below");
    const s = sky.getBoundingClientRect();
    const f = footer.getBoundingClientRect();
    if (Math.abs(f.top - s.bottom) > 1) problems.push("skyline not just above the footer: gap " + (f.top - s.bottom).toFixed(1) + "px");
    if (s.height < 1) problems.push("skyline has shrunk to nothing");
  }

  // The block's reserved height must match its tallest state (OTP step with an error showing):
  // too small and the header would jump on that step; much too large and the gap below is wasted.
  const otpError = document.querySelector('[aria-label^="Digit"][aria-invalid="true"]');
  if (block && otpError) {
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

// Where the content and the backdrop are right now (to compare over time).
const SNAPSHOT = `(() => ({
  content: JSON.stringify([...document.querySelectorAll("[data-login-block], section, footer, input, button")].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => v.toFixed(1)); })),
  backdrop: JSON.stringify([...document.querySelectorAll("[data-motion] > *")].map((e) => getComputedStyle(e).transform)),
  mode: document.querySelector("[data-motion]")?.dataset.motion ?? "missing",
}))()`;

const click = (selectorJs) => `(() => { const el = ${selectorJs}; if (!el) throw new Error("not found: ${selectorJs.replaceAll('"', "'")}"); el.click(); return true; })()`;
const byText = (tag, text) => `[...document.querySelectorAll("${tag}")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))`;

async function run() {
  const { server, url, envDir } = await startVite();
  const browser = await startBrowser();
  const { send } = browser;
  const failures = [];
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    for (const vp of VIEWPORTS) {
      await send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.shots ? 2 : 1, mobile: vp.mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile });
      await send("Page.navigate", { url: `${url}/login` });
      for (let i = 0; i < 100; i += 1) {
        await wait(150);
        if (await evaluate(send, `Boolean(document.querySelector('input[type="tel"]'))`)) break;
      }
      await evaluate(send, "localStorage.clear(), sessionStorage.clear(), true");
      await wait(400);

      const headerTops = {};
      const check = async (state) => {
        await wait(700); // let enter animations finish
        const problems = await evaluate(send, MEASURE);
        headerTops[state] = await evaluate(send, "document.querySelector('header').getBoundingClientRect().top");
        for (const p of problems) failures.push(`${vp.name} ${state}: ${p}`);
        console.log(`${problems.length ? "FAIL" : "ok  "} ${vp.name.padEnd(17)} ${state}${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
        if (vp.shots) {
          const { data } = await send("Page.captureScreenshot", { format: "png" });
          writeFileSync(join(OUT, `login-${state}.png`), Buffer.from(data, "base64"));
        }
      };

      await check("phone-step");

      // The background drifts; the content doesn't move at all.
      {
        const a = await evaluate(send, SNAPSHOT);
        await wait(1500);
        const b = await evaluate(send, SNAPSHOT);
        const problems = [];
        if (a.content !== b.content) problems.push("content moved while idle");
        if (a.mode !== "ambient") problems.push(`backdrop mode is "${a.mode}", expected "ambient"`);
        else if (a.backdrop === b.backdrop) problems.push("backdrop isn't animating");
        for (const p of problems) failures.push(`${vp.name} motion: ${p}`);
        console.log(`${problems.length ? "FAIL" : "ok  "} ${vp.name.padEnd(17)} backdrop drifts, content still${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
      }

      await evaluate(send, `document.querySelector('input[type="tel"]').focus(), true`);
      await send("Input.insertText", { text: "9876543210" });
      await check("phone-filled");
      await evaluate(send, click(byText("button", "Send OTP")));
      await check("otp-step");
      await send("Input.insertText", { text: "1" });
      await evaluate(send, `(() => { const b = document.querySelectorAll('[aria-label^="Digit"]'); b[1].focus(); return true; })()`);
      for (const d of "11111") await send("Input.insertText", { text: d });
      await evaluate(send, click(byText("button", "Verify")));
      await check("otp-error");
      {
        // The header must not move between steps: same top in every state of the page.
        const tops = Object.entries(headerTops).filter(([state]) => state !== "demo-sheet");
        const distinct = new Set(tops.map(([, t]) => t.toFixed(1)));
        const problems = distinct.size === 1 ? [] : ["header moves between steps: " + tops.map(([s, t]) => `${s}=${t.toFixed(1)}`).join(", ")];
        for (const p of problems) failures.push(`${vp.name}: ${p}`);
        console.log(`${problems.length ? "FAIL" : "ok  "} ${vp.name.padEnd(17)} header stays at ${tops[0][1].toFixed(1)}px in every step${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
      }
      await evaluate(send, click(byText("button", "Change number")));
      await wait(300);
      await evaluate(send, click(byText("button", "Try the demo")));
      await check("demo-sheet");
    }

    // prefers-reduced-motion: the backdrop is a still picture.
    await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await send("Page.navigate", { url: `${url}/login` });
    await wait(1500);
    {
      const a = await evaluate(send, SNAPSHOT);
      await wait(1500);
      const b = await evaluate(send, SNAPSHOT);
      const problems = [];
      if (a.mode !== "static") problems.push(`backdrop mode is "${a.mode}", expected "static"`);
      if (a.backdrop !== b.backdrop) problems.push("backdrop moves under reduced motion");
      if (a.content !== b.content) problems.push("content moved while idle");
      for (const p of problems) failures.push(`reduced-motion: ${p}`);
      console.log(`${problems.length ? "FAIL" : "ok  "} ${"360x740".padEnd(17)} reduced motion: backdrop still${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
    }
    await send("Emulation.setEmulatedMedia", { features: [] });
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
  console.log("Login layout: no scrolling, centred, header fixed between steps, skyline whole above the footer, touch targets >= 44px, disabled controls AA, backdrop drifts (still with reduced motion).");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
