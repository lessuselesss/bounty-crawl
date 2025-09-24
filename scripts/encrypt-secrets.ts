#!/usr/bin/env deno run --allow-all

/**
 * Secret Encryption Script
 * Encrypts secrets using SOPS and age for secure storage in the repository
 */

import { parseArgs } from "@std/cli/parse_args.ts";

interface SecretData {
  github_token?: string;
  algora_session?: string;
  cachix_auth_token?: string;
  [key: string]: string | undefined;
}

class SecretManager {
  private ageKeyPath: string;

  constructor(ageKeyPath: string = ".age-key") {
    this.ageKeyPath = ageKeyPath;
  }

  async encryptSecrets(secrets: SecretData): Promise<void> {
    console.log("🔐 Encrypting secrets with SOPS...\n");

    // Ensure secrets directory exists
    await Deno.mkdir("secrets", { recursive: true });

    // Create secrets YAML file
    const secretsYaml = this.createSecretsYaml(secrets);
    const tempPath = "secrets/github-token.yaml.tmp";

    await Deno.writeTextFile(tempPath, secretsYaml);

    try {
      // Encrypt with SOPS
      const sopsProcess = new Deno.Command("sops", {
        args: [
          "--encrypt",
          "--age", await this.getPublicKey(),
          "--encrypted-regex", "^(token|key|secret|password)$",
          "--in-place",
          tempPath
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await sopsProcess.output();

      if (!result.success) {
        const error = new TextDecoder().decode(result.stderr);
        throw new Error(`SOPS encryption failed: ${error}`);
      }

      // Move to final location
      await Deno.rename(tempPath, "secrets/github-token.yaml");

      console.log("✅ Secrets encrypted successfully!");
      console.log("📁 Encrypted file: secrets/github-token.yaml");

    } catch (error) {
      // Clean up temp file on error
      try {
        await Deno.remove(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  async decryptSecrets(): Promise<SecretData> {
    console.log("🔓 Decrypting secrets with SOPS...");

    try {
      const sopsProcess = new Deno.Command("sops", {
        args: [
          "--decrypt",
          "secrets/github-token.yaml"
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await sopsProcess.output();

      if (!result.success) {
        const error = new TextDecoder().decode(result.stderr);
        throw new Error(`SOPS decryption failed: ${error}`);
      }

      const decryptedYaml = new TextDecoder().decode(result.stdout);
      return this.parseSecretsYaml(decryptedYaml);

    } catch (error) {
      console.error(`❌ Failed to decrypt secrets: ${error}`);
      throw error;
    }
  }

  private createSecretsYaml(secrets: SecretData): string {
    const lines = [
      "# Encrypted secrets for bounty-crawl",
      "# This file is encrypted with SOPS and age",
      "",
    ];

    if (secrets.github_token) {
      lines.push(`github_token: "${secrets.github_token}"`);
    }

    if (secrets.algora_session) {
      lines.push(`algora_session: "${secrets.algora_session}"`);
    }

    if (secrets.cachix_auth_token) {
      lines.push(`cachix_auth_token: "${secrets.cachix_auth_token}"`);
    }

    // Add any other custom secrets
    for (const [key, value] of Object.entries(secrets)) {
      if (!['github_token', 'algora_session', 'cachix_auth_token'].includes(key) && value) {
        lines.push(`${key}: "${value}"`);
      }
    }

    return lines.join("\n") + "\n";
  }

  private parseSecretsYaml(yaml: string): SecretData {
    const secrets: SecretData = {};
    const lines = yaml.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes(":")) continue;

      const [key, ...valueParts] = trimmed.split(":");
      const value = valueParts.join(":").trim().replace(/^["']|["']$/g, "");

      if (key && value) {
        secrets[key.trim()] = value;
      }
    }

    return secrets;
  }

  private async getPublicKey(): Promise<string> {
    try {
      const sopsConfig = await Deno.readTextFile(".sops.yaml");
      const lines = sopsConfig.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("age:") || trimmed.startsWith("- age")) {
          // Extract age key from YAML
          const ageMatch = trimmed.match(/age[^:]*:\s*(.+)/) || trimmed.match(/age\s+(.+)/);
          if (ageMatch) {
            return ageMatch[1].trim().replace(/^>-\s*/, "");
          }
        }
      }

      throw new Error("No age key found in .sops.yaml");

    } catch (error) {
      throw new Error(`Failed to read .sops.yaml: ${error}`);
    }
  }

  async verifyAgeKey(): Promise<boolean> {
    try {
      await Deno.stat(this.ageKeyPath);
      console.log(`✅ Age key found at ${this.ageKeyPath}`);
      return true;
    } catch {
      console.log(`❌ Age key not found at ${this.ageKeyPath}`);
      return false;
    }
  }

  async setupEnvironment(): Promise<void> {
    console.log("🔧 Setting up SOPS environment...");

    // Check for age key
    if (!(await this.verifyAgeKey())) {
      console.log("\n⚠️  Age key not found. Run the setup script first:");
      console.log("  deno run --allow-all scripts/setup-repo.ts");
      Deno.exit(1);
    }

    // Set environment variable for SOPS
    Deno.env.set("SOPS_AGE_KEY_FILE", this.ageKeyPath);
    console.log(`✅ SOPS_AGE_KEY_FILE set to ${this.ageKeyPath}`);
  }
}

async function promptForSecrets(): Promise<SecretData> {
  console.log("📝 Enter secrets to encrypt:\n");

  const secrets: SecretData = {};

  // GitHub Token
  const githubToken = prompt("GitHub Personal Access Token (for API and commits): ");
  if (githubToken?.trim()) {
    secrets.github_token = githubToken.trim();
  }

  // Algora Session (if needed for authenticated scraping)
  const algoraSession = prompt("Algora Session Cookie (optional, for authenticated scraping): ");
  if (algoraSession?.trim()) {
    secrets.algora_session = algoraSession.trim();
  }

  // Cachix Auth Token
  const cachixToken = prompt("Cachix Auth Token (optional, for Nix cache): ");
  if (cachixToken?.trim()) {
    secrets.cachix_auth_token = cachixToken.trim();
  }

  return secrets;
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "decrypt", "verify"],
    string: ["token", "session", "cachix"],
    alias: {
      h: "help",
      t: "token",
      s: "session",
      c: "cachix",
    },
  });

  if (args.help) {
    console.log(`
bounty-crawl - Secret Management

Usage: deno run --allow-all scripts/encrypt-secrets.ts [options]

Options:
  -h, --help               Show this help message
  --decrypt               Decrypt and display secrets
  --verify                Verify age key setup
  -t, --token TOKEN       GitHub Personal Access Token
  -s, --session SESSION   Algora Session Cookie
  -c, --cachix TOKEN      Cachix Auth Token

Interactive mode (no options):
  Prompts for all secrets and encrypts them

Examples:
  # Interactive mode
  deno run --allow-all scripts/encrypt-secrets.ts

  # Provide secrets via command line
  deno run --allow-all scripts/encrypt-secrets.ts --token ghp_xxx --session abc123

  # Decrypt existing secrets
  deno run --allow-all scripts/encrypt-secrets.ts --decrypt

  # Verify setup
  deno run --allow-all scripts/encrypt-secrets.ts --verify
    `);
    Deno.exit(0);
  }

  const secretManager = new SecretManager();

  try {
    await secretManager.setupEnvironment();

    if (args.verify) {
      console.log("✅ SOPS environment is properly configured");
      return;
    }

    if (args.decrypt) {
      try {
        const secrets = await secretManager.decryptSecrets();
        console.log("\n🔓 Decrypted secrets:");
        console.log(JSON.stringify(secrets, null, 2));
      } catch (error) {
        console.error(`❌ Decryption failed: ${error}`);
        Deno.exit(1);
      }
      return;
    }

    // Encryption mode
    let secrets: SecretData = {};

    if (args.token || args.session || args.cachix) {
      // Command line mode
      if (args.token) secrets.github_token = args.token;
      if (args.session) secrets.algora_session = args.session;
      if (args.cachix) secrets.cachix_auth_token = args.cachix;
    } else {
      // Interactive mode
      secrets = await promptForSecrets();
    }

    if (Object.keys(secrets).length === 0) {
      console.log("❌ No secrets provided");
      Deno.exit(1);
    }

    await secretManager.encryptSecrets(secrets);

    console.log("\n📋 Next steps:");
    console.log("1. Add the encrypted secrets to your repository:");
    console.log("   git add secrets/github-token.yaml .sops.yaml");
    console.log("   git commit -m 'Add encrypted secrets configuration'");
    console.log("\n2. Add your age private key to GitHub repository secrets:");
    console.log("   - Go to repository Settings → Secrets and variables → Actions");
    console.log("   - Add new secret: SOPS_AGE_KEY");
    console.log("   - Value: contents of .age-key file");
    console.log("\n3. Test the workflow:");
    console.log("   git push origin main");

  } catch (error) {
    console.error(`❌ Operation failed: ${error}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}