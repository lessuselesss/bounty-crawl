#!/usr/bin/env -S deno run --allow-all

import { chromium } from "playwright";

const url = "https://algora.io/cal/bounties?status=open";

console.log("🔍 Debugging Cal.com bounty page:", url);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
});
const page = await context.newPage();

console.log("📡 Navigating...");
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

console.log("⏳ Waiting for #__next...");
try {
  await page.waitForSelector('#__next', { timeout: 5000 });
  await page.waitForTimeout(4000);
} catch {
  await page.waitForTimeout(5000);
}

// Try different selectors
const tests = [
  'a[href*="github.com"]',
  'a[href*="issues"]',
  'a.group\\/issue',
  '[class*="bounty"]',
];

for (const selector of tests) {
  const count = await page.evaluate((sel) => {
    return document.querySelectorAll(sel).length;
  }, selector);
  console.log(`  ${selector}: ${count} elements`);
}

// Get all GitHub links
const links = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a[href*="github.com"]'));
  return all.map(a => ({
    href: (a as HTMLAnchorElement).href,
    text: a.textContent?.substring(0, 50),
    visible: (a as HTMLElement).offsetParent !== null
  }));
});

console.log(`\n📋 Found ${links.length} GitHub links:`);
links.slice(0, 10).forEach(l => {
  console.log(`  ${l.visible ? '✅' : '❌'} ${l.href} - "${l.text}"`);
});

// Check if content is actually loaded
const bodyText = await page.evaluate(() => document.body.innerText);
console.log(`\n📝 Body text length: ${bodyText.length}`);
console.log(`   Contains "bounty": ${bodyText.toLowerCase().includes('bounty')}`);
console.log(`   Contains "issue": ${bodyText.toLowerCase().includes('issue')}`);

await browser.close();
