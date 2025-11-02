#!/usr/bin/env -S deno run --allow-all

import { chromium } from "playwright";

const url = "https://algora.io/zio/bounties?status=open";

console.log("🔍 Debugging __NEXT_DATA__ structure for:", url);

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
});

const page = await context.newPage();

console.log("📡 Navigating to page...");
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

console.log("⏳ Waiting for content to load...");
try {
  await page.waitForSelector('#__next', { timeout: 5000 });
  await page.waitForTimeout(4000);
} catch {
  await page.waitForTimeout(5000);
}

// Extract __NEXT_DATA__
const nextData = await page.evaluate(() => {
  const script = document.querySelector('#__NEXT_DATA__');
  if (script && script.textContent) {
    try {
      return JSON.parse(script.textContent);
    } catch {}
  }
  return null;
});

console.log("\n📦 __NEXT_DATA__ structure:");
console.log(JSON.stringify(nextData, null, 2).substring(0, 5000));

if (nextData?.props) {
  console.log("\n🔑 Keys in nextData.props:");
  console.log(Object.keys(nextData.props));

  if (nextData.props.pageProps) {
    console.log("\n🔑 Keys in nextData.props.pageProps:");
    console.log(Object.keys(nextData.props.pageProps));

    // Look for bounties/items/data
    const pageProps = nextData.props.pageProps;
    if (pageProps.bounties) {
      console.log("\n✅ Found bounties:", pageProps.bounties.length, "items");
      console.log("Sample:", JSON.stringify(pageProps.bounties[0], null, 2).substring(0, 1000));
    }
    if (pageProps.items) {
      console.log("\n✅ Found items:", pageProps.items.length, "items");
      console.log("Sample:", JSON.stringify(pageProps.items[0], null, 2).substring(0, 1000));
    }
    if (pageProps.data) {
      console.log("\n✅ Found data:", JSON.stringify(pageProps.data, null, 2).substring(0, 1000));
    }
  }
}

await browser.close();
console.log("\n✅ Debug complete!");
