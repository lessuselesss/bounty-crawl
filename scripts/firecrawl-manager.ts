#!/usr/bin/env -S deno run --allow-all

/**
 * Firecrawl Self-hosted Manager
 *
 * Manages the local Firecrawl instance for the Algora Bounty Scraper.
 * Provides commands to start, stop, restart, and monitor the self-hosted Firecrawl service.
 */

import { parseArgs } from "@std/cli/parse_args.ts";

interface ManagerConfig {
  composeFile: string;
  healthCheckUrl: string;
  maxStartupTime: number;
  checkInterval: number;
}

const config: ManagerConfig = {
  composeFile: "docker-compose.firecrawl.yml",
  healthCheckUrl: "http://localhost:3002/health",
  maxStartupTime: 120000, // 2 minutes
  checkInterval: 2000, // 2 seconds
};

class FirecrawlManager {
  private async runCommand(cmd: string, args: string[]): Promise<boolean> {
    try {
      const process = new Deno.Command(cmd, {
        args,
        stdout: "inherit",
        stderr: "inherit",
      });

      const result = await process.output();
      return result.success;
    } catch (error) {
      console.error(`❌ Failed to run command: ${cmd} ${args.join(" ")}`);
      console.error(error.message);
      return false;
    }
  }

  private async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(config.healthCheckUrl, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async waitForHealth(): Promise<boolean> {
    console.log("🔍 Waiting for Firecrawl to become healthy...");

    const startTime = Date.now();
    while (Date.now() - startTime < config.maxStartupTime) {
      if (await this.checkHealth()) {
        console.log("✅ Firecrawl is healthy and ready!");
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, config.checkInterval));
      process.stdout.write(".");
    }

    console.log("\n❌ Firecrawl failed to become healthy within timeout period");
    return false;
  }

  async start(): Promise<boolean> {
    console.log("🚀 Starting self-hosted Firecrawl...");

    // Check if already running
    if (await this.checkHealth()) {
      console.log("✅ Firecrawl is already running!");
      return true;
    }

    // Start services
    const success = await this.runCommand("docker", [
      "compose",
      "-f", config.composeFile,
      "up", "-d", "--build"
    ]);

    if (!success) {
      console.log("❌ Failed to start Firecrawl containers");
      return false;
    }

    // Wait for services to be ready
    return await this.waitForHealth();
  }

  async stop(): Promise<boolean> {
    console.log("🛑 Stopping self-hosted Firecrawl...");

    const success = await this.runCommand("docker", [
      "compose",
      "-f", config.composeFile,
      "down"
    ]);

    if (success) {
      console.log("✅ Firecrawl stopped successfully");
    }

    return success;
  }

  async restart(): Promise<boolean> {
    console.log("🔄 Restarting self-hosted Firecrawl...");

    if (!await this.stop()) {
      return false;
    }

    // Brief pause between stop and start
    await new Promise(resolve => setTimeout(resolve, 2000));

    return await this.start();
  }

  async status(): Promise<void> {
    console.log("📊 Firecrawl Status Check");
    console.log("========================");

    // Check health endpoint
    const isHealthy = await this.checkHealth();
    console.log(`Health Status: ${isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`);
    console.log(`Health URL: ${config.healthCheckUrl}`);

    // Check Docker containers
    console.log("\n🐳 Docker Container Status:");
    await this.runCommand("docker", [
      "compose",
      "-f", config.composeFile,
      "ps"
    ]);
  }

  async logs(service?: string): Promise<boolean> {
    console.log(`📋 Firecrawl Logs${service ? ` (${service})` : ""}`);
    console.log("================");

    const args = ["compose", "-f", config.composeFile, "logs", "-f"];
    if (service) {
      args.push(service);
    }

    return await this.runCommand("docker", args);
  }

  async test(): Promise<boolean> {
    console.log("🧪 Testing Firecrawl API...");

    if (!await this.checkHealth()) {
      console.log("❌ Firecrawl is not healthy. Start it first with: --start");
      return false;
    }

    try {
      const testUrl = "https://algora.io/calcom/bounties?status=open";
      console.log(`Testing with URL: ${testUrl}`);

      const response = await fetch("http://localhost:3002/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: testUrl,
          formats: ["markdown", "html"],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Test successful!");
        console.log(`Response status: ${result.success ? "Success" : "Failed"}`);
        if (result.data) {
          console.log(`Content length: ${result.data.markdown?.length || 0} chars`);
        }
        return true;
      } else {
        console.log(`❌ Test failed with status: ${response.status}`);
        const error = await response.text();
        console.log(`Error: ${error}`);
        return false;
      }
    } catch (error) {
      console.log("❌ Test failed with error:");
      console.error(error.message);
      return false;
    }
  }

  async cleanup(): Promise<boolean> {
    console.log("🧹 Cleaning up Firecrawl resources...");

    const success = await this.runCommand("docker", [
      "compose",
      "-f", config.composeFile,
      "down", "-v", "--remove-orphans"
    ]);

    if (success) {
      console.log("✅ Cleanup completed successfully");
    }

    return success;
  }
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["start", "stop", "restart", "status", "test", "cleanup", "help"],
    string: ["logs"],
    default: {
      logs: "",
    },
    alias: {
      h: "help",
      s: "start",
      t: "stop",
      r: "restart",
      l: "logs",
    },
  });

  if (args.help || Deno.args.length === 0) {
    console.log(`
🔥 Firecrawl Self-hosted Manager

USAGE:
  deno run --allow-all scripts/firecrawl-manager.ts [OPTIONS]

OPTIONS:
  --start, -s           Start Firecrawl services
  --stop, -t            Stop Firecrawl services
  --restart, -r         Restart Firecrawl services
  --status              Show status of all services
  --test                Test the Firecrawl API with a sample request
  --logs [service]      Show logs (optionally for specific service)
  --cleanup             Stop services and remove volumes
  --help, -h            Show this help message

EXAMPLES:
  deno run --allow-all scripts/firecrawl-manager.ts --start
  deno run --allow-all scripts/firecrawl-manager.ts --status
  deno run --allow-all scripts/firecrawl-manager.ts --logs firecrawl-api
  deno run --allow-all scripts/firecrawl-manager.ts --test

SERVICES:
  - firecrawl-api       Main API service (port 3002)
  - playwright          Browser automation service
  - redis               Job queue and caching

HEALTH CHECK:
  curl http://localhost:3002/health
`);
    Deno.exit(0);
  }

  const manager = new FirecrawlManager();
  let success = true;

  try {
    if (args.start) {
      success = await manager.start();
    } else if (args.stop) {
      success = await manager.stop();
    } else if (args.restart) {
      success = await manager.restart();
    } else if (args.status) {
      await manager.status();
    } else if (args.test) {
      success = await manager.test();
    } else if (args.logs !== "") {
      success = await manager.logs(args.logs || undefined);
    } else if (args.cleanup) {
      success = await manager.cleanup();
    } else {
      console.log("❌ No action specified. Use --help for usage information.");
      success = false;
    }
  } catch (error) {
    console.error("💥 Fatal error:");
    console.error(error.message);
    success = false;
  }

  Deno.exit(success ? 0 : 1);
}

if (import.meta.main) {
  await main();
}