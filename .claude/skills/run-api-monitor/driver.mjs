// REPL driver for the API Monitoring Platform (React + Vite frontend).
// chromium-cli isn't installed in this environment, so this wraps
// Playwright directly. Run it, then type commands at the `driver>` prompt.
// Designed for agents: wrap in tmux, send-keys commands, capture-pane output.
import { chromium } from "playwright";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:5173";
const SHOT_DIR = process.env.SCREENSHOT_DIR || "/tmp/shots";
fs.mkdirSync(SHOT_DIR, { recursive: true });

process.on("unhandledRejection", (err) => console.error("UNHANDLED:", err));

let browser = null;
let page = null;
let consoleErrors = [];

function attachConsoleCapture(p) {
  consoleErrors = [];
  p.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  p.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));
}

const COMMANDS = {
  async launch() {
    if (browser) return console.log("already launched");
    browser = await chromium.launch({ args: ["--no-sandbox"] });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    attachConsoleCapture(page);
    console.log("launched. base URL:", BASE_URL);
  },

  async nav(route) {
    if (!page) return console.log("ERROR: launch first");
    const url = (route || "/").startsWith("http") ? route : BASE_URL + (route || "/");
    consoleErrors = [];
    await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
    console.log("nav ->", url);
  },

  async ss(name) {
    if (!page) return console.log("ERROR: launch first");
    // NOTE: do not pass { fullPage: true } - with this app's
    // ResponsiveContainer (Recharts) charts, Playwright's full-page
    // resize-and-stitch capture races the chart's ResizeObserver and
    // captures bars/pies mid-relayout as blank. A plain viewport
    // screenshot (scroll first if you need what's below the fold) does
    // not have this problem.
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + ".png");
    await page.screenshot({ path: f });
    console.log("screenshot:", f);
  },

  async click(sel) {
    if (!page) return console.log("ERROR: launch first");
    try {
      await page.click(sel, { timeout: 5000 });
      console.log("click", sel, "-> OK");
    } catch (e) {
      console.log("click", sel, "-> ERROR:", e.message.split("\n")[0]);
    }
  },

  async "click-text"(text) {
    if (!page) return console.log("ERROR: launch first");
    try {
      await page.click(`text=${text}`, { timeout: 5000 });
      console.log("click-text", JSON.stringify(text), "-> OK");
    } catch (e) {
      console.log("click-text", JSON.stringify(text), "-> ERROR:", e.message.split("\n")[0]);
    }
  },

  async fill(args) {
    if (!page) return console.log("ERROR: launch first");
    const [sel, ...rest] = args.split(" ");
    const value = rest.join(" ");
    try {
      await page.fill(sel, value, { timeout: 5000 });
      console.log("fill", sel, JSON.stringify(value), "-> OK");
    } catch (e) {
      console.log("fill", sel, "-> ERROR:", e.message.split("\n")[0]);
    }
  },

  // Upload a file into a file input, e.g. for the CSV import flow: `upload #csv-file ./test.csv`
  async upload(args) {
    if (!page) return console.log("ERROR: launch first");
    const [sel, filePath] = args.split(" ");
    try {
      await page.setInputFiles(sel, filePath, { timeout: 5000 });
      console.log("upload", sel, filePath, "-> OK");
    } catch (e) {
      console.log("upload", sel, "-> ERROR:", e.message.split("\n")[0]);
    }
  },

  async wait(sel) {
    if (!page) return console.log("ERROR: launch first");
    try {
      await page.waitForSelector(sel, { timeout: 10_000 });
      console.log("found:", sel);
    } catch {
      console.log("TIMEOUT:", sel);
    }
  },

  async text(sel) {
    if (!page) return console.log("ERROR: launch first");
    console.log(
      await page.evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? "(null)", sel || null)
    );
  },

  async eval(expr) {
    if (!page) return console.log("ERROR: launch first");
    try {
      console.log(JSON.stringify(await page.evaluate(expr)));
    } catch (e) {
      console.log("ERROR:", e.message);
    }
  },

  console() {
    console.log(consoleErrors.length === 0 ? "no console errors" : consoleErrors.join("\n"));
  },

  async quit() {
    if (browser) await browser.close().catch(() => {});
    browser = null;
    page = null;
  },

  help() {
    console.log("commands:", Object.keys(COMMANDS).join(", "));
  },
};

// Read from the raw stdin fd, not process.stdin directly. Playwright's
// launched browser subprocess otherwise interferes with the parent's
// stdin stream and "launch" hangs forever with no error (same class of
// issue as Electron "stealing" stdin - see run-skill-generator's
// electron.md example).
const stdin = fs.createReadStream(null, { fd: fs.openSync("/dev/stdin", "r") });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: "driver> " });

// Piped stdin (heredoc, tmux send-keys) delivers "line" events back-to-back;
// readline does NOT wait for an async listener to resolve before firing the
// next one. Without this queue, commands overlap (e.g. "nav" starts before
// "launch" finishes) and everything fails with spurious "launch first"
// errors. Queue keeps them strictly sequential regardless of input pacing.
let queue = Promise.resolve();

rl.on("line", (line) => {
  queue = queue.then(async () => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    if (!cmd) return rl.prompt();
    const fn = COMMANDS[cmd];
    if (!fn) {
      console.log("unknown:", cmd, "- try: help");
      return rl.prompt();
    }
    try {
      await fn(rest.join(" "));
    } catch (e) {
      console.log("ERROR:", e.message);
    }
    if (cmd === "quit") {
      rl.close();
      process.exit(0);
    }
    rl.prompt();
  });
});
rl.on("close", async () => {
  // With piped stdin (heredoc, non-interactive use), "close" fires as soon
  // as EOF is reached - essentially as soon as all lines have been read,
  // NOT after the queued async commands finish running. Without this
  // await, "close" races the queue and process.exit() kills an in-flight
  // command (e.g. a "launch" whose chromium.launch() never got to finish).
  await queue.catch(() => {});
  await COMMANDS.quit();
  process.exit(0);
});

console.log("api-monitor driver - \"help\" for commands, \"launch\" to start");
rl.prompt();
