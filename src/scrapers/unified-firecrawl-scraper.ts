/**
 * Unified Firecrawl Scraper
 *
 * Supports both external Firecrawl API and self-hosted instances with automatic
 * fallback, API key rotation, and optimized configuration for Algora bounty scraping.
 */

import { AlgoraApiResponse, BountyItem, OrganizationConfig } from "../types/bounty.ts";

export interface FirecrawlConfig {
  // External Firecrawl API
  externalApiKey?: string;
  externalApiUrl?: string;

  // Self-hosted instance
  selfHostedUrl?: string;
  selfHostedAuthSecret?: string;

  // Behavior configuration
  preferSelfHosted: boolean;
  enableFallback: boolean;
  requestTimeout: number;
  retryAttempts: number;

  // Scraping optimization
  maxConcurrent: number;
  rateLimitDelay: number;
}

export interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    metadata?: Record<string, any>;
  };
  error?: string;
}

export class UnifiedFirecrawlScraper {
  private config: FirecrawlConfig;
  private apiKeys: string[];
  private currentKeyIndex = 0;
  private failedUrls: Set<string> = new Set();

  constructor(config?: Partial<FirecrawlConfig>) {
    this.config = {
      externalApiUrl: "https://api.firecrawl.dev",
      selfHostedUrl: "http://localhost:3002",
      preferSelfHosted: Deno.env.get("FIRECRAWL_PREFER_SELF_HOSTED") === "true",
      enableFallback: true,
      requestTimeout: 30000,
      retryAttempts: 3,
      maxConcurrent: 5,
      rateLimitDelay: 1000,
      ...config,
    };

    // Initialize API keys from environment
    this.apiKeys = this.loadApiKeys();

    console.log(`🔥 Unified Firecrawl Scraper initialized`);
    console.log(`   Self-hosted: ${this.config.selfHostedUrl}`);
    console.log(`   External API: ${this.config.externalApiUrl}`);
    console.log(`   Prefer self-hosted: ${this.config.preferSelfHosted}`);
    console.log(`   API keys loaded: ${this.apiKeys.length}`);
  }

  private loadApiKeys(): string[] {
    const keys: string[] = [];

    // Primary API key
    const primaryKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (primaryKey) {
      keys.push(primaryKey);
    }

    // Additional API keys for rotation
    for (let i = 2; i <= 5; i++) {
      const key = Deno.env.get(`FIRECRAWL_API_KEY_${i}`);
      if (key) {
        keys.push(key);
      }
    }

    return keys;
  }

  private async checkSelfHostedHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.selfHostedUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getNextApiKey(): string | null {
    if (this.apiKeys.length === 0) {
      return null;
    }

    const key = this.apiKeys[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return key;
  }

  private async scrapeWithSelfHosted(url: string): Promise<FirecrawlResponse> {
    const requestBody = {
      url,
      formats: ["markdown", "html"],
      onlyMainContent: true,
      includeTags: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "div", "span"],
      excludeTags: ["script", "style", "nav", "footer", "aside"],
      waitFor: 2000,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add authentication if configured
    if (this.config.selfHostedAuthSecret) {
      headers["Authorization"] = `Bearer ${this.config.selfHostedAuthSecret}`;
    }

    const response = await fetch(`${this.config.selfHostedUrl}/v1/scrape`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.requestTimeout),
    });

    if (!response.ok) {
      throw new Error(`Self-hosted API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private async scrapeWithExternal(url: string, apiKey: string): Promise<FirecrawlResponse> {
    const requestBody = {
      url,
      formats: ["markdown", "html"],
      onlyMainContent: true,
      includeTags: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "div", "span"],
      excludeTags: ["script", "style", "nav", "footer", "aside"],
      waitFor: 2000,
    };

    const response = await fetch(`${this.config.externalApiUrl}/v1/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.requestTimeout),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("RATE_LIMITED");
      }
      throw new Error(`External API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async scrapeUrl(url: string): Promise<FirecrawlResponse> {
    // Skip URLs that consistently fail
    if (this.failedUrls.has(url)) {
      return {
        success: false,
        error: "URL previously failed, skipping",
      };
    }

    const attempts = [];

    // Try self-hosted first if preferred and available
    if (this.config.preferSelfHosted) {
      const isHealthy = await this.checkSelfHostedHealth();
      if (isHealthy) {
        attempts.push("self-hosted");
      }
    }

    // Add external API attempts with different keys
    for (let i = 0; i < Math.min(this.apiKeys.length, 2); i++) {
      attempts.push("external");
    }

    // Add self-hosted as fallback if not preferred
    if (!this.config.preferSelfHosted && this.config.enableFallback) {
      const isHealthy = await this.checkSelfHostedHealth();
      if (isHealthy) {
        attempts.push("self-hosted");
      }
    }

    let lastError = "No scraping methods available";

    for (const method of attempts) {
      try {
        if (method === "self-hosted") {
          console.log(`🏠 Scraping with self-hosted Firecrawl: ${url}`);
          const result = await this.scrapeWithSelfHosted(url);

          if (result.success) {
            return result;
          } else {
            console.log(`⚠️  Self-hosted scraping failed: ${result.error}`);
            lastError = result.error || "Self-hosted scraping failed";
          }
        } else {
          const apiKey = this.getNextApiKey();
          if (!apiKey) {
            console.log("⚠️  No API keys available for external scraping");
            continue;
          }

          console.log(`☁️  Scraping with external Firecrawl: ${url}`);
          const result = await this.scrapeWithExternal(url, apiKey);

          if (result.success) {
            return result;
          } else {
            console.log(`⚠️  External scraping failed: ${result.error}`);
            lastError = result.error || "External scraping failed";
          }
        }
      } catch (error) {
        console.log(`❌ Error with ${method} method: ${error.message}`);
        lastError = error.message;

        // Handle rate limiting by trying next method
        if (error.message === "RATE_LIMITED") {
          console.log("⏱️  Rate limited, trying next method...");
          continue;
        }

        // Brief delay between attempts
        await new Promise(resolve => setTimeout(resolve, this.config.rateLimitDelay));
      }
    }

    // Mark URL as failed after all attempts exhausted
    this.failedUrls.add(url);

    return {
      success: false,
      error: lastError,
    };
  }

  async scrapeBountyPage(org: OrganizationConfig): Promise<BountyItem[]> {
    console.log(`🎯 Scraping bounties for ${org.display_name} (${org.handle})`);

    const result = await this.scrapeUrl(org.url);

    if (!result.success || !result.data?.markdown) {
      console.log(`❌ Failed to scrape ${org.handle}: ${result.error}`);
      return [];
    }

    // Extract bounties from markdown using AI-powered analysis
    return this.extractBountiesFromMarkdown(result.data.markdown, org);
  }

  private extractBountiesFromMarkdown(markdown: string, org: OrganizationConfig): BountyItem[] {
    const bounties: BountyItem[] = [];

    // Look for GitHub issue patterns in the markdown
    const githubIssuePattern = /github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/g;
    const matches = [...markdown.matchAll(githubIssuePattern)];

    for (const match of matches) {
      const [fullUrl, owner, repo, issueNumber] = match;

      // Extract title and amount from surrounding context
      const bountyData = this.extractBountyContext(markdown, fullUrl);

      if (bountyData) {
        const bounty: BountyItem = {
          id: `${org.handle}#${issueNumber}`,
          status: "open",
          type: "standard",
          kind: "dev",
          org: {
            handle: org.handle,
            id: `generated-${org.handle}`,
            name: org.display_name,
            description: org.description || "",
            members: [],
            display_name: org.display_name,
            created_at: new Date().toISOString(),
            website_url: "",
            avatar_url: `https://avatars.githubusercontent.com/u/${org.handle}?v=4`,
            discord_url: "",
            slack_url: "",
            stargazers_count: 0,
            twitter_url: "",
            youtube_url: "",
            tech: org.tech || [],
            github_handle: owner,
            accepts_sponsorships: false,
            days_until_timeout: null,
            enabled_expert_recs: false,
            enabled_private_bounties: false,
          },
          updated_at: new Date().toISOString(),
          created_at: bountyData.createdAt || new Date().toISOString(),
          visibility: "public",
          autopay_disabled: false,
          tech: bountyData.tech || [],
          bids: [],
          is_external: false,
          manual_assignments: false,
          point_reward: null,
          reward: {
            currency: "USD",
            amount: bountyData.amount || 10000, // Default $100
          },
          reward_formatted: `$${((bountyData.amount || 10000) / 100).toFixed(0)}`,
          reward_tiers: [],
          reward_type: "cash",
          task: {
            id: `task-${org.handle}#${issueNumber}`,
            status: "open",
            type: "issue",
            number: parseInt(issueNumber),
            title: bountyData.title || `Issue #${issueNumber}`,
            source: {
              data: {
                id: `source-${org.handle}#${issueNumber}`,
                user: {
                  id: 0,
                  name: `${org.display_name} Team`,
                  location: "",
                  company: org.display_name,
                  avatar_url: `https://avatars.githubusercontent.com/u/${org.handle}?v=4`,
                  login: `${org.handle}-team`,
                  twitter_username: "",
                  html_url: `https://github.com/${org.handle}-team`,
                },
                title: bountyData.title || `Issue #${issueNumber}`,
                body: bountyData.description || "",
                html_url: fullUrl,
              },
              type: "github",
            },
            hash: `${owner}/${repo}#${issueNumber}`,
            body: bountyData.description || "",
            url: fullUrl,
            tech: bountyData.tech || [],
            repo_name: repo,
            repo_owner: owner,
            forge: "github",
          },
          timeouts_disabled: false,
        };

        bounties.push(bounty);
      }
    }

    console.log(`✅ Extracted ${bounties.length} bounties from ${org.handle}`);
    return bounties;
  }

  private extractBountyContext(markdown: string, githubUrl: string): {
    title?: string;
    amount?: number;
    description?: string;
    tech?: string[];
    createdAt?: string;
  } | null {
    // Find the section containing the GitHub URL
    const lines = markdown.split('\n');
    const urlLineIndex = lines.findIndex(line => line.includes(githubUrl));

    if (urlLineIndex === -1) return null;

    // Look for title and amount in surrounding lines
    const context = lines.slice(Math.max(0, urlLineIndex - 5), urlLineIndex + 5);

    // Extract title (usually in headers or links)
    const titleMatch = context.find(line =>
      line.match(/^#|^\*\*|^\[/) && line.length > 10 && line.length < 100
    );

    // Extract amount (look for currency patterns)
    const amountMatch = context.join(' ').match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    const amount = amountMatch ? Math.round(parseFloat(amountMatch[1].replace(',', '')) * 100) : undefined;

    // Extract tech stack (look for common programming terms)
    const techKeywords = ['typescript', 'javascript', 'react', 'nodejs', 'python', 'rust', 'go', 'java'];
    const tech = techKeywords.filter(keyword =>
      context.join(' ').toLowerCase().includes(keyword)
    );

    return {
      title: titleMatch?.replace(/^[#\*\[]+\s*/, '').replace(/\].*$/, '').trim(),
      amount,
      description: context.join(' ').slice(0, 200),
      tech: tech.length > 0 ? tech : undefined,
    };
  }

  async scrapeOrganizationsBatch(organizations: OrganizationConfig[]): Promise<AlgoraApiResponse> {
    console.log(`🚀 Starting batch scrape of ${organizations.length} organizations`);

    const allBounties: BountyItem[] = [];
    const errors: string[] = [];

    // Process organizations with concurrency limit
    const semaphore = new Array(this.config.maxConcurrent).fill(null);
    const results = await Promise.allSettled(
      organizations.map(async (org, index) => {
        // Wait for available slot
        await semaphore[index % this.config.maxConcurrent];

        try {
          const bounties = await this.scrapeBountyPage(org);
          allBounties.push(...bounties);
        } catch (error) {
          const errorMsg = `Failed to scrape ${org.handle}: ${error.message}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, this.config.rateLimitDelay));
      })
    );

    console.log(`✅ Batch scraping completed`);
    console.log(`   Total bounties found: ${allBounties.length}`);
    console.log(`   Errors encountered: ${errors.length}`);

    return {
      result: {
        data: {
          json: {
            items: allBounties,
            next_cursor: null,
          },
        },
      },
    };
  }

  getStats() {
    return {
      failedUrlsCount: this.failedUrls.size,
      currentKeyIndex: this.currentKeyIndex,
      totalApiKeys: this.apiKeys.length,
      preferSelfHosted: this.config.preferSelfHosted,
      selfHostedUrl: this.config.selfHostedUrl,
    };
  }

  clearFailedUrls() {
    this.failedUrls.clear();
    console.log("🧹 Cleared failed URLs cache");
  }
}