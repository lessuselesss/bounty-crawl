#!/usr/bin/env -S deno run --allow-all

/**
 * Aggressive Organization Discovery
 *
 * Last-ditch effort using:
 * 1. Systematic brute force search
 * 2. GitHub API cross-referencing
 * 3. Common word/company name testing
 * 4. Alphabet + number combinations
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

async function aggressiveDiscovery() {
  console.log("🚀 Aggressive discovery to find remaining ~33 organizations...");

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

  const newOrgs = [];

  // Strategy 1: Common company/project names we might have missed
  console.log("\n🔍 Strategy 1: Testing common company names...");
  const companyNames = [
    // More crypto projects
    "avalanche", "arbitrum", "optimism", "base", "scroll", "polygon", "matic",
    "starkware", "matter-labs", "zksync", "immutable", "dydx", "1inch",
    "paraswap", "opensea", "blur", "looksrare", "superrare", "foundation",
    "async-art", "rarible", "makerdao", "maker", "compound", "aave",
    "yearn", "curve", "convex", "frax", "olympus", "ohm", "fei",

    // Major tech companies
    "microsoft", "apple", "amazon", "netflix", "uber", "airbnb",
    "spotify", "discord", "twitter", "x", "reddit", "pinterest",
    "snapchat", "tiktok", "instagram", "whatsapp", "telegram",

    // Developer tools
    "postman", "insomnia", "paw", "rapidapi", "swagger", "postwoman",
    "hoppscotch", "httpie", "curl", "wget", "bruno", "kreya",

    // Cloud providers
    "aws", "azure", "gcp", "digitalocean", "vultr", "hetzner",
    "ovh", "scaleway", "linode", "rackspace", "ibm", "oracle",

    // Databases
    "mongodb", "redis", "postgresql", "mysql", "sqlite", "cassandra",
    "neo4j", "dgraph", "arangodb", "orientdb", "rethinkdb", "couchdb",

    // Message queues
    "kafka", "rabbitmq", "redis", "nats", "pulsar", "activemq",
    "zeromq", "nsq", "beanstalkd", "celery", "sidekiq",

    // Monitoring
    "datadog", "newrelic", "dynatrace", "appdynamics", "splunk",
    "sumologic", "loggly", "papertrail", "sentry", "rollbar",
    "bugsnag", "raygun", "honeybadger", "airbrake",

    // More blockchain platforms
    "near", "cosmos", "terra", "luna", "fantom", "harmony", "celo",
    "tezos", "cardano", "polkadot", "kusama", "chainlink", "uniswap",

    // Gaming
    "unity", "unreal", "godot", "construct", "gamemaker", "defold",
    "love2d", "panda3d", "threejs", "babylonjs", "playcanvas",

    // More dev tools
    "jetbrains", "intellij", "webstorm", "pycharm", "phpstorm",
    "rubymine", "clion", "goland", "datagrip", "rider", "appcode",

    // Content management
    "wordpress", "drupal", "joomla", "magento", "prestashop",
    "opencart", "woocommerce", "bigcommerce", "squarespace", "wix",

    // Communication
    "slack", "teams", "zoom", "meet", "webex", "gotomeeting",
    "jitsi", "whereby", "8x8", "ringcentral", "twilio", "sendgrid",

    // Design tools
    "figma", "sketch", "adobe", "canva", "framer", "principle",
    "invision", "miro", "figjam", "whimsical", "lucidchart",

    // Project management
    "jira", "trello", "asana", "monday", "clickup", "basecamp",
    "wrike", "smartsheet", "airtable", "coda", "workflowy",

    // Version control hosting
    "github", "gitlab", "bitbucket", "codeberg", "sourceforge",
    "launchpad", "gitea", "forgejo", "fossil", "bazaar",

    // Package managers
    "npm", "yarn", "pnpm", "pip", "conda", "homebrew", "chocolatey",
    "apt", "yum", "pacman", "portage", "pkgsrc", "vcpkg", "conan",

    // Build tools
    "webpack", "vite", "rollup", "parcel", "esbuild", "swc",
    "babel", "typescript", "flow", "prettier", "eslint", "rome",

    // Testing frameworks
    "jest", "mocha", "jasmine", "karma", "protractor", "webdriver",
    "selenium", "puppeteer", "playwright", "cypress", "testcafe",

    // More individual companies
    "shopify", "etsy", "ebay", "paypal", "square", "adyen",
    "klarna", "afterpay", "affirm", "zip", "sezzle", "quadpay"
  ];

  // Test company names in batches
  const batchSize = 5;
  for (let i = 0; i < companyNames.length; i += batchSize) {
    const batch = companyNames.slice(i, i + batchSize);
    console.log(`📋 Testing company batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(companyNames.length/batchSize)}`);

    const promises = batch.map(async name => {
      if (!allOrgs.has(name)) {
        const isValid = await testOrg(name);
        if (isValid) {
          allOrgs.add(name);
          newOrgs.push(name);
          console.log(`✅ Found: ${name}`);
          return true;
        }
      }
      return false;
    });

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Strategy 2: Common project suffixes/prefixes
  console.log("\n🔍 Strategy 2: Testing with common suffixes/prefixes...");
  const bases = ["ai", "dev", "labs", "io", "tech", "app", "co", "inc", "org", "foundation", "project"];
  const prefixes = ["open", "free", "the", "my", "get", "use", "try", "go", "web", "api"];
  const suffixes = ["js", "ts", "py", "go", "rs", "dev", "app", "tool", "kit", "lib", "ui", "db", "api", "cli", "gui"];

  const combinations = [];

  // Create combinations
  for (const base of bases) {
    for (const prefix of prefixes) {
      combinations.push(`${prefix}${base}`);
      combinations.push(`${prefix}-${base}`);
    }
    for (const suffix of suffixes) {
      combinations.push(`${base}${suffix}`);
      combinations.push(`${base}-${suffix}`);
    }
  }

  // Test combinations
  for (let i = 0; i < Math.min(combinations.length, 100); i += batchSize) {
    const batch = combinations.slice(i, i + batchSize);
    console.log(`📋 Testing combination batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(Math.min(combinations.length, 100)/batchSize)}`);

    const promises = batch.map(async combo => {
      if (!allOrgs.has(combo)) {
        const isValid = await testOrg(combo);
        if (isValid) {
          allOrgs.add(combo);
          newOrgs.push(combo);
          console.log(`✅ Found: ${combo}`);
          return true;
        }
      }
      return false;
    });

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Strategy 3: Single letter + numbers (common for GitHub orgs)
  console.log("\n🔍 Strategy 3: Testing letter + number combinations...");
  const letterNumbers = [];

  // Single letters
  for (let i = 97; i <= 122; i++) {
    const letter = String.fromCharCode(i);
    letterNumbers.push(letter);
  }

  // Letter + number combinations
  for (let letter = 97; letter <= 122; letter++) {
    for (let num = 0; num <= 99; num++) {
      const combo = String.fromCharCode(letter) + num;
      letterNumbers.push(combo);
      if (letterNumbers.length > 200) break; // Limit to avoid rate limits
    }
    if (letterNumbers.length > 200) break;
  }

  // Test letter+number combos
  for (let i = 0; i < Math.min(letterNumbers.length, 100); i += batchSize) {
    const batch = letterNumbers.slice(i, i + batchSize);
    console.log(`📋 Testing letter-number batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(Math.min(letterNumbers.length, 100)/batchSize)}`);

    const promises = batch.map(async combo => {
      if (!allOrgs.has(combo)) {
        const isValid = await testOrg(combo);
        if (isValid) {
          allOrgs.add(combo);
          newOrgs.push(combo);
          console.log(`✅ Found: ${combo}`);
          return true;
        }
      }
      return false;
    });

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Strategy 4: Common developer usernames and handles
  console.log("\n🔍 Strategy 4: Testing common developer handles...");
  const devHandles = [
    // Common developer prefixes
    "dev", "code", "build", "deploy", "test", "debug", "fix", "hack",
    "git", "repo", "commit", "push", "pull", "merge", "branch", "tag",

    // Programming language communities
    "rust-lang", "golang", "python", "javascript", "typescript", "java",
    "kotlin", "swift", "dart", "php", "ruby", "scala", "clojure",
    "haskell", "elm", "purescript", "reason", "ocaml", "fsharp",

    // Framework communities
    "reactjs", "vuejs", "angular", "svelte", "solidjs", "qwik",
    "astro", "fresh", "remix", "nextjs", "nuxtjs", "sveltekit",

    // Tool communities
    "docker", "kubernetes", "terraform", "ansible", "jenkins",
    "github-actions", "gitlab-ci", "circleci", "travis-ci",

    // Database communities
    "postgres", "mysql", "mongodb", "redis", "elasticsearch",

    // Cloud communities
    "aws", "gcp", "azure", "cloudflare", "vercel", "netlify",

    // Blockchain communities
    "ethereum", "bitcoin", "web3", "defi", "nft", "dao",

    // Common org patterns
    "team", "crew", "squad", "group", "collective", "alliance",
    "guild", "society", "community", "network", "hub", "lab",
    "studio", "workshop", "garage", "space", "place", "works"
  ];

  // Test dev handles
  for (let i = 0; i < Math.min(devHandles.length, 80); i += batchSize) {
    const batch = devHandles.slice(i, i + batchSize);
    console.log(`📋 Testing dev handle batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(Math.min(devHandles.length, 80)/batchSize)}`);

    const promises = batch.map(async handle => {
      if (!allOrgs.has(handle)) {
        const isValid = await testOrg(handle);
        if (isValid) {
          allOrgs.add(handle);
          newOrgs.push(handle);
          console.log(`✅ Found: ${handle}`);
          return true;
        }
      }
      return false;
    });

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Final validation of all new orgs
  console.log("\n🔍 Final validation of discovered organizations...");
  const validatedOrgs = [];

  for (const org of Array.from(allOrgs)) {
    const isValid = await testOrg(org);
    if (isValid) {
      validatedOrgs.push(org);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Generate output
  const organizations = validatedOrgs
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
    version: "4.0.0",
    total_organizations: organizations.length,
    discovery_method: "Aggressive multi-strategy discovery",
    discovery_stats: {
      organizations_found: validatedOrgs.length,
      new_organizations_discovered: newOrgs.length,
      strategies_used: [
        "Company name testing",
        "Prefix/suffix combinations",
        "Letter + number patterns",
        "Developer handle testing"
      ]
    },
    organizations
  };

  console.log(`\n🎉 AGGRESSIVE DISCOVERY RESULTS:`);
  console.log(`   Total organizations: ${validatedOrgs.length}`);
  console.log(`   New organizations found this session: ${newOrgs.length}`);
  console.log(`\n🆕 New Organizations Discovered:`);
  newOrgs.forEach((org, i) => console.log(`   ${i + 1}. ${org}`));

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
🔍 Aggressive Algora Organization Discovery

USAGE:
  deno run --allow-all scripts/aggressive-discovery.ts [OPTIONS]

OPTIONS:
  --save           Save results to organizations.json
  --output FILE    Output file (default: data/organizations.json)
  --dry-run        Show results without saving
  --help, -h       Show this help

Aggressive multi-strategy search to find remaining organizations.
`);
    Deno.exit(0);
  }

  const result = await aggressiveDiscovery();

  if (args.save || !args["dry-run"]) {
    const outputFile = args.output || "data/organizations.json";
    await Deno.writeTextFile(outputFile, JSON.stringify(result, null, 2));
    console.log(`\n✅ Saved ${result.organizations.length} organizations to ${outputFile}`);
  }

  console.log(`\n🏁 Aggressive discovery complete! Total: ${result.organizations.length} organizations.`);

  if (result.organizations.length >= 100) {
    console.log("🎉 SUCCESS: Reached 100+ organizations!");
  } else {
    console.log(`📊 Progress: ${result.organizations.length}/109 organizations (${109 - result.organizations.length} remaining)`);
  }
}

if (import.meta.main) {
  await main();
}