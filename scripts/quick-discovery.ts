#!/usr/bin/env -S deno run --allow-all

/**
 * Quick Organization Discovery
 *
 * Fast discovery by testing known patterns and existing successful organizations
 */

import { parseArgs } from "@std/cli/parse_args.ts";

// Known successful organizations that definitely exist
const KNOWN_ORGS = [
  "calcom", "cal", "zio", "ZIO", "twenty", "twentyhq", "nuxt", "remotion", "remotion-dev",
  "polarsource", "tscircuit", "mediar-ai", "maybe-finance", "triggerdotdev", "keephq",
  "coollabsio", "zed-industries", "PX4", "projectdiscovery", "TraceMachina", "garden-co",
  "GolemCloud", "mudlet", "ziverge", "oramasearch", "MonoGame", "omnigres", "BanklessDAO",
  "banyan-collective", "ipfs", "humanprotocol", "nocodb", "borgbackup", "algorand",
  "qdrant", "algora-io", "activepieces", "highlight", "documenso", "traceloop"
];

// Additional patterns to test based on popular projects
const ADDITIONAL_PATTERNS = [
  // Major companies/projects
  "vercel", "next", "react", "vue", "svelte", "angular", "solid",
  "supabase", "planetscale", "neon", "prisma", "drizzle",
  "github", "gitlab", "microsoft", "google", "meta", "facebook",
  "stripe", "shopify", "cloudflare", "netlify", "railway", "fly",

  // Crypto/Web3
  "ethereum", "eth", "solana", "polygon", "matic", "avalanche",
  "chainlink", "uniswap", "aave", "compound", "maker", "gnosis",
  "near", "cosmos", "terra", "luna", "fantom", "arbitrum", "optimism",

  // Popular open source
  "docker", "kubernetes", "k8s", "terraform", "pulumi", "helm",
  "redis", "postgres", "postgresql", "mongodb", "mysql", "sqlite",
  "elastic", "elasticsearch", "nginx", "apache", "caddy",
  "vscode", "code", "obsidian", "notion", "linear", "figma",

  // Programming languages/tools
  "rust", "go", "golang", "python", "node", "nodejs", "deno",
  "typescript", "ts", "javascript", "js", "java", "kotlin",
  "swift", "dart", "flutter", "rails", "django", "laravel", "spring",

  // Blockchain platforms
  "avalabs", "polkadot", "cardano", "ada", "tezos", "xtz",
  "stellar", "xlm", "ripple", "xrp", "litecoin", "ltc",

  // DeFi and Web3 tools
  "metamask", "walletconnect", "rainbow", "coinbase", "binance",
  "opensea", "rarible", "foundation", "async", "superrare",

  // Dev tools and platforms
  "sentry", "datadog", "newrelic", "honeycomb", "bugsnag",
  "heroku", "aws", "azure", "gcp", "digitalocean", "linode",

  // Popular GitHub orgs
  "microsoft", "google", "facebook", "apple", "amazon", "netflix",
  "uber", "airbnb", "spotify", "twitter", "discord", "slack",
  "adobe", "intel", "nvidia", "amd", "qualcomm", "samsung"
];

async function testOrgExists(handle: string): Promise<{ handle: string; exists: boolean; error?: string }> {
  try {
    const response = await fetch(`https://algora.io/${handle}/bounties?status=open`, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      }
    });

    // Status 200 means the org exists, 404 means it doesn't
    const exists = response.status === 200;

    return { handle, exists };
  } catch (error) {
    return { handle, exists: false, error: error.message };
  }
}

async function quickDiscovery() {
  console.log("🚀 Starting quick organization discovery...");

  const allPatterns = [...KNOWN_ORGS, ...ADDITIONAL_PATTERNS];
  const uniquePatterns = [...new Set(allPatterns)];

  console.log(`🎯 Testing ${uniquePatterns.length} organization patterns...`);

  const existingOrgs = [];
  const nonExistentOrgs = [];
  const errors = [];

  // Test in batches to avoid overwhelming the server
  const batchSize = 10;
  const delay = 1000; // 1 second between batches

  for (let i = 0; i < uniquePatterns.length; i += batchSize) {
    const batch = uniquePatterns.slice(i, i + batchSize);
    console.log(`📋 Testing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniquePatterns.length/batchSize)} (${batch.length} orgs)`);

    const batchPromises = batch.map(testOrgExists);
    const results = await Promise.all(batchPromises);

    for (const result of results) {
      if (result.error) {
        errors.push(result);
        console.log(`❌ Error testing ${result.handle}: ${result.error}`);
      } else if (result.exists) {
        existingOrgs.push(result.handle);
        console.log(`✅ Found: ${result.handle}`);
      } else {
        nonExistentOrgs.push(result.handle);
        console.log(`⭕ Not found: ${result.handle}`);
      }
    }

    // Delay between batches
    if (i + batchSize < uniquePatterns.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Generate the organizations.json format
  const organizations = existingOrgs.map(handle => ({
    handle,
    display_name: handle.charAt(0).toUpperCase() + handle.slice(1), // Simple capitalization
    url: `https://algora.io/${handle}/bounties?status=open`,
    active: true,
    scrape_interval: 1800, // 30 minutes default
    tier: "active", // Will be refined later
    firecrawl_enabled: true
  }));

  const output = {
    updated_at: new Date().toISOString(),
    version: "3.0.0",
    total_organizations: organizations.length,
    discovery_method: "HEAD request pattern matching",
    organizations: organizations.sort((a, b) => a.handle.localeCompare(b.handle))
  };

  console.log(`\n📊 Discovery Results:`);
  console.log(`   Found organizations: ${existingOrgs.length}`);
  console.log(`   Non-existent: ${nonExistentOrgs.length}`);
  console.log(`   Errors: ${errors.length}`);
  console.log(`\n🎯 Discovered Organizations:`);
  existingOrgs.forEach(org => console.log(`   - ${org}`));

  return output;
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "dry-run", "save"],
    string: ["output"],
    alias: {
      h: "help",
      o: "output"
    }
  });

  if (args.help) {
    console.log(`
🔍 Quick Algora Organization Discovery

USAGE:
  deno run --allow-net scripts/quick-discovery.ts [OPTIONS]

OPTIONS:
  --save           Save results to organizations.json
  --output FILE    Output file (default: data/organizations.json)
  --dry-run        Just show results without saving
  --help, -h       Show this help message

This script uses HEAD requests to quickly test if organization pages exist,
avoiding the need for expensive Firecrawl scraping during discovery.
`);
    Deno.exit(0);
  }

  const result = await quickDiscovery();

  if (args.save || !args["dry-run"]) {
    const outputFile = args.output || "data/organizations.json";
    await Deno.writeTextFile(outputFile, JSON.stringify(result, null, 2));
    console.log(`\n✅ Saved ${result.organizations.length} organizations to ${outputFile}`);
  }

  console.log(`\n🎉 Discovery complete! Found ${result.organizations.length} organizations.`);
}

if (import.meta.main) {
  await main();
}