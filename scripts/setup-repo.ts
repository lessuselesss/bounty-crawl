#!/usr/bin/env deno run --allow-all

/**
 * Repository Setup Script
 * Initializes the bounty-crawl repository with proper configuration
 */

import { parseArgs } from "@std/cli/parse_args.ts";

class RepositorySetup {
  private repoPath: string;

  constructor(repoPath: string = ".") {
    this.repoPath = repoPath;
  }

  async setup(): Promise<void> {
    console.log("🚀 Setting up bounty-crawl repository...\n");

    await this.createDirectories();
    await this.generateAgeKey();
    await this.createInitialConfig();
    await this.createOrganizationsList();
    await this.initializeGitRepository();
    await this.createInitialCommit();

    console.log("\n✅ Repository setup completed successfully!");
    console.log("\n📋 Next steps:");
    console.log("1. Add your GitHub repository secrets:");
    console.log("   - SOPS_AGE_KEY (from .age-key file)");
    console.log("   - GITHUB_TOKEN (for API access and commits)");
    console.log("   - CACHIX_AUTH_TOKEN (optional, for Nix cache)");
    console.log("\n2. Encrypt any additional secrets:");
    console.log("   deno task encrypt");
    console.log("\n3. Test the scraper locally:");
    console.log("   deno task scrape");
    console.log("\n4. Push to GitHub to start automated scraping:");
    console.log("   git push origin main");
  }

  private async createDirectories(): Promise<void> {
    const directories = [
      "data/archive",
      "logs",
      "secrets",
      "config",
      "tests/scrapers",
      "tests/utils",
      "docs",
    ];

    console.log("📁 Creating directory structure...");
    for (const dir of directories) {
      await Deno.mkdir(dir, { recursive: true });
      console.log(`  ✓ ${dir}/`);
    }
  }

  private async generateAgeKey(): Promise<void> {
    console.log("\n🔑 Generating age key for SOPS encryption...");

    try {
      // Generate age key using age-keygen
      const ageKeygenProcess = new Deno.Command("age-keygen", {
        stdout: "piped",
        stderr: "piped",
      });

      const result = await ageKeygenProcess.output();

      if (!result.success) {
        const error = new TextDecoder().decode(result.stderr);
        throw new Error(`Failed to generate age key: ${error}`);
      }

      const output = new TextDecoder().decode(result.stdout);
      const lines = output.trim().split('\n');

      // Extract private key and public key
      const privateKeyLine = lines.find(line => line.startsWith('AGE-SECRET-KEY-'));
      const publicKeyLine = lines.find(line => line.startsWith('age1'));

      if (!privateKeyLine || !publicKeyLine) {
        throw new Error("Could not parse age-keygen output");
      }

      // Save private key to .age-key (this should NOT be committed)
      await Deno.writeTextFile(".age-key", privateKeyLine);
      console.log("  ✓ Private key saved to .age-key");

      // Update .sops.yaml with the public key
      const sopsConfig = await Deno.readTextFile(".sops.yaml");
      const updatedConfig = sopsConfig.replace(
        /age1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ/g,
        publicKeyLine
      );
      await Deno.writeTextFile(".sops.yaml", updatedConfig);
      console.log("  ✓ Updated .sops.yaml with public key");

      // Update .gitignore to exclude private key
      const gitignoreContent = `
# Age private keys (NEVER commit these!)
.age-key
*.age-key

# SOPS temporary files
.sops.yaml.bak

# Development files
.env
.env.local

# Logs and temporary files
logs/
*.log

# Cache directories
.cache/
.deno/
.local/
.config/

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Node modules (if any)
node_modules/
`;

      await Deno.writeTextFile(".gitignore", gitignoreContent);
      console.log("  ✓ Updated .gitignore");

      console.log(`\n⚠️  IMPORTANT: Add this private key to your GitHub repository secrets as 'SOPS_AGE_KEY':`);
      console.log(`    ${privateKeyLine}`);

    } catch (error) {
      console.error(`❌ Failed to generate age key: ${error}`);
      console.log("\n📝 Manual setup required:");
      console.log("1. Install age: https://github.com/FiloSottile/age");
      console.log("2. Run: age-keygen");
      console.log("3. Save the private key to .age-key");
      console.log("4. Update .sops.yaml with the public key");
    }
  }

  private async createInitialConfig(): Promise<void> {
    console.log("\n⚙️  Creating initial configuration...");

    const scraperConfig = {
      user_agent: "bounty-crawl/1.0 (+https://github.com/your-username/bounty-crawl)",
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

    await Deno.writeTextFile(
      "config/scraper-config.json",
      JSON.stringify(scraperConfig, null, 2)
    );
    console.log("  ✓ config/scraper-config.json");
  }

  private async createOrganizationsList(): Promise<void> {
    console.log("\n🏢 Creating organizations list...");

    // Known organizations from our research
    const knownOrgs = [
      { handle: "ZIO", display_name: "ZIO" },
      { handle: "cal", display_name: "Cal.com" },
      { handle: "calcom", display_name: "Cal.com" },
      { handle: "twenty", display_name: "Twenty" },
      { handle: "twentyhq", display_name: "Twenty HQ" },
      { handle: "activepieces", display_name: "Activepieces" },
      { handle: "tscircuit", display_name: "tscircuit" },
      { handle: "projectdiscovery", display_name: "ProjectDiscovery" },
      { handle: "triggerdotdev", display_name: "Trigger.dev" },
      { handle: "highlight", display_name: "Highlight" },
      { handle: "remotion", display_name: "Remotion" },
      { handle: "remotion-dev", display_name: "Remotion Dev" },
      { handle: "documenso", display_name: "Documenso" },
      { handle: "coollabsio", display_name: "Coolify" },
      { handle: "traceloop", display_name: "Traceloop" },
      { handle: "algora-io", display_name: "Algora" },
      { handle: "mudlet", display_name: "Mudlet" },
    ];

    const organizationsList = {
      updated_at: new Date().toISOString(),
      version: "1.0.0",
      organizations: knownOrgs.map(org => ({
        handle: org.handle,
        display_name: org.display_name,
        url: `https://algora.io/${org.handle}/bounties?status=open`,
        active: true,
        scrape_interval: 900, // 15 minutes
      })),
    };

    await Deno.writeTextFile(
      "data/organizations.json",
      JSON.stringify(organizationsList, null, 2)
    );
    console.log(`  ✓ data/organizations.json (${knownOrgs.length} organizations)`);
  }

  private async initializeGitRepository(): Promise<void> {
    console.log("\n📦 Initializing git repository...");

    try {
      // Check if already a git repository
      await Deno.stat(".git");
      console.log("  ✓ Git repository already exists");
      return;
    } catch {
      // Not a git repository, initialize it
    }

    const gitCommands = [
      ["git", "init"],
      ["git", "config", "user.name", "bounty-crawl"],
      ["git", "config", "user.email", "crawler@bounty-crawl.com"],
      ["git", "branch", "-M", "main"],
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

    console.log("  ✓ Git repository initialized");
  }

  private async createInitialCommit(): Promise<void> {
    console.log("\n💾 Creating initial commit...");

    const gitCommands = [
      ["git", "add", "."],
      ["git", "commit", "-m", "🎉 Initial commit - bounty-crawl setup"],
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
        console.log(`  ⚠️  ${command.join(" ")}: ${error.trim()}`);
      }
    }

    console.log("  ✓ Initial commit created");
  }
}

// Main function
async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help"],
    string: ["path"],
    alias: {
      h: "help",
      p: "path",
    },
  });

  if (args.help) {
    console.log(`
bounty-crawl Setup

Usage: deno run --allow-all scripts/setup-repo.ts [options]

Options:
  -h, --help        Show this help message
  -p, --path PATH   Repository path (default: current directory)

This script will:
1. Create the necessary directory structure
2. Generate age keys for SOPS encryption
3. Create initial configuration files
4. Set up the organizations list
5. Initialize git repository
6. Create initial commit

Make sure you have the following installed:
- age (for encryption)
- git
- sops
    `);
    Deno.exit(0);
  }

  const repoPath = args.path || ".";
  const setup = new RepositorySetup(repoPath);

  try {
    await setup.setup();
  } catch (error) {
    console.error(`❌ Setup failed: ${error}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}