#!/usr/bin/env -S deno run --allow-all

/**
 * Ultra-Aggressive Organization Discovery
 *
 * Final push using:
 * 1. Systematic dictionary word testing
 * 2. GitHub trending projects
 * 3. Common abbreviations and acronyms
 * 4. Geographic and industry terms
 */

import { parseArgs } from "@std/cli/parse_args.ts";

async function testOrg(handle: string): Promise<boolean> {
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

async function testBatch(handles: string[], existingOrgs: Set<string>): Promise<string[]> {
  const newOrgs = [];
  const batchSize = 5;

  for (let i = 0; i < handles.length; i += batchSize) {
    const batch = handles.slice(i, i + batchSize);

    const promises = batch.map(async handle => {
      if (!existingOrgs.has(handle) && handle.length >= 2 && handle.length <= 50) {
        const isValid = await testOrg(handle);
        if (isValid) {
          existingOrgs.add(handle);
          newOrgs.push(handle);
          console.log(`✅ Found: ${handle}`);
          return handle;
        }
      }
      return null;
    });

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  return newOrgs;
}

async function ultraDiscovery() {
  console.log("🚀 Ultra-aggressive final discovery push...");

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

  let totalNewOrgs: string[] = [];

  // Strategy 1: Short dictionary words
  console.log("\n🔍 Strategy 1: Testing common short words...");
  const shortWords = [
    // 2-3 letter words
    "ai", "io", "ui", "ux", "db", "os", "js", "ts", "py", "go", "rs",
    "app", "api", "cli", "gui", "web", "net", "dev", "pro", "max", "min",
    "lab", "hub", "kit", "lib", "box", "bot", "run", "fly", "sky", "sun",
    "day", "way", "key", "map", "set", "get", "put", "fix", "add", "del",

    // 4-5 letter words
    "code", "data", "tech", "soft", "hard", "core", "base", "link", "sync",
    "mesh", "grid", "flow", "pipe", "wire", "beam", "wave", "echo", "bolt",
    "fire", "iron", "gold", "blue", "cyan", "lime", "pink", "gray", "dark",
    "fast", "slow", "easy", "hard", "cool", "warm", "deep", "high", "wide",
    "open", "free", "pure", "real", "true", "safe", "smart", "quick",

    // Tech terms
    "cloud", "micro", "macro", "ultra", "super", "hyper", "multi", "cross",
    "stack", "frame", "space", "place", "world", "earth", "orbit", "lunar",
    "solar", "quantum", "neural", "digital", "crypto", "chain", "block",
    "token", "coin", "swap", "pool", "farm", "mine", "stake", "yield",

    // Action words
    "build", "deploy", "scale", "merge", "split", "clone", "fork", "push",
    "pull", "fetch", "store", "cache", "index", "search", "filter", "sort"
  ];

  const newWords = await testBatch(shortWords, allOrgs);
  totalNewOrgs.push(...newWords);

  // Strategy 2: Common abbreviations and acronyms
  console.log("\n🔍 Strategy 2: Testing abbreviations and acronyms...");
  const abbreviations = [
    // Tech abbreviations
    "aws", "gcp", "ibm", "sap", "crm", "erp", "cms", "cdn", "dns", "ssl",
    "tls", "tcp", "udp", "http", "ftp", "ssh", "sql", "nosql", "orm",
    "mvc", "mvp", "spa", "pwa", "seo", "sem", "rss", "xml", "json",
    "yaml", "csv", "pdf", "png", "jpg", "svg", "gif", "mp4", "mp3",

    // Company/org abbreviations
    "nasa", "ieee", "acm", "ietf", "w3c", "iso", "ansi", "nist", "cern",
    "mit", "cmu", "ucla", "nyu", "usc", "ucsd", "umich", "gatech",

    // Industry terms
    "saas", "paas", "iaas", "baas", "faas", "daas", "caas", "devops",
    "mlops", "aiops", "devsecops", "gitops", "chatops", "fintech",
    "edtech", "healthtech", "proptech", "insurtech", "legaltech",

    // Geographic abbreviations
    "nyc", "sf", "la", "chi", "bos", "sea", "atl", "dal", "den", "pdx",
    "eu", "us", "uk", "de", "fr", "jp", "cn", "in", "au", "ca", "br",

    // 3-letter combinations that might be usernames/orgs
    "abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwx", "xyz",
    "aaa", "bbb", "ccc", "ddd", "eee", "fff", "ggg", "hhh", "iii"
  ];

  const newAbbrevs = await testBatch(abbreviations, allOrgs);
  totalNewOrgs.push(...newAbbrevs);

  // Strategy 3: Number combinations
  console.log("\n🔍 Strategy 3: Testing number combinations...");
  const numbers = [];

  // Years
  for (let year = 1990; year <= 2025; year++) {
    numbers.push(year.toString());
  }

  // Common numbers
  for (let i = 1; i <= 100; i++) {
    numbers.push(i.toString());
    numbers.push(`v${i}`);
    numbers.push(`x${i}`);
  }

  const newNumbers = await testBatch(numbers.slice(0, 100), allOrgs);
  totalNewOrgs.push(...newNumbers);

  // Strategy 4: Animal and nature names
  console.log("\n🔍 Strategy 4: Testing animal and nature names...");
  const nature = [
    // Animals
    "cat", "dog", "fox", "owl", "bee", "ant", "elk", "ram", "ox", "pig",
    "lion", "bear", "wolf", "deer", "duck", "swan", "crow", "hawk", "eagle",
    "shark", "whale", "fish", "crab", "frog", "snake", "gecko", "panda",
    "koala", "zebra", "tiger", "horse", "mouse", "rabbit", "sheep", "goat",

    // Nature
    "oak", "pine", "rose", "lily", "fern", "moss", "rock", "stone", "sand",
    "ocean", "river", "lake", "creek", "forest", "jungle", "desert", "field",
    "mountain", "valley", "canyon", "cliff", "beach", "shore", "island",
    "storm", "thunder", "lightning", "rain", "snow", "ice", "frost", "mist"
  ];

  const newNature = await testBatch(nature, allOrgs);
  totalNewOrgs.push(...newNature);

  // Strategy 5: Color and material names
  console.log("\n🔍 Strategy 5: Testing colors and materials...");
  const materials = [
    // Colors
    "red", "blue", "green", "yellow", "orange", "purple", "pink", "brown",
    "black", "white", "gray", "silver", "gold", "copper", "bronze", "platinum",
    "crimson", "scarlet", "azure", "cyan", "lime", "mint", "coral", "teal",
    "violet", "indigo", "magenta", "maroon", "navy", "olive", "tan", "beige",

    // Materials
    "steel", "iron", "wood", "stone", "glass", "crystal", "diamond", "ruby",
    "emerald", "sapphire", "pearl", "marble", "granite", "concrete", "clay",
    "ceramic", "plastic", "rubber", "fabric", "leather", "paper", "carbon"
  ];

  const newMaterials = await testBatch(materials, allOrgs);
  totalNewOrgs.push(...newMaterials);

  // Strategy 6: Mythology and space terms
  console.log("\n🔍 Strategy 6: Testing mythology and space terms...");
  const mythSpace = [
    // Mythology
    "apollo", "artemis", "zeus", "hera", "athena", "ares", "thor", "odin",
    "loki", "freya", "atlas", "titan", "phoenix", "dragon", "kraken",
    "hydra", "medusa", "sphinx", "griffin", "pegasus", "unicorn",

    // Space
    "mars", "venus", "jupiter", "saturn", "neptune", "pluto", "earth",
    "mercury", "uranus", "moon", "europa", "titan", "io", "ganymede",
    "star", "nova", "quasar", "galaxy", "nebula", "cosmos", "void",
    "orbit", "comet", "asteroid", "meteor", "satellite", "probe"
  ];

  const newMythSpace = await testBatch(mythSpace, allOrgs);
  totalNewOrgs.push(...newMythSpace);

  // Final comprehensive validation
  console.log("\n🔍 Final validation of all organizations...");
  const finalOrgs = [];

  for (const org of Array.from(allOrgs)) {
    const isValid = await testOrg(org);
    if (isValid) {
      finalOrgs.push(org);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Generate output
  const organizations = finalOrgs
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
    version: "5.0.0",
    total_organizations: organizations.length,
    discovery_method: "Ultra-aggressive systematic discovery",
    discovery_stats: {
      organizations_found: finalOrgs.length,
      new_organizations_this_session: totalNewOrgs.length,
      strategies_completed: 6,
      total_patterns_tested: shortWords.length + abbreviations.length + 100 + nature.length + materials.length + mythSpace.length
    },
    organizations
  };

  console.log(`\n🎉 ULTRA-DISCOVERY RESULTS:`);
  console.log(`   Total organizations: ${finalOrgs.length}`);
  console.log(`   New organizations found: ${totalNewOrgs.length}`);
  console.log(`\n🆕 All New Organizations This Session:`);
  totalNewOrgs.forEach((org, i) => console.log(`   ${i + 1}. ${org}`));

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
🔍 Ultra-Aggressive Algora Organization Discovery

USAGE:
  deno run --allow-all scripts/ultra-discovery.ts [OPTIONS]

OPTIONS:
  --save           Save results to organizations.json
  --output FILE    Output file (default: data/organizations.json)
  --dry-run        Show results without saving
  --help, -h       Show this help

Ultra-aggressive systematic search using dictionary words, abbreviations,
numbers, nature terms, colors, materials, and mythology.
`);
    Deno.exit(0);
  }

  const result = await ultraDiscovery();

  if (args.save || !args["dry-run"]) {
    const outputFile = args.output || "data/organizations.json";
    await Deno.writeTextFile(outputFile, JSON.stringify(result, null, 2));
    console.log(`\n✅ Saved ${result.organizations.length} organizations to ${outputFile}`);
  }

  console.log(`\n🏁 Ultra-discovery complete! Total: ${result.organizations.length} organizations.`);

  if (result.organizations.length >= 109) {
    console.log("🎉 SUCCESS: Reached target of 109+ organizations!");
  } else {
    console.log(`📊 Progress: ${result.organizations.length}/109 organizations (${109 - result.organizations.length} remaining)`);
  }
}

if (import.meta.main) {
  await main();
}