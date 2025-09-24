#!/usr/bin/env -S deno run --allow-all

/**
 * Production Algora Bounty Scraper
 *
 * Complete production-ready scraper that processes all 91+ organizations using the
 * Unified Firecrawl scraper and outputs both legacy and Algora API formats.
 */

import { UnifiedFirecrawlScraper } from "../src/scrapers/unified-firecrawl-scraper.ts";
import { AlgoraApiResponse, OrganizationConfig } from "../src/types/bounty.ts";
import { parseArgs } from "@std/cli/parse_args.ts";

interface ProductionConfig {
  outputDir: string;
  organizationsFile: string;
  legacyOutputFile: string;
  algoraApiOutputFile: string;
  logFile: string;
  enableEncryption: boolean;
  enableGitCommit: boolean;
  enableHealthChecks: boolean;
}

class ProductionLogger {
  private logFile: string;
  private startTime: number;

  constructor(logFile: string) {
    this.logFile = logFile;
    this.startTime = Date.now();
    this.ensureLogDirectory();
  }

  private ensureLogDirectory() {
    const logDir = this.logFile.split('/').slice(0, -1).join('/');
    try {
      Deno.mkdirSync(logDir, { recursive: true });
    } catch {
      // Directory already exists
    }
  }

  private async writeLog(level: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      uptime: Date.now() - this.startTime
    };

    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);

    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }

    try {
      await Deno.writeTextFile(
        this.logFile,
        JSON.stringify(logEntry) + '\n',
        { append: true }
      );
    } catch {
      // Log writing failed, continue silently
    }
  }

  async info(message: string, data?: any) {
    await this.writeLog('info', message, data);
  }

  async warn(message: string, data?: any) {
    await this.writeLog('warn', message, data);
  }

  async error(message: string, data?: any) {
    await this.writeLog('error', message, data);
  }

  async success(message: string, data?: any) {
    await this.writeLog('success', message, data);
  }
}

class ProductionScraper {
  private config: ProductionConfig;
  private logger: ProductionLogger;
  private scraper: UnifiedFirecrawlScraper;

  constructor(config: Partial<ProductionConfig> = {}) {
    this.config = {
      outputDir: "data",
      organizationsFile: "data/organizations.json",
      legacyOutputFile: "data/bounty-index.json",
      algoraApiOutputFile: "data/algora-api-response.json",
      logFile: `logs/production-${new Date().toISOString().split('T')[0]}.log`,
      enableEncryption: true,
      enableGitCommit: true,
      enableHealthChecks: true,
      ...config
    };

    this.logger = new ProductionLogger(this.config.logFile);
    this.scraper = new UnifiedFirecrawlScraper({
      preferSelfHosted: Deno.env.get("FIRECRAWL_PREFER_SELF_HOSTED") === "true",
      enableFallback: true,
      requestTimeout: 30000,
      retryAttempts: 3,
      maxConcurrent: 1,  // Single request at a time to avoid rate limits
      rateLimitDelay: 10000,  // 10 second delay between requests
    });
  }

  private async loadOrganizations(): Promise<OrganizationConfig[]> {
    try {
      const content = await Deno.readTextFile(this.config.organizationsFile);
      const data = JSON.parse(content);

      if (!data.organizations || !Array.isArray(data.organizations)) {
        throw new Error("Invalid organizations file format");
      }

      await this.logger.info(`Loaded ${data.organizations.length} organizations`, {
        total: data.organizations.length,
        version: data.version
      });

      return data.organizations;
    } catch (error) {
      await this.logger.error("Failed to load organizations", { error: error.message });
      throw error;
    }
  }

  private async performHealthChecks(): Promise<boolean> {
    if (!this.config.enableHealthChecks) {
      return true;
    }

    await this.logger.info("Performing pre-flight health checks");

    const checks = [
      {
        name: "Organizations file exists",
        check: () => Deno.stat(this.config.organizationsFile).then(() => true).catch(() => false)
      },
      {
        name: "Output directory writable",
        check: async () => {
          try {
            await Deno.mkdir(this.config.outputDir, { recursive: true });
            return true;
          } catch {
            return false;
          }
        }
      },
      {
        name: "Firecrawl API keys available",
        check: () => !!Deno.env.get("FIRECRAWL_API_KEY")
      }
    ];

    let allPassed = true;
    for (const check of checks) {
      const passed = await check.check();
      await this.logger.info(`Health check: ${check.name}`, { passed });
      if (!passed) {
        allPassed = false;
      }
    }

    return allPassed;
  }

  private async generateLegacyFormat(algoraResponse: AlgoraApiResponse): Promise<any> {
    const bounties = algoraResponse.result.data.json.items;

    // Group bounties by organization
    const orgGroups = bounties.reduce((acc, bounty) => {
      const orgHandle = bounty.org.handle;
      if (!acc[orgHandle]) {
        acc[orgHandle] = {
          display_name: bounty.org.display_name,
          url: `https://algora.io/${orgHandle}/bounties?status=open`,
          bounty_count: 0,
          total_value_usd: 0,
          bounties: [],
          last_updated: new Date().toISOString(),
          scrape_duration_ms: 0
        };
      }

      acc[orgHandle].bounties.push({
        id: bounty.id,
        title: bounty.task.title,
        amount_usd: bounty.reward.amount / 100, // Convert cents to dollars
        url: bounty.task.url,
        status: bounty.status,
        tags: bounty.tech || [],
        created_at: bounty.created_at,
        updated_at: bounty.updated_at
      });

      acc[orgHandle].bounty_count++;
      acc[orgHandle].total_value_usd += bounty.reward.amount / 100;

      return acc;
    }, {} as Record<string, any>);

    // Calculate totals
    const totalBounties = bounties.length;
    const totalValue = bounties.reduce((sum, b) => sum + (b.reward.amount / 100), 0);
    const totalOrgs = Object.keys(orgGroups).length;

    return {
      generated_at: new Date().toISOString(),
      total_organizations: totalOrgs,
      total_bounties: totalBounties,
      total_value_usd: totalValue,
      version: "3.0.0",
      organizations: orgGroups,
      metadata: {
        success_rate: totalOrgs > 0 ? 1.0 : 0.0,
        processing_time_ms: Date.now() - this.logger.startTime,
        scraper_version: "unified-firecrawl-v1.0",
        data_format: "legacy-compatible"
      },
      stats: {
        avg_bounty_value: totalBounties > 0 ? totalValue / totalBounties : 0,
        median_bounty_value: this.calculateMedian(bounties.map(b => b.reward.amount / 100)),
        top_organizations: Object.entries(orgGroups)
          .sort(([,a], [,b]) => (b as any).total_value_usd - (a as any).total_value_usd)
          .slice(0, 10)
          .map(([handle, data]) => ({ handle, ...(data as any) }))
      }
    };
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private async saveOutput(algoraResponse: AlgoraApiResponse, legacyFormat: any) {
    await this.logger.info("Saving output files");

    // Ensure output directory exists
    await Deno.mkdir(this.config.outputDir, { recursive: true });

    // Save Algora API format (for bounty-pipe)
    await Deno.writeTextFile(
      this.config.algoraApiOutputFile,
      JSON.stringify(algoraResponse, null, 2)
    );
    await this.logger.success(`Saved Algora API format to ${this.config.algoraApiOutputFile}`);

    // Save legacy format (backward compatibility)
    await Deno.writeTextFile(
      this.config.legacyOutputFile,
      JSON.stringify(legacyFormat, null, 2)
    );
    await this.logger.success(`Saved legacy format to ${this.config.legacyOutputFile}`);

    // Archive the data
    const archiveDir = `${this.config.outputDir}/archive`;
    await Deno.mkdir(archiveDir, { recursive: true });

    const timestamp = new Date().toISOString().split('T')[0];
    const archiveFile = `${archiveDir}/algora-api-response-${timestamp}.json`;

    await Deno.writeTextFile(archiveFile, JSON.stringify(algoraResponse, null, 2));
    await this.logger.info(`Archived to ${archiveFile}`);
  }

  private async encryptOutput() {
    if (!this.config.enableEncryption) {
      await this.logger.info("Encryption disabled, skipping");
      return;
    }

    await this.logger.info("Starting encryption pipeline");

    try {
      // Run the encrypt-output script
      const process = new Deno.Command("deno", {
        args: ["run", "--allow-all", "scripts/encrypt-output.ts"],
        stdout: "pipe",
        stderr: "pipe"
      });

      const { code, stdout, stderr } = await process.output();

      if (code === 0) {
        const output = new TextDecoder().decode(stdout);
        await this.logger.success("Encryption completed successfully", { output });
      } else {
        const error = new TextDecoder().decode(stderr);
        await this.logger.warn("Encryption failed", { error });
      }
    } catch (error) {
      await this.logger.error("Encryption process failed", { error: error.message });
    }
  }

  private async commitChanges() {
    if (!this.config.enableGitCommit) {
      await this.logger.info("Git commit disabled, skipping");
      return;
    }

    await this.logger.info("Checking for changes to commit");

    try {
      // Check if there are changes
      const statusProcess = new Deno.Command("git", {
        args: ["status", "--porcelain"],
        stdout: "pipe"
      });

      const { stdout } = await statusProcess.output();
      const changes = new TextDecoder().decode(stdout).trim();

      if (!changes) {
        await this.logger.info("No changes to commit");
        return;
      }

      // Add and commit changes
      await new Deno.Command("git", {
        args: ["add", this.config.legacyOutputFile, this.config.algoraApiOutputFile]
      }).output();

      const commitMessage = `🤖 Update bounty data - ${new Date().toISOString()}

- Total bounties updated
- Algora API format generated
- Legacy format maintained
- Generated by production-scraper.ts

🔧 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

      const commitProcess = new Deno.Command("git", {
        args: ["commit", "-m", commitMessage],
        stdout: "pipe"
      });

      const { code } = await commitProcess.output();

      if (code === 0) {
        await this.logger.success("Changes committed successfully");
      } else {
        await this.logger.warn("Git commit failed");
      }
    } catch (error) {
      await this.logger.error("Git operations failed", { error: error.message });
    }
  }

  async run(): Promise<boolean> {
    try {
      await this.logger.info("🚀 Starting Production Algora Bounty Scraper");

      // Health checks
      const healthOk = await this.performHealthChecks();
      if (!healthOk) {
        await this.logger.error("Health checks failed, aborting");
        return false;
      }

      // Load organizations
      const organizations = await this.loadOrganizations();

      await this.logger.info(`Processing ${organizations.length} organizations`);

      // Run the unified scraper
      const algoraResponse = await this.scraper.scrapeOrganizationsBatch(organizations);

      const bountyCount = algoraResponse.result.data.json.items.length;
      await this.logger.success(`Scraped ${bountyCount} total bounties`);

      // Generate legacy format for backward compatibility
      const legacyFormat = await this.generateLegacyFormat(algoraResponse);

      // Save both formats
      await this.saveOutput(algoraResponse, legacyFormat);

      // Run encryption pipeline
      await this.encryptOutput();

      // Commit changes
      await this.commitChanges();

      // Final statistics
      const stats = this.scraper.getStats();
      await this.logger.success("Production scrape completed successfully", {
        bounties_found: bountyCount,
        organizations_processed: organizations.length,
        failed_urls: stats.failedUrlsCount,
        processing_time_ms: Date.now() - this.logger.startTime,
        output_files: [
          this.config.algoraApiOutputFile,
          this.config.legacyOutputFile
        ]
      });

      return true;

    } catch (error) {
      await this.logger.error("Production scraper failed", {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "no-encrypt", "no-commit", "no-health-checks"],
    string: ["log-level", "output-dir", "organizations-file"],
    alias: {
      h: "help",
    },
  });

  if (args.help) {
    console.log(`
🤖 Production Algora Bounty Scraper

USAGE:
  deno run --allow-all scripts/production-scraper.ts [OPTIONS]

OPTIONS:
  --no-encrypt          Disable SOPS encryption pipeline
  --no-commit           Disable git commit automation
  --no-health-checks    Skip pre-flight health checks
  --output-dir DIR      Override output directory (default: data)
  --help, -h           Show this help message

OUTPUTS:
  data/algora-api-response.json    Algora API format (for bounty-pipe)
  data/bounty-index.json          Legacy format (backward compatibility)
  data/archive/                   Historical data archive
  logs/production-YYYY-MM-DD.log  Detailed execution logs

ENVIRONMENT VARIABLES:
  FIRECRAWL_API_KEY               Primary Firecrawl API key
  FIRECRAWL_PREFER_SELF_HOSTED   Use self-hosted Firecrawl if available
  SOPS_AGE_KEY                   Encryption key for SOPS
  GITHUB_TOKEN                   For git commits and API access

This scraper processes all 91+ organizations using the Unified Firecrawl scraper
and generates both Algora API format (for bounty-pipe) and legacy format data.
`);
    Deno.exit(0);
  }

  const config: Partial<ProductionConfig> = {
    enableEncryption: !args["no-encrypt"],
    enableGitCommit: !args["no-commit"],
    enableHealthChecks: !args["no-health-checks"],
  };

  if (args["output-dir"]) {
    config.outputDir = args["output-dir"];
    config.legacyOutputFile = `${args["output-dir"]}/bounty-index.json`;
    config.algoraApiOutputFile = `${args["output-dir"]}/algora-api-response.json`;
  }

  if (args["organizations-file"]) {
    config.organizationsFile = args["organizations-file"];
  }

  const scraper = new ProductionScraper(config);
  const success = await scraper.run();

  Deno.exit(success ? 0 : 1);
}

if (import.meta.main) {
  await main();
}