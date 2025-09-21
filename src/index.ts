#!/usr/bin/env deno run --allow-all

/**
 * Algora Bounty Scraper
 * Continuously monitors Algora organization bounty pages and maintains a live index
 */

import { parseArgs } from "@std/cli/parse_args.ts";
import type { BountyIndex, OrganizationList, ScraperConfig } from "./types.ts";
import { AlgoraScraper } from "./scrapers/algora-scraper.ts";
import { ChangeDetector } from "./scrapers/change-detector.ts";
import { Logger } from "./utils/logging.ts";
import { generateStats } from "./utils/stats.ts";

const VERSION = "1.0.0";

class BountyScraper {
  private logger: Logger;
  private scraper: AlgoraScraper;
  private changeDetector: ChangeDetector;
  private config: ScraperConfig;

  constructor(config: ScraperConfig) {
    this.logger = Logger.createDailyLogger("BountyScraper");
    this.config = config;
    this.scraper = new AlgoraScraper({
      userAgent: config.user_agent,
      rateLimitMs: config.rate_limit_ms,
      timeoutMs: config.timeout_ms,
      maxRetries: config.max_retries,
    });
    this.changeDetector = new ChangeDetector();
  }

  async run(): Promise<void> {
    this.logger.info(`🕷️  Starting Algora Bounty Scraper v${VERSION}`);

    try {
      // Load organizations
      const organizations = await this.loadOrganizations();
      this.logger.info(`Loaded ${organizations.organizations.length} organizations to scrape`);

      // Scrape all organizations
      const startTime = Date.now();
      const results = await this.scrapeAllOrganizations(organizations.organizations);
      const scrapeDuration = Date.now() - startTime;

      // Generate bounty index
      const bountyIndex = await this.generateBountyIndex(results, scrapeDuration);

      // Detect changes
      if (this.config.enable_change_detection) {
        const changes = await this.changeDetector.detectChanges(bountyIndex);

        if (changes.has_changes) {
          this.logger.info(`Changes detected: ${changes.summary}`);

          // Save the new index
          await this.saveBountyIndex(bountyIndex);

          // Archive if enabled
          if (this.config.enable_archiving) {
            await this.changeDetector.archiveIndex(bountyIndex);
          }

          // Commit changes if in CI mode
          if (this.config.github_integration.enabled && this.config.github_integration.auto_commit) {
            await this.commitChanges(changes.summary);
          }
        } else {
          this.logger.info("No changes detected, skipping update");
        }
      } else {
        // Always save if change detection is disabled
        await this.saveBountyIndex(bountyIndex);
      }

      this.logger.info("✅ Scraping completed successfully", {
        totalOrganizations: bountyIndex.total_organizations,
        totalBounties: bountyIndex.total_bounties,
        totalValue: bountyIndex.total_value_usd,
        duration: scrapeDuration,
      });

    } catch (error) {
      this.logger.error(`❌ Scraping failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async loadOrganizations(): Promise<OrganizationList> {
    try {
      const content = await Deno.readTextFile("data/organizations.json");
      return JSON.parse(content) as OrganizationList;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        this.logger.warn("Organizations file not found, using default list");
        return this.createDefaultOrganizationList();
      }
      throw error;
    }
  }

  private createDefaultOrganizationList(): OrganizationList {
    // Known organizations from our research
    const knownOrgs = [
      "ZIO", "cal", "calcom", "twenty", "twentyhq", "activepieces", "tscircuit",
      "projectdiscovery", "triggerdotdev", "highlight", "remotion", "remotion-dev",
      "documenso", "coollabsio", "traceloop", "algora-io", "mudlet"
    ];

    return {
      updated_at: new Date().toISOString(),
      version: "1.0.0",
      organizations: knownOrgs.map(handle => ({
        handle,
        display_name: handle,
        url: `https://algora.io/${handle}/bounties?status=open`,
        active: true,
        scrape_interval: 900, // 15 minutes
      })),
    };
  }

  private async scrapeAllOrganizations(organizations: OrganizationList["organizations"]) {
    const activeOrgs = organizations.filter(org => org.active);
    this.logger.info(`Scraping ${activeOrgs.length} active organizations`);

    const results = [];
    const parallelLimit = this.config.parallel_limit;

    // Process in batches to respect rate limits
    for (let i = 0; i < activeOrgs.length; i += parallelLimit) {
      const batch = activeOrgs.slice(i, i + parallelLimit);
      this.logger.debug(`Processing batch ${Math.floor(i / parallelLimit) + 1}: ${batch.map(o => o.handle).join(", ")}`);

      const batchPromises = batch.map(org => this.scraper.scrapeOrganization(org));
      const batchResults = await Promise.all(batchPromises);

      results.push(...batchResults);

      // Rate limit between batches
      if (i + parallelLimit < activeOrgs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  private async generateBountyIndex(results: Awaited<ReturnType<AlgoraScraper["scrapeOrganization"]>>[], scrapeDuration: number): Promise<BountyIndex> {
    const organizations: BountyIndex["organizations"] = {};
    let totalBounties = 0;
    let totalValue = 0;
    let successfulScrapes = 0;

    for (const result of results) {
      const orgData = {
        display_name: result.organization,
        url: `https://algora.io/${result.organization}/bounties?status=open`,
        bounty_count: result.bounties.length,
        total_value_usd: result.total_value_usd,
        last_updated: new Date().toISOString(),
        scrape_duration_ms: result.scrape_duration_ms,
        bounties: result.bounties,
      };

      if (result.success) {
        successfulScrapes++;
        totalBounties += result.bounties.length;
        totalValue += result.total_value_usd;
      } else {
        orgData.error = result.error;
      }

      organizations[result.organization] = orgData;
    }

    const stats = this.config.enable_stats ? generateStats(organizations) : {
      by_language: {},
      by_amount: {},
      by_difficulty: {},
      by_status: {},
      organizations_with_bounties: successfulScrapes,
      organizations_with_errors: results.length - successfulScrapes,
      average_bounty_value: totalBounties > 0 ? totalValue / totalBounties : 0,
      median_bounty_value: this.calculateMedianBountyValue(organizations),
    };

    return {
      generated_at: new Date().toISOString(),
      total_organizations: Object.keys(organizations).length,
      total_bounties: totalBounties,
      total_value_usd: totalValue,
      version: VERSION,
      organizations,
      stats,
      metadata: {
        scraper_version: VERSION,
        scrape_duration_ms: scrapeDuration,
        success_rate: successfulScrapes / results.length,
        last_full_scan: new Date().toISOString(),
      },
    };
  }

  private calculateMedianBountyValue(organizations: BountyIndex["organizations"]): number {
    const allValues: number[] = [];

    for (const org of Object.values(organizations)) {
      for (const bounty of org.bounties) {
        allValues.push(bounty.amount_usd);
      }
    }

    if (allValues.length === 0) return 0;

    allValues.sort((a, b) => a - b);
    const middle = Math.floor(allValues.length / 2);

    if (allValues.length % 2 === 0) {
      return (allValues[middle - 1] + allValues[middle]) / 2;
    } else {
      return allValues[middle];
    }
  }

  private async saveBountyIndex(index: BountyIndex): Promise<void> {
    await Deno.mkdir("data", { recursive: true });
    await Deno.writeTextFile("data/bounty-index.json", JSON.stringify(index, null, 2));
    this.logger.info("Saved bounty index to data/bounty-index.json");
  }

  private async commitChanges(summary: string): Promise<void> {
    try {
      const commitMessage = this.config.github_integration.commit_message_template
        .replace("{summary}", summary)
        .replace("{timestamp}", new Date().toISOString());

      const gitCommands = [
        ["git", "add", "data/"],
        ["git", "commit", "-m", commitMessage],
        ["git", "push"],
      ];

      for (const command of gitCommands) {
        const process = new Deno.Command(command[0], {
          args: command.slice(1),
          stdout: "piped",
          stderr: "piped",
        });

        const result = await process.output();

        if (!result.success) {
          const error = new TextDecoder().decode(result.stderr);
          throw new Error(`Git command failed: ${command.join(" ")}\n${error}`);
        }
      }

      this.logger.info("Successfully committed and pushed changes to repository");

    } catch (error) {
      this.logger.error(`Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Load configuration
async function loadConfig(): Promise<ScraperConfig> {
  try {
    const content = await Deno.readTextFile("config/scraper-config.json");
    return JSON.parse(content) as ScraperConfig;
  } catch {
    // Return default configuration
    return {
      user_agent: "AlgoraBountyScraper/1.0 (+https://github.com/your-username/algora-bounty-scraper)",
      rate_limit_ms: 2000,
      timeout_ms: 30000,
      max_retries: 3,
      parallel_limit: 3,
      enable_change_detection: true,
      enable_archiving: true,
      archive_interval_hours: 24,
      enable_stats: true,
      github_integration: {
        enabled: true,
        auto_commit: true,
        commit_message_template: "🤖 Update bounty index - {summary} ({timestamp})",
      },
    };
  }
}

// Main entry point
async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "version", "ci", "no-commit"],
    string: ["config"],
    alias: {
      h: "help",
      v: "version",
      c: "config",
    },
  });

  if (args.help) {
    console.log(`
Algora Bounty Scraper v${VERSION}

Usage: deno run --allow-all src/index.ts [options]

Options:
  -h, --help          Show this help message
  -v, --version       Show version information
  --ci                Run in CI mode (auto-commit enabled)
  --no-commit         Disable auto-commit even if configured
  -c, --config FILE   Use custom configuration file

Examples:
  deno run --allow-all src/index.ts
  deno run --allow-all src/index.ts --ci
  deno run --allow-all src/index.ts --no-commit
    `);
    Deno.exit(0);
  }

  if (args.version) {
    console.log(`Algora Bounty Scraper v${VERSION}`);
    Deno.exit(0);
  }

  try {
    const config = await loadConfig();

    // Override config based on command line args
    if (args.ci) {
      config.github_integration.enabled = true;
      config.github_integration.auto_commit = true;
    }

    if (args["no-commit"]) {
      config.github_integration.auto_commit = false;
    }

    const scraper = new BountyScraper(config);
    await scraper.run();

  } catch (error) {
    console.error(`❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}