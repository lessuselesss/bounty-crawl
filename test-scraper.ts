#!/usr/bin/env -S deno run --allow-all

import { chromium } from "playwright";

const url = "https://algora.io/algora/bounties?status=open";

console.log("🧪 Testing Playwright scraper on:", url);

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

// Try different wait strategies
await page.waitForTimeout(3000);

// Get the HTML
const html = await page.content();
console.log(`📄 HTML length: ${html.length} chars`);

// Try to find bounty-related elements
const bountyCards = await page.$$('[data-testid*="bounty"], .bounty-card, article, [class*="bounty"]');
console.log(`🎯 Found ${bountyCards.length} potential bounty elements`);

// Check for any GitHub links
const githubLinks = await page.$$eval('a[href*="github.com"]', links =>
  links.map(l => (l as HTMLAnchorElement).href)
);
console.log(`🔗 Found ${githubLinks.length} GitHub links`);
console.log("GitHub links:", githubLinks.slice(0, 5));

// Get all text content
const textContent = await page.textContent('body');
console.log(`📝 Body text length: ${textContent?.length} chars`);
console.log("First 500 chars:", textContent?.substring(0, 500));

// Try to find specific Algora patterns
const algoraData = await page.evaluate(() => {
  // Look for React/Next.js data
  const scripts = Array.from(document.querySelectorAll('script'));
  const nextData = scripts.find(s => s.id === '__NEXT_DATA__');
  if (nextData) {
    return { type: 'NEXT_DATA', content: nextData.textContent?.substring(0, 1000) };
  }

  // Look for any data attributes
  const dataElements = Array.from(document.querySelectorAll('[data-*]'));
  return {
    type: 'DATA_ATTRS',
    count: dataElements.length,
    sample: dataElements.slice(0, 3).map(el => ({
      tag: el.tagName,
      attrs: Array.from(el.attributes).map(a => a.name)
    }))
  };
});

console.log("🔍 Algora data structure:", JSON.stringify(algoraData, null, 2));

// Check for main content area
const mainContent = await page.$eval('main, #__next, [role="main"]', el => {
  return {
    tagName: el.tagName,
    classes: el.className,
    childCount: el.children.length
  };
}).catch(() => ({ error: "No main content found" }));

console.log("📦 Main content:", mainContent);

await page.screenshot({ path: '/tmp/algora-test.png', fullPage: true });
console.log("📸 Screenshot saved to /tmp/algora-test.png");

await browser.close();

console.log("\n✅ Test complete!");
