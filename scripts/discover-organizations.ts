#!/usr/bin/env -S deno run --allow-all

/**
 * Algora Organization Discovery Script
 *
 * Discovers all active organizations on the Algora platform by:
 * 1. Scraping the main Algora organizations directory
 * 2. Following organization links to validate bounty pages
 * 3. Categorizing organizations by activity level
 * 4. Updating the master organizations.json file
 */

import { UnifiedFirecrawlScraper } from "../src/scrapers/unified-firecrawl-scraper.ts";
import { OrganizationConfig } from "../src/types/bounty.ts";
import { parseArgs } from "@std/cli/parse_args.ts";

interface DiscoveryConfig {
  maxConcurrent: number;
  rateLimitDelay: number;
  outputFile: string;
  enableValidation: boolean;
  minBountyCount: number;
}

interface DiscoveredOrg {
  handle: string;
  display_name: string;
  url: string;
  bounty_count: number;
  active: boolean;
  validated: boolean;
  description?: string;
  github_handle?: string;
  discovery_method: string;
}

class OrganizationDiscovery {
  private config: DiscoveryConfig;
  private scraper: UnifiedFirecrawlScraper;
  private discovered: Map<string, DiscoveredOrg> = new Map();

  constructor(config: Partial<DiscoveryConfig> = {}) {
    this.config = {
      maxConcurrent: 1,
      rateLimitDelay: 5000,
      outputFile: "data/organizations.json",
      enableValidation: true,
      minBountyCount: 0,
      ...config
    };

    this.scraper = new UnifiedFirecrawlScraper({
      preferSelfHosted: false,
      enableFallback: true,
      requestTimeout: 30000,
      retryAttempts: 3,
      maxConcurrent: this.config.maxConcurrent,
      rateLimitDelay: this.config.rateLimitDelay,
    });
  }

  /**
   * Main discovery method - tries multiple strategies
   */
  async discover(): Promise<DiscoveredOrg[]> {
    console.log("🔍 Starting Algora organization discovery...");

    // Strategy 1: Scrape known organization pages to find patterns
    await this.discoverFromKnownOrgs();

    // Strategy 2: Try common organization name patterns
    await this.discoverFromPatterns();

    // Strategy 3: Search for organizations in bounty listings
    await this.discoverFromBountyListings();

    // Strategy 4: Manual discovery of well-known projects
    await this.discoverWellKnownProjects();

    // Validate discovered organizations
    if (this.config.enableValidation) {
      await this.validateDiscoveredOrgs();
    }

    return Array.from(this.discovered.values());
  }

  /**
   * Load existing organizations and analyze their patterns
   */
  private async discoverFromKnownOrgs(): Promise<void> {
    console.log("📋 Loading existing organizations...");

    try {
      const existing = await Deno.readTextFile(this.config.outputFile);
      const data = JSON.parse(existing);

      for (const org of data.organizations || []) {
        this.discovered.set(org.handle, {
          handle: org.handle,
          display_name: org.display_name,
          url: org.url,
          bounty_count: 0,
          active: org.active,
          validated: false,
          description: org.description,
          discovery_method: "existing"
        });
      }

      console.log(`✅ Loaded ${this.discovered.size} existing organizations`);
    } catch {
      console.log("ℹ️  No existing organizations file found");
    }
  }

  /**
   * Try common patterns and well-known project names
   */
  private async discoverFromPatterns(): Promise<void> {
    console.log("🎯 Discovering organizations from common patterns...");

    const patterns = [
      // Popular frameworks and tools
      "next", "nextjs", "vercel", "react", "vue", "nuxt", "svelte",
      "angular", "ember", "solid", "remix", "gatsby",

      // Backend frameworks
      "express", "fastify", "koa", "nestjs", "strapi",
      "rails", "django", "flask", "spring", "laravel",

      // Databases and infrastructure
      "postgres", "mongodb", "redis", "elastic", "supabase",
      "planetscale", "neon", "cockroach", "dgraph", "hasura",

      // DevOps and cloud
      "docker", "kubernetes", "helm", "terraform", "pulumi",
      "netlify", "railway", "fly", "render", "deno",

      // Popular open source projects
      "vscode", "obsidian", "notion", "linear", "github",
      "gitlab", "bitbucket", "slack", "discord", "telegram",

      // Blockchain and crypto
      "ethereum", "solana", "polygon", "avalanche", "cosmos",
      "near", "algorand", "chainlink", "uniswap", "compound",

      // AI and ML
      "openai", "anthropic", "huggingface", "langchain",
      "tensorflow", "pytorch", "keras", "scikit",

      // Game engines and development
      "unity", "unreal", "godot", "babylon", "three",
      "phaser", "pixi", "matter", "cannon",

      // Security and privacy
      "tor", "signal", "proton", "bitwarden", "keepass",
      "owasp", "metasploit", "nmap", "wireshark"
    ];

    const chunkSize = 5;
    const chunks = this.chunkArray(patterns, chunkSize);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`🔍 Processing pattern chunk ${i + 1}/${chunks.length} (${chunk.length} patterns)`);

      const promises = chunk.map(pattern => this.checkPattern(pattern));
      await Promise.allSettled(promises);

      // Rate limiting between chunks
      if (i < chunks.length - 1) {
        await this.delay(this.config.rateLimitDelay);
      }
    }
  }

  /**
   * Search Algora's main bounty listings for organization links
   */
  private async discoverFromBountyListings(): Promise<void> {
    console.log("📄 Scraping main Algora bounty listings...");

    const mainPages = [
      "https://algora.io/bounties",
      "https://algora.io/bounties?status=open",
      "https://algora.io/bounties?status=completed",
      "https://algora.io/leaderboard"
    ];

    for (const url of mainPages) {
      try {
        console.log(`🌐 Scraping ${url}...`);
        const result = await this.scraper.scrapeUrl(url);

        if (result.success && result.content) {
          this.extractOrgsFromContent(result.content, url);
        }

        await this.delay(this.config.rateLimitDelay);
      } catch (error) {
        console.log(`❌ Failed to scrape ${url}: ${error.message}`);
      }
    }
  }

  /**
   * Add well-known projects that likely have Algora organizations
   */
  private async discoverWellKnownProjects(): Promise<void> {
    console.log("⭐ Adding well-known projects...");

    const wellKnown = [
      { handle: "microsoft", name: "Microsoft", desc: "Technology company" },
      { handle: "google", name: "Google", desc: "Technology company" },
      { handle: "facebook", name: "Meta", desc: "Social media company" },
      { handle: "apple", name: "Apple", desc: "Technology company" },
      { handle: "amazon", name: "Amazon", desc: "Cloud and e-commerce" },
      { handle: "netflix", name: "Netflix", desc: "Streaming platform" },
      { handle: "spotify", name: "Spotify", desc: "Music streaming" },
      { handle: "uber", name: "Uber", desc: "Transportation company" },
      { handle: "airbnb", name: "Airbnb", desc: "Hospitality platform" },
      { handle: "stripe", name: "Stripe", desc: "Payment processing" },
      { handle: "cloudflare", name: "Cloudflare", desc: "Web infrastructure" },
      { handle: "shopify", name: "Shopify", desc: "E-commerce platform" },
      { handle: "figma", name: "Figma", desc: "Design platform" },
      { handle: "notion", name: "Notion", desc: "Productivity platform" },
      { handle: "discord", name: "Discord", desc: "Communication platform" },
      { handle: "twitter", name: "Twitter/X", desc: "Social media platform" },
      { handle: "reddit", name: "Reddit", desc: "Social news platform" },
      { handle: "ethereum", name: "Ethereum", desc: "Blockchain platform" },
      { handle: "polygon", name: "Polygon", desc: "Blockchain scaling" },
      { handle: "solana", name: "Solana", desc: "Blockchain platform" }
    ];

    const chunkSize = 3;
    const chunks = this.chunkArray(wellKnown, chunkSize);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`🔍 Processing well-known chunk ${i + 1}/${chunks.length} (${chunk.length} projects)`);

      const promises = chunk.map(proj =>
        this.checkOrganization(proj.handle, proj.name, proj.desc, "well-known")
      );
      await Promise.allSettled(promises);

      if (i < chunks.length - 1) {
        await this.delay(this.config.rateLimitDelay);
      }
    }
  }

  /**
   * Check if a pattern exists as an Algora organization
   */
  private async checkPattern(pattern: string): Promise<void> {
    return this.checkOrganization(pattern, pattern, undefined, "pattern-matching");
  }

  /**
   * Check if an organization exists on Algora
   */
  private async checkOrganization(handle: string, displayName: string, description: string | undefined, method: string): Promise<void> {
    if (this.discovered.has(handle)) {
      return; // Already discovered
    }

    const url = `https://algora.io/${handle}/bounties?status=open`;

    try {
      console.log(`🔍 Checking ${handle}...`);
      const result = await this.scraper.scrapeUrl(url);

      if (result.success && result.content) {
        // Check if this looks like a valid organization page
        const isValid = this.validateOrgPage(result.content);

        if (isValid) {
          const bountyCount = this.extractBountyCount(result.content);

          this.discovered.set(handle, {
            handle,
            display_name: displayName || this.extractDisplayName(result.content) || handle,
            url,
            bounty_count: bountyCount,
            active: bountyCount > 0,
            validated: true,
            description,
            discovery_method: method
          });

          console.log(`✅ Found: ${handle} (${bountyCount} bounties)`);
        }
      }
    } catch (error) {
      // Silently continue - most patterns won't exist
      if (error.message.includes("RATE_LIMITED")) {
        console.log(`⏱️  Rate limited on ${handle}, will retry later`);
      }
    }
  }

  /**
   * Extract organization handles from scraped content
   */
  private extractOrgsFromContent(content: string, source: string): void {
    // Look for algora.io organization URLs
    const orgRegex = /algora\.io\/([a-zA-Z0-9-_]+)\/bounties/g;
    const matches = content.matchAll(orgRegex);

    for (const match of matches) {
      const handle = match[1];
      if (!this.discovered.has(handle) && handle !== "bounties") {
        // Add to discovery queue
        this.checkOrganization(handle, handle, undefined, `scraped-from-${source}`);
      }
    }
  }

  /**
   * Validate that scraped content looks like an organization page
   */
  private validateOrgPage(content: string): boolean {
    // Look for indicators that this is a valid org page
    const indicators = [
      "bounties", "bounty", "reward", "task", "open", "completed",
      "GitHub", "repository", "issue", "pull request"
    ];

    const lowerContent = content.toLowerCase();
    const foundIndicators = indicators.filter(indicator =>
      lowerContent.includes(indicator.toLowerCase())
    );

    // Need at least 3 indicators to consider valid
    return foundIndicators.length >= 3;
  }

  /**
   * Extract bounty count from page content
   */
  private extractBountyCount(content: string): number {
    // Try to find bounty count indicators
    const countPatterns = [
      /(\d+)\s*bounties?/i,
      /(\d+)\s*open/i,
      /(\d+)\s*active/i,
      /(\d+)\s*tasks?/i
    ];

    for (const pattern of countPatterns) {
      const match = content.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return 0;
  }

  /**
   * Extract display name from page content
   */
  private extractDisplayName(content: string): string | null {
    // Look for organization name in title or header
    const namePatterns = [
      /<title>([^-]+)/i,
      /<h1[^>]*>([^<]+)/i,
      /organization:\s*([^\n]+)/i
    ];

    for (const pattern of namePatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Validate discovered organizations by checking their bounty pages
   */
  private async validateDiscoveredOrgs(): Promise<void> {
    const unvalidated = Array.from(this.discovered.values()).filter(org => !org.validated);

    if (unvalidated.length === 0) return;

    console.log(`🔍 Validating ${unvalidated.length} discovered organizations...`);

    const chunkSize = 3;
    const chunks = this.chunkArray(unvalidated, chunkSize);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`✅ Validating chunk ${i + 1}/${chunks.length} (${chunk.length} orgs)`);

      const promises = chunk.map(org => this.validateOrg(org));
      await Promise.allSettled(promises);

      if (i < chunks.length - 1) {
        await this.delay(this.config.rateLimitDelay);
      }
    }
  }

  /**
   * Validate a single organization
   */
  private async validateOrg(org: DiscoveredOrg): Promise<void> {
    try {
      const result = await this.scraper.scrapeUrl(org.url);

      if (result.success && result.content) {
        const isValid = this.validateOrgPage(result.content);
        const bountyCount = this.extractBountyCount(result.content);

        org.validated = true;
        org.active = isValid && bountyCount >= this.config.minBountyCount;
        org.bounty_count = bountyCount;

        if (!org.display_name || org.display_name === org.handle) {
          const extractedName = this.extractDisplayName(result.content);
          if (extractedName) {
            org.display_name = extractedName;
          }
        }

        console.log(`✅ ${org.handle}: ${org.active ? 'ACTIVE' : 'INACTIVE'} (${bountyCount} bounties)`);
      } else {
        org.validated = false;
        org.active = false;
        console.log(`❌ ${org.handle}: INVALID`);
      }
    } catch (error) {
      org.validated = false;
      org.active = false;
      console.log(`❌ ${org.handle}: ERROR - ${error.message}`);
    }
  }

  /**
   * Categorize organizations by activity tier
   */
  private categorizeOrganizations(orgs: DiscoveredOrg[]): OrganizationConfig[] {
    return orgs
      .filter(org => org.active && org.validated)
      .map(org => {
        let tier: "highly-active" | "active" | "emerging" | "platform";
        let scrapeInterval: number;

        if (org.bounty_count >= 10) {
          tier = "highly-active";
          scrapeInterval = 900; // 15 minutes
        } else if (org.bounty_count >= 5) {
          tier = "active";
          scrapeInterval = 1800; // 30 minutes
        } else if (org.bounty_count >= 1) {
          tier = "emerging";
          scrapeInterval = 3600; // 1 hour
        } else {
          tier = "platform";
          scrapeInterval = 7200; // 2 hours
        }

        return {
          handle: org.handle,
          display_name: org.display_name,
          url: org.url,
          active: true,
          scrape_interval: scrapeInterval,
          tier,
          description: org.description,
          firecrawl_enabled: true
        };
      })
      .sort((a, b) => b.tier.localeCompare(a.tier) || a.handle.localeCompare(b.handle));
  }

  /**
   * Save discovered organizations to file
   */
  async saveDiscoveredOrgs(orgs: DiscoveredOrg[]): Promise<void> {
    const activeOrgs = this.categorizeOrganizations(orgs);
    const totalDiscovered = orgs.length;
    const activeCount = activeOrgs.length;
    const inactiveCount = totalDiscovered - activeCount;

    const output = {
      updated_at: new Date().toISOString(),
      version: "3.0.0",
      total_organizations: activeCount,
      discovery_stats: {
        total_discovered: totalDiscovered,
        active_organizations: activeCount,
        inactive_organizations: inactiveCount,
        discovery_methods: this.getDiscoveryStats(orgs)
      },
      organizations: activeOrgs
    };

    await Deno.writeTextFile(this.config.outputFile, JSON.stringify(output, null, 2));

    console.log(`\n📊 Discovery Summary:`);
    console.log(`   Total discovered: ${totalDiscovered}`);
    console.log(`   Active orgs: ${activeCount}`);
    console.log(`   Inactive orgs: ${inactiveCount}`);
    console.log(`   Highly active: ${activeOrgs.filter(o => o.tier === "highly-active").length}`);
    console.log(`   Active: ${activeOrgs.filter(o => o.tier === "active").length}`);
    console.log(`   Emerging: ${activeOrgs.filter(o => o.tier === "emerging").length}`);
    console.log(`   Platform: ${activeOrgs.filter(o => o.tier === "platform").length}`);
    console.log(`\n✅ Saved to ${this.config.outputFile}`);
  }

  /**
   * Get statistics on discovery methods
   */
  private getDiscoveryStats(orgs: DiscoveredOrg[]): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const org of orgs) {
      stats[org.discovery_method] = (stats[org.discovery_method] || 0) + 1;
    }

    return stats;
  }

  /**
   * Utility functions
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "no-validation", "dry-run"],
    string: ["output", "min-bounties", "concurrent", "delay"],
    alias: {
      h: "help",
      o: "output",
      c: "concurrent",
      d: "delay"
    },
  });

  if (args.help) {
    console.log(`
🔍 Algora Organization Discovery

USAGE:
  deno run --allow-all scripts/discover-organizations.ts [OPTIONS]

OPTIONS:
  --no-validation       Skip validation of discovered organizations
  --dry-run            Show what would be discovered without saving
  --output FILE        Output file (default: data/organizations.json)
  --min-bounties N     Minimum bounties to consider active (default: 0)
  --concurrent N       Max concurrent requests (default: 1)
  --delay MS          Delay between requests (default: 5000)
  --help, -h          Show this help message

EXAMPLES:
  # Full discovery with validation
  deno run --allow-all scripts/discover-organizations.ts

  # Fast discovery without validation
  deno run --allow-all scripts/discover-organizations.ts --no-validation --concurrent 3

  # Dry run to see what would be found
  deno run --allow-all scripts/discover-organizations.ts --dry-run
`);
    Deno.exit(0);
  }

  const config: Partial<DiscoveryConfig> = {
    enableValidation: !args["no-validation"],
    outputFile: args.output || "data/organizations.json",
    minBountyCount: parseInt(args["min-bounties"] || "0", 10),
    maxConcurrent: parseInt(args.concurrent || "1", 10),
    rateLimitDelay: parseInt(args.delay || "5000", 10),
  };

  const discovery = new OrganizationDiscovery(config);
  const discovered = await discovery.discover();

  if (args["dry-run"]) {
    console.log("\n🔍 DRY RUN - Discovered organizations:");
    for (const org of discovered) {
      console.log(`  ${org.handle}: ${org.active ? 'ACTIVE' : 'INACTIVE'} (${org.bounty_count} bounties) [${org.discovery_method}]`);
    }
    console.log(`\nTotal: ${discovered.length} organizations`);
  } else {
    await discovery.saveDiscoveredOrgs(discovered);
  }
}

if (import.meta.main) {
  await main();
}