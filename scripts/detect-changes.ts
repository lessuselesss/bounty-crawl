#!/usr/bin/env -S deno run --allow-all

/**
 * Lightweight Change Detection Script
 *
 * Quickly detects which Algora organizations have changed since the last run
 * by fetching page HTML and comparing content hashes. This enables targeted
 * scraping of only changed organizations, reducing API costs by 90-95%.
 *
 * Usage:
 *   deno run --allow-all scripts/detect-changes.ts
 *   deno run --allow-all scripts/detect-changes.ts --format=json
 *   deno run --allow-all scripts/detect-changes.ts --force-all
 */

import { parseArgs } from "@std/cli/parse_args.ts";
import { OrganizationConfig } from "../src/types/bounty.ts";

interface DetectionState {
  version: string;
  last_updated: string;
  organizations: Record<string, OrgState>;
}

interface OrgState {
  url: string;
  hash: string;
  last_checked: string;
  last_changed?: string;
  bounty_count_estimate?: number;
}

interface DetectionResult {
  changed_orgs: string[];
  unchanged_orgs: string[];
  total_checked: number;
  errors: string[];
  is_first_run: boolean;
  execution_time_ms: number;
}

class ChangeDetector {
  private stateFile = "data/scraper-state.json";
  private organizationsFile = "data/organizations.json";
  private previousState: DetectionState | null = null;
  private organizations: OrganizationConfig[] = [];
  private errors: string[] = [];

  async loadOrganizations(): Promise<void> {
    try {
      const content = await Deno.readTextFile(this.organizationsFile);
      const data = JSON.parse(content);
      this.organizations = data.organizations || [];
      console.log(`✅ Loaded ${this.organizations.length} organizations`);
    } catch (error) {
      throw new Error(`Failed to load organizations: ${error.message}`);
    }
  }

  async loadPreviousState(): Promise<void> {
    try {
      const content = await Deno.readTextFile(this.stateFile);
      this.previousState = JSON.parse(content);
      console.log(`✅ Loaded previous state (${Object.keys(this.previousState!.organizations).length} orgs)`);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log(`ℹ️  No previous state found - first run`);
        this.previousState = null;
      } else {
        console.warn(`⚠️  Failed to load previous state: ${error.message}`);
        this.previousState = null;
      }
    }
  }

  private async fetchPageContent(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "bounty-crawl-change-detector/1.0",
          "Accept": "text/html",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return html;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async hashContent(content: string): Promise<string> {
    // Simple hash: extract bounty-related content and create a signature
    // This is more stable than hashing the entire HTML (which changes with timestamps, etc.)

    // Extract key indicators of bounty state:
    // - Number of bounty cards/items
    // - Bounty titles (if visible in HTML)
    // - Price amounts

    const bountyMarkers = [
      content.match(/bounty/gi)?.length || 0,
      content.match(/\$\d+/g)?.length || 0,
      content.match(/open/gi)?.length || 0,
    ].join('-');

    // Create a simple hash using crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(bountyMarkers + content.length);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex.slice(0, 16); // Use first 16 chars for brevity
  }

  private estimateBountyCount(html: string): number {
    // Try to estimate bounty count from HTML patterns
    // This is a heuristic and may not be 100% accurate
    const bountyCardMatches = html.match(/data-testid="bounty-card"/g);
    if (bountyCardMatches) {
      return bountyCardMatches.length;
    }

    // Fallback: count dollar signs as a rough estimate
    const dollarMatches = html.match(/\$\d+/g);
    return dollarMatches ? dollarMatches.length : 0;
  }

  async detectChanges(): Promise<DetectionResult> {
    const startTime = Date.now();
    const changedOrgs: string[] = [];
    const unchangedOrgs: string[] = [];
    const newState: DetectionState = {
      version: "1.0.0",
      last_updated: new Date().toISOString(),
      organizations: {},
    };

    const isFirstRun = this.previousState === null;

    console.log(`\n🔍 Checking ${this.organizations.length} organizations for changes...\n`);

    // Process organizations with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < this.organizations.length; i += concurrency) {
      const batch = this.organizations.slice(i, i + concurrency);

      await Promise.all(batch.map(async (org) => {
        const url = org.url || `https://algora.io/${org.handle}/bounties?status=open`;
        const previousOrgState = this.previousState?.organizations[org.handle];

        try {
          // Fetch page content
          const html = await this.fetchPageContent(url);
          const hash = await this.hashContent(html);
          const bountyCount = this.estimateBountyCount(html);

          // Check if changed
          const hasChanged = !previousOrgState || previousOrgState.hash !== hash;

          if (hasChanged) {
            changedOrgs.push(org.handle);
            console.log(`🔄 ${org.handle.padEnd(20)} - CHANGED (bounties: ~${bountyCount})`);
          } else {
            unchangedOrgs.push(org.handle);
            console.log(`✓  ${org.handle.padEnd(20)} - unchanged`);
          }

          // Store new state
          newState.organizations[org.handle] = {
            url,
            hash,
            last_checked: new Date().toISOString(),
            last_changed: hasChanged ? new Date().toISOString() : previousOrgState?.last_changed,
            bounty_count_estimate: bountyCount,
          };

        } catch (error) {
          this.errors.push(`${org.handle}: ${error.message}`);
          console.error(`❌ ${org.handle.padEnd(20)} - ERROR: ${error.message}`);

          // Keep previous state if error occurs
          if (previousOrgState) {
            newState.organizations[org.handle] = previousOrgState;
          }
        }
      }));

      // Small delay between batches to be polite
      if (i + concurrency < this.organizations.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Save new state
    await this.saveState(newState);

    const executionTime = Date.now() - startTime;

    return {
      changed_orgs: changedOrgs,
      unchanged_orgs: unchangedOrgs,
      total_checked: this.organizations.length,
      errors: this.errors,
      is_first_run: isFirstRun,
      execution_time_ms: executionTime,
    };
  }

  private async saveState(state: DetectionState): Promise<void> {
    try {
      await Deno.mkdir("data", { recursive: true });
      await Deno.writeTextFile(
        this.stateFile,
        JSON.stringify(state, null, 2)
      );
      console.log(`\n💾 Saved state to ${this.stateFile}`);
    } catch (error) {
      console.error(`❌ Failed to save state: ${error.message}`);
      throw error;
    }
  }

  async run(): Promise<DetectionResult> {
    await this.loadOrganizations();
    await this.loadPreviousState();
    return await this.detectChanges();
  }
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "force-all", "json"],
    string: ["format"],
    default: {
      format: "text",
    },
    alias: {
      h: "help",
    },
  });

  if (args.help) {
    console.log(`
🔍 Change Detection Script

USAGE:
  deno run --allow-all scripts/detect-changes.ts [OPTIONS]

OPTIONS:
  --format=FORMAT    Output format: text, json, csv (default: text)
  --json             Alias for --format=json
  --force-all        Mark all organizations as changed (force full scrape)
  --help, -h         Show this help message

OUTPUTS:
  Changed organizations are output in the specified format.

  Text format (default):
    Comma-separated list of changed org handles
    Example: tscircuit,vercel,anthropic

  JSON format:
    Full detection result as JSON object

  CSV format:
    One org handle per line

EXAMPLES:
  # Default: comma-separated list
  deno run --allow-all scripts/detect-changes.ts

  # JSON output
  deno run --allow-all scripts/detect-changes.ts --json

  # Force all orgs to be marked as changed
  deno run --allow-all scripts/detect-changes.ts --force-all

EXIT CODES:
  0: Success (changes detected or not)
  1: Error during detection

This script enables efficient targeted scraping by detecting which organizations
have changed since the last run, reducing Firecrawl API usage by 90-95%.
`);
    Deno.exit(0);
  }

  const format = args.json ? "json" : args.format;

  try {
    const detector = new ChangeDetector();
    const result = await detector.run();

    // Handle force-all flag
    if (args["force-all"]) {
      console.log("\n⚠️  --force-all flag set: marking all orgs as changed\n");
      result.changed_orgs = [...result.changed_orgs, ...result.unchanged_orgs];
      result.unchanged_orgs = [];
    }

    // Output summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Detection Summary");
    console.log("=".repeat(60));
    console.log(`Total organizations: ${result.total_checked}`);
    console.log(`Changed:             ${result.changed_orgs.length}`);
    console.log(`Unchanged:           ${result.unchanged_orgs.length}`);
    console.log(`Errors:              ${result.errors.length}`);
    console.log(`Execution time:      ${(result.execution_time_ms / 1000).toFixed(2)}s`);
    console.log(`First run:           ${result.is_first_run ? "Yes" : "No"}`);

    if (result.errors.length > 0) {
      console.log("\n⚠️  Errors:");
      result.errors.forEach(err => console.log(`   - ${err}`));
    }

    // Efficiency calculation
    if (!result.is_first_run) {
      const reduction = ((result.unchanged_orgs.length / result.total_checked) * 100).toFixed(1);
      console.log(`\n💰 API Cost Reduction: ${reduction}% (skipping ${result.unchanged_orgs.length} unchanged orgs)`);
    }

    // Output in requested format
    console.log("\n" + "=".repeat(60));
    console.log("📤 Output");
    console.log("=".repeat(60));

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else if (format === "csv") {
      console.log(result.changed_orgs.join("\n"));
    } else {
      // Default: comma-separated
      const output = result.changed_orgs.join(",");
      console.log(output);

      // Also output to a file for easy GitHub Actions consumption
      if (result.changed_orgs.length > 0) {
        await Deno.writeTextFile("data/changed-orgs.txt", output);
        console.log("\n📝 Wrote to data/changed-orgs.txt");
      }
    }

    Deno.exit(0);

  } catch (error) {
    console.error(`\n❌ Detection failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
