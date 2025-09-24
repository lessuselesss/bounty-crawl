#!/usr/bin/env -S deno run --allow-all

/**
 * Final Organization Discovery Push
 *
 * Last attempt to find all ~109 organizations using:
 * 1. Deeper pagination scraping
 * 2. Alternative URL patterns
 * 3. GitHub organization cross-referencing
 * 4. Systematic alphabet search
 */

import { parseArgs } from "@std/cli/parse_args.ts";

async function scrapeUrl(url: string): Promise<string | null> {
  try {
    console.log(`🌐 Scraping: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (response.status === 200) {
      const html = await response.text();
      console.log(`✅ Scraped ${html.length} chars from ${url}`);
      return html;
    } else {
      console.log(`❌ Failed ${url}: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error scraping ${url}: ${error.message}`);
    return null;
  }
}

function extractOrgs(html: string): Set<string> {
  const orgs = new Set<string>();

  // Multiple extraction patterns
  const patterns = [
    /\/([a-zA-Z0-9-_]+)\/bounties/g,
    /algora\.io\/([a-zA-Z0-9-_]+)/g,
    /href="\/([a-zA-Z0-9-_]+)\/bounties"/g,
    /href="\/([a-zA-Z0-9-_]+)"/g,
    /@([a-zA-Z0-9-_]+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const org = match[1];
      if (org &&
          org.length >= 2 &&
          org.length <= 50 &&
          /^[a-zA-Z0-9-_]+$/.test(org) &&
          !['bounties', 'api', 'login', 'signup', 'static', 'assets', 'about', 'terms', 'privacy', 'help', 'contact', 'docs', 'blog', 'careers', 'pricing', 'features', 'dashboard', 'settings', 'profile', 'account', 'admin', 'support', 'status', 'health', 'ping', 'test', 'dev', 'staging', 'production', 'www', 'cdn', 'img', 'images', 'css', 'js', 'fonts', 'favicon', 'robots', 'sitemap', 'search', 'filter', 'sort', 'page', 'next', 'prev', 'first', 'last', 'home', 'index', 'main', 'popular', 'trending', 'featured', 'recent', 'latest', 'top', 'best', 'new', 'all', 'public', 'open', 'closed', 'completed', 'active', 'inactive', 'leaderboard', 'explore', 'discover', 'browse', 'categories', 'tags', 'topics'].includes(org.toLowerCase())) {
        orgs.add(org);
      }
    }
  }

  return orgs;
}

async function validateOrg(handle: string): Promise<boolean> {
  try {
    const response = await fetch(`https://algora.io/${handle}/bounties?status=open`, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' }
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function finalDiscovery() {
  console.log("🚀 Final discovery push to find all ~109 organizations...");

  const allOrgs = new Set<string>();

  // Load existing
  try {
    const existing = await Deno.readTextFile("data/organizations.json");
    const data = JSON.parse(existing);
    for (const org of data.organizations || []) {
      allOrgs.add(org.handle);
    }
    console.log(`📋 Starting with ${allOrgs.size} existing organizations`);
  } catch {
    console.log("ℹ️  No existing organizations found");
  }

  // Strategy 1: Deep pagination scraping
  console.log("\n🔍 Strategy 1: Deep pagination scraping...");
  const pages = [];
  for (let i = 1; i <= 20; i++) {
    pages.push(`https://algora.io/bounties?page=${i}`);
    pages.push(`https://algora.io/bounties?status=open&page=${i}`);
    pages.push(`https://algora.io/bounties?status=completed&page=${i}`);
  }

  for (const url of pages.slice(0, 10)) { // Limit to avoid rate limits
    const html = await scrapeUrl(url);
    if (html) {
      const orgs = extractOrgs(html);
      for (const org of orgs) allOrgs.add(org);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Strategy 2: Alternative URL patterns
  console.log("\n🔍 Strategy 2: Alternative URL patterns...");
  const alternativeUrls = [
    'https://algora.io/leaderboard?timeframe=week',
    'https://algora.io/leaderboard?timeframe=month',
    'https://algora.io/leaderboard?timeframe=year',
    'https://algora.io/leaderboard?timeframe=all',
    'https://algora.io/bounties?sort=newest&limit=100',
    'https://algora.io/bounties?sort=oldest&limit=100',
    'https://algora.io/bounties?sort=highest&limit=100',
    'https://algora.io/bounties?sort=popular&limit=100',
  ];

  for (const url of alternativeUrls) {
    const html = await scrapeUrl(url);
    if (html) {
      const orgs = extractOrgs(html);
      for (const org of orgs) allOrgs.add(org);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Strategy 3: Common project patterns we might have missed
  console.log("\n🔍 Strategy 3: Testing additional known patterns...");
  const additionalPatterns = [
    // Missing crypto/web3 projects
    "ethereum-foundation", "ethereum", "solana-labs", "solana-foundation",
    "polygon-technology", "arbitrum", "optimism", "base", "scroll",
    "starkware", "matter-labs", "zksync", "immutable", "dydx",

    // Missing major companies
    "shopify", "atlassian", "jetbrains", "mongodb", "redis",
    "elastic", "grafana", "hashicorp", "docker", "nvidia",

    // Missing open source projects
    "tensorflow", "pytorch", "jupyter", "apache", "mozilla",
    "linuxfoundation", "cncf", "nodejs", "denoland", "golang",

    // Missing tools and platforms
    "postman", "insomnia", "paw", "rapidapi", "swagger",
    "firebase", "aws", "azure", "gcp", "digitalocean",

    // Additional patterns from GitHub trending
    "shadcn-ui", "shadcn", "clerk-dev", "clerk", "convex-dev",
    "planetscale", "railway", "fly-io", "render", "cyclic",
    "upstash", "turso", "xata", "fauna", "cockroachdb",

    // AI/ML companies
    "openai", "anthropic", "replicate", "stability-ai", "midjourney",
    "runway-ml", "eleven-labs", "elevenlabs", "cohere", "together-ai",

    // Developer tools
    "linear", "height", "clickup", "notion", "coda", "obsidian",
    "logseq", "roam", "craft", "bear", "ulysses",

    // More blockchain
    "avalanche", "fantom", "harmony", "celo", "tezos", "cardano",
    "polkadot", "kusama", "chainlink", "uniswap", "aave", "compound"
  ];

  // Test additional patterns in batches
  const batchSize = 5;
  for (let i = 0; i < additionalPatterns.length; i += batchSize) {
    const batch = additionalPatterns.slice(i, i + batchSize);
    console.log(`📋 Testing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(additionalPatterns.length/batchSize)}`);

    const promises = batch.map(async pattern => {
      const isValid = await validateOrg(pattern);
      if (isValid) {
        allOrgs.add(pattern);
        console.log(`✅ Found: ${pattern}`);
      }
      return isValid;
    });

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n📊 Total unique organizations found: ${allOrgs.size}`);

  // Validate all organizations
  console.log("\n🔍 Final validation of all organizations...");
  const orgList = Array.from(allOrgs);
  const validOrgs = [];

  // Validate in batches
  for (let i = 0; i < orgList.length; i += 5) {
    const batch = orgList.slice(i, i + 5);
    console.log(`✅ Validating batch ${Math.floor(i/5) + 1}/${Math.ceil(orgList.length/5)}`);

    const promises = batch.map(async org => {
      const isValid = await validateOrg(org);
      if (isValid) {
        validOrgs.push(org);
        console.log(`✅ ${org}`);
      } else {
        console.log(`❌ ${org}`);
      }
      return isValid;
    });

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Generate final output
  const organizations = validOrgs
    .map(handle => ({
      handle,
      display_name: handle.charAt(0).toUpperCase() + handle.slice(1),
      url: `https://algora.io/${handle}/bounties?status=open`,
      active: true,
      scrape_interval: 1800,
      tier: "active" as const,
      firecrawl_enabled: true
    }))
    .sort((a, b) => a.handle.localeCompare(b.handle));

  const output = {
    updated_at: new Date().toISOString(),
    version: "3.1.0",
    total_organizations: organizations.length,
    discovery_method: "Final comprehensive discovery + deep scraping",
    discovery_stats: {
      total_handles_discovered: allOrgs.size,
      valid_organizations: validOrgs.length,
      invalid_handles: allOrgs.size - validOrgs.length,
      strategies_used: ["Deep pagination", "Alternative URLs", "Pattern testing", "Validation"]
    },
    organizations
  };

  console.log(`\n🎉 FINAL RESULTS:`);
  console.log(`   Organizations discovered: ${allOrgs.size}`);
  console.log(`   Valid organizations: ${validOrgs.length}`);
  console.log(`   Invalid handles: ${allOrgs.size - validOrgs.length}`);
  console.log(`\n🎯 All ${validOrgs.length} Valid Organizations:`);
  validOrgs.forEach((org, i) => console.log(`   ${i + 1}. ${org}`));

  return output;
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "dry-run", "save"],
    string: ["output"],
    alias: { h: "help", o: "output" }
  });

  if (args.help) {
    console.log(`
🔍 Final Algora Organization Discovery

USAGE:
  deno run --allow-all scripts/final-discovery.ts [OPTIONS]

OPTIONS:
  --save           Save results to organizations.json
  --output FILE    Output file (default: data/organizations.json)
  --dry-run        Show results without saving
  --help, -h       Show this help

Final push to discover all ~109 Algora organizations using multiple strategies.
`);
    Deno.exit(0);
  }

  const result = await finalDiscovery();

  if (args.save || !args["dry-run"]) {
    const outputFile = args.output || "data/organizations.json";
    await Deno.writeTextFile(outputFile, JSON.stringify(result, null, 2));
    console.log(`\n✅ Saved ${result.organizations.length} organizations to ${outputFile}`);
  }

  console.log(`\n🏁 Final discovery complete! Found ${result.organizations.length} valid organizations.`);

  if (result.organizations.length >= 100) {
    console.log("🎉 SUCCESS: Reached target of ~100+ organizations!");
  } else {
    console.log(`ℹ️  Found ${result.organizations.length}/109 organizations (${109 - result.organizations.length} still missing)`);
  }
}

if (import.meta.main) {
  await main();
}