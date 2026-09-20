import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
await p.goto(pathToFileURL(process.argv[2]).href, { waitUntil: "networkidle" });
await p.waitForTimeout(600);
await p.locator(".feuille").screenshot({ path: process.argv[3] });
await b.close();
console.log("→", process.argv[3]);
