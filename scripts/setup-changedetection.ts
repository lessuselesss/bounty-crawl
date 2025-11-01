#!/usr/bin/env -S deno run --allow-all

/**
 * changedetection.io Setup Script
 *
 * Bulk-configures changedetection.io to monitor all Algora organizations.
 * Creates or updates watch entries for each organization with webhook notifications.
 */

import { OrganizationConfig } from "../src/types/bounty.ts";
import { parseArgs } from "@std/cli/parse_args.ts";

interface ChangeDetectionConfig {
  changedetectionUrl: string;
  webhookUrl: string;
  webhookSecret?: string;
  checkInterval: number;  // Minutes between checks
  dryRun: boolean;
}

interface WatchConfig {
  url: string;
  title: string;
  tags: string[];
  notification_urls: string[];
  fetch_backend: string;  // "playwright" or "html_requests"
  check_interval: number;  // Seconds
  trigger_text?: string[];
  ignore_text?: string[];
  filter_text_added: boolean;
  filter_text_replaced: boolean;
  filter_text_removed: boolean;
}

class ChangeDetectionSetup {
  private config: ChangeDetectionConfig;
  private organizations: OrganizationConfig[] = [];

  constructor(config: ChangeDetectionConfig) {
    this.config = config;
  }

  async loadOrganizations(): Promise<void> {
    console.log("📦 Loading organizations from data/organizations.json");

    const content = await Deno.readTextFile("data/organizations.json");
    const data = JSON.parse(content);

    if (!data.organizations || !Array.isArray(data.organizations)) {
      throw new Error("Invalid organizations file format");
    }

    this.organizations = data.organizations;
    console.log(`✅ Loaded ${this.organizations.length} organizations`);
  }

  private buildWebhookUrl(orgHandle: string): string {
    const params = new URLSearchParams({
      org: orgHandle,
      url: `https://algora.io/${orgHandle}/bounties?status=open`,
    });

    let webhookUrl = this.config.webhookUrl;

    // Add webhook secret if configured
    if (this.config.webhookSecret) {
      webhookUrl += `?secret=${this.config.webhookSecret}`;
    }

    return webhookUrl;
  }

  private createWatchConfig(org: OrganizationConfig): WatchConfig {
    const orgUrl = `https://algora.io/${org.handle}/bounties?status=open`;

    // Build webhook notification URL with metadata
    const notificationUrl = `json://${this.buildWebhookUrl(org.handle)}`;

    return {
      url: orgUrl,
      title: `Algora Bounties - ${org.display_name || org.handle}`,
      tags: ["algora", "bounties", org.handle],
      notification_urls: [notificationUrl],
      fetch_backend: "playwright",  // Use Playwright for JavaScript rendering
      check_interval: this.config.checkInterval * 60,  // Convert minutes to seconds
      trigger_text: [
        "Open bounties",  // Detect when bounty list changes
      ],
      ignore_text: [
        "Last updated",  // Ignore timestamp changes
        "ago",           // Ignore relative time changes
      ],
      filter_text_added: true,     // Alert on new bounties
      filter_text_removed: true,   // Alert on closed/claimed bounties
      filter_text_replaced: true,  // Alert on bounty updates
    };
  }

  private async apiRequest(
    endpoint: string,
    method: string = "GET",
    body?: any
  ): Promise<any> {
    const url = `${this.config.changedetectionUrl}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    console.log(`🌐 ${method} ${endpoint}`);

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `changedetection.io API error (${response.status}): ${error}`
      );
    }

    // Some endpoints return empty responses
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  private async checkHealth(): Promise<boolean> {
    try {
      await this.apiRequest("/");
      console.log("✅ changedetection.io is reachable");
      return true;
    } catch (error) {
      console.error(`❌ Cannot reach changedetection.io: ${error.message}`);
      return false;
    }
  }

  private async getExistingWatches(): Promise<Map<string, string>> {
    try {
      const watches = await this.apiRequest("/api/v1/watch");
      const watchMap = new Map<string, string>();

      if (watches && typeof watches === "object") {
        for (const [uuid, watch] of Object.entries(watches)) {
          if (typeof watch === "object" && watch !== null) {
            const url = (watch as any).url;
            if (url && typeof url === "string") {
              watchMap.set(url, uuid);
            }
          }
        }
      }

      console.log(`📋 Found ${watchMap.size} existing watches`);
      return watchMap;
    } catch (error) {
      console.warn(`⚠️  Could not fetch existing watches: ${error.message}`);
      return new Map();
    }
  }

  private async createWatch(config: WatchConfig): Promise<boolean> {
    if (this.config.dryRun) {
      console.log(`  [DRY RUN] Would create watch: ${config.title}`);
      console.log(`  URL: ${config.url}`);
      console.log(`  Webhook: ${config.notification_urls[0]}`);
      return true;
    }

    try {
      await this.apiRequest("/api/v1/watch", "POST", config);
      return true;
    } catch (error) {
      console.error(`  ❌ Failed to create watch: ${error.message}`);
      return false;
    }
  }

  private async updateWatch(uuid: string, config: WatchConfig): Promise<boolean> {
    if (this.config.dryRun) {
      console.log(`  [DRY RUN] Would update watch: ${config.title}`);
      return true;
    }

    try {
      await this.apiRequest(`/api/v1/watch/${uuid}`, "PUT", config);
      return true;
    } catch (error) {
      console.error(`  ❌ Failed to update watch: ${error.message}`);
      return false;
    }
  }

  async setupWatches(): Promise<void> {
    console.log("\n🔧 Setting up changedetection.io watches\n");

    // Check health
    const healthy = await this.checkHealth();
    if (!healthy) {
      throw new Error("changedetection.io is not reachable");
    }

    // Get existing watches
    const existingWatches = await this.getExistingWatches();

    let created = 0;
    let updated = 0;
    let failed = 0;

    // Process each organization
    for (const [index, org] of this.organizations.entries()) {
      const progress = `[${index + 1}/${this.organizations.length}]`;
      console.log(`\n${progress} Processing ${org.handle}`);

      const watchConfig = this.createWatchConfig(org);
      const existingUuid = existingWatches.get(watchConfig.url);

      if (existingUuid) {
        console.log(`  ♻️  Updating existing watch (UUID: ${existingUuid})`);
        const success = await this.updateWatch(existingUuid, watchConfig);
        if (success) {
          updated++;
          console.log(`  ✅ Updated`);
        } else {
          failed++;
        }
      } else {
        console.log(`  ➕ Creating new watch`);
        const success = await this.createWatch(watchConfig);
        if (success) {
          created++;
          console.log(`  ✅ Created`);
        } else {
          failed++;
        }
      }

      // Rate limiting: small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Setup Summary");
    console.log("=".repeat(60));
    console.log(`Total organizations:  ${this.organizations.length}`);
    console.log(`Watches created:      ${created}`);
    console.log(`Watches updated:      ${updated}`);
    console.log(`Failed:               ${failed}`);
    console.log("");

    if (this.config.dryRun) {
      console.log("🔍 DRY RUN MODE - No actual changes were made");
    } else if (failed === 0) {
      console.log("✅ All watches configured successfully!");
    } else {
      console.log(`⚠️  ${failed} watches failed to configure`);
    }

    console.log("\n📍 Next steps:");
    console.log("1. Verify watches in changedetection.io web UI: " + this.config.changedetectionUrl);
    console.log("2. Deploy Cloudflare Worker to receive webhooks");
    console.log("3. Test with a manual change to verify end-to-end flow");
  }

  async run(): Promise<void> {
    console.log("🚀 changedetection.io Setup Script\n");

    await this.loadOrganizations();
    await this.setupWatches();
  }
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "dry-run"],
    string: ["changedetection-url", "webhook-url", "webhook-secret", "check-interval"],
    default: {
      "changedetection-url": Deno.env.get("CHANGEDETECTION_URL") || "http://localhost:5000",
      "webhook-url": Deno.env.get("WEBHOOK_URL") || "",
      "webhook-secret": Deno.env.get("WEBHOOK_SECRET") || "",
      "check-interval": "15",  // 15 minutes default
      "dry-run": false,
    },
    alias: {
      h: "help",
      d: "dry-run",
    },
  });

  if (args.help) {
    console.log(`
🔧 changedetection.io Setup Script

USAGE:
  deno run --allow-all scripts/setup-changedetection.ts [OPTIONS]

OPTIONS:
  --changedetection-url URL  changedetection.io base URL (default: http://localhost:5000)
  --webhook-url URL          Cloudflare Worker webhook URL (REQUIRED)
  --webhook-secret SECRET    Optional webhook secret for authentication
  --check-interval MINUTES   Minutes between checks (default: 15)
  --dry-run, -d              Preview changes without applying them
  --help, -h                 Show this help message

ENVIRONMENT VARIABLES:
  CHANGEDETECTION_URL   Base URL for changedetection.io
  WEBHOOK_URL           Cloudflare Worker webhook endpoint
  WEBHOOK_SECRET        Optional webhook authentication secret

EXAMPLES:
  # Dry run to preview configuration
  deno run --allow-all scripts/setup-changedetection.ts --dry-run

  # Configure with custom webhook URL
  deno run --allow-all scripts/setup-changedetection.ts \\
    --webhook-url https://webhook.example.workers.dev \\
    --webhook-secret my-secret-key

  # Use environment variables
  export WEBHOOK_URL=https://webhook.example.workers.dev
  export WEBHOOK_SECRET=my-secret-key
  deno run --allow-all scripts/setup-changedetection.ts

This script configures changedetection.io to monitor all 91 Algora organizations
and send webhooks to your Cloudflare Worker when changes are detected.
`);
    Deno.exit(0);
  }

  // Validate required parameters
  if (!args["webhook-url"]) {
    console.error("❌ Error: --webhook-url is required");
    console.error("   Use --help for usage information");
    Deno.exit(1);
  }

  const config: ChangeDetectionConfig = {
    changedetectionUrl: args["changedetection-url"],
    webhookUrl: args["webhook-url"],
    webhookSecret: args["webhook-secret"] || undefined,
    checkInterval: parseInt(args["check-interval"]),
    dryRun: args["dry-run"],
  };

  // Validate check interval
  if (isNaN(config.checkInterval) || config.checkInterval < 1) {
    console.error("❌ Error: --check-interval must be a positive number");
    Deno.exit(1);
  }

  console.log("Configuration:");
  console.log(`  changedetection.io: ${config.changedetectionUrl}`);
  console.log(`  Webhook URL:        ${config.webhookUrl}`);
  console.log(`  Webhook Secret:     ${config.webhookSecret ? "***" : "(none)"}`);
  console.log(`  Check Interval:     ${config.checkInterval} minutes`);
  console.log(`  Dry Run:            ${config.dryRun}`);
  console.log("");

  const setup = new ChangeDetectionSetup(config);
  await setup.run();
}

if (import.meta.main) {
  await main();
}
