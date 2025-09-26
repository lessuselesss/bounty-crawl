import type { Bounty, Organization, ScrapingResult } from "../types.ts";
import { Logger } from "../utils/logging.ts";

export class AlgoraScraper {
  private logger: Logger;
  private userAgent: string;
  private rateLimitMs: number;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(options: {
    userAgent?: string;
    rateLimitMs?: number;
    timeoutMs?: number;
    maxRetries?: number;
  } = {}) {
    this.logger = new Logger("AlgoraScraper");
    this.userAgent = options.userAgent ||
      "AlgoraBountyScraper/1.0 (+https://github.com/your-username/algora-bounty-scraper)";
    this.rateLimitMs = options.rateLimitMs || 2000; // 2 seconds between requests
    this.timeoutMs = options.timeoutMs || 30000; // 30 second timeout
    this.maxRetries = options.maxRetries || 3;
  }

  async scrapeOrganization(org: Organization): Promise<ScrapingResult> {
    const startTime = Date.now();

    this.logger.info(`Scraping organization: ${org.handle}`, { organization: org.handle });

    try {
      const bounties = await this.scrapeBountiesFromPage(org.url);
      const totalValue = bounties.reduce((sum, bounty) => sum + bounty.amount_usd, 0);
      const duration = Date.now() - startTime;

      this.logger.info(
        `Successfully scraped ${bounties.length} bounties for ${org.handle}`,
        {
          organization: org.handle,
          bountyCount: bounties.length,
          totalValue,
          duration,
        },
      );

      return {
        organization: org.handle,
        success: true,
        bounties,
        total_value_usd: totalValue,
        scrape_duration_ms: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Failed to scrape ${org.handle}: ${errorMessage}`, {
        organization: org.handle,
        error: errorMessage,
        duration,
      });

      return {
        organization: org.handle,
        success: false,
        bounties: [],
        total_value_usd: 0,
        scrape_duration_ms: duration,
        error: errorMessage,
      };
    }
  }

  private async scrapeBountiesFromPage(url: string): Promise<Bounty[]> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.maxRetries) {
      try {
        await this.rateLimit();

        const response = await fetch(url, {
          headers: {
            "User-Agent": this.userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        return this.parseBountiesFromHTML(html, url);
      } catch (error) {
        attempt++;
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff
          this.logger.warn(
            `Attempt ${attempt} failed, retrying in ${delay}ms: ${lastError.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Unknown error during scraping");
  }

  private parseBountiesFromHTML(html: string, baseUrl: string): Bounty[] {
    const bounties: Bounty[] = [];

    try {
      // Extract bounty IDs from phx-value-id attributes
      const idMatches = html.matchAll(/phx-value-id="([^"]+)"/g);
      const bountyIds = new Set<string>();

      for (const match of idMatches) {
        bountyIds.add(match[1]);
      }

      this.logger.debug(`Found ${bountyIds.size} unique bounty IDs in HTML`);

      // Extract bounty amounts (look for dollar amounts)
      const amountMatches = html.matchAll(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g);
      const amounts: number[] = [];

      for (const match of amountMatches) {
        const amount = parseFloat(match[1].replace(/,/g, ""));
        if (amount > 0) {
          amounts.push(amount);
        }
      }

      // Extract issue/repository information
      const repoMatches = html.matchAll(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/g);
      const repoInfo: Array<{ owner: string; name: string; issueNumber: number }> = [];

      for (const match of repoMatches) {
        repoInfo.push({
          owner: match[1],
          name: match[2],
          issueNumber: parseInt(match[3]),
        });
      }

      // Extract titles (look for issue titles in various patterns)
      const titlePatterns = [
        /<title>([^<]+)<\/title>/g,
        /class="[^"]*title[^"]*"[^>]*>([^<]+)</g,
        /href="[^"]*github\.com[^"]*"[^>]*>([^<]+)</g,
      ];

      const titles: string[] = [];
      for (const pattern of titlePatterns) {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
          const title = match[1].trim();
          if (title && title.length > 10 && !title.includes("Algora")) {
            titles.push(title);
          }
        }
      }

      // Combine extracted data into bounties
      const bountyIdsArray = Array.from(bountyIds);
      const maxItems = Math.max(bountyIdsArray.length, amounts.length, repoInfo.length);

      for (let i = 0; i < maxItems; i++) {
        const id = bountyIdsArray[i] || `unknown-${i}`;
        const amount = amounts[i] || 0;
        const repo = repoInfo[i];

        // Fetch real GitHub issue title if we have repo info
        let title = titles[i] || `Bounty ${i + 1}`;
        if (repo) {
          try {
            const githubTitle = await this.fetchGitHubIssueTitle(repo.owner, repo.name, repo.issueNumber);
            if (githubTitle) {
              title = githubTitle;
            }
          } catch (error) {
            this.logger.warn(`Failed to fetch GitHub title for ${repo.owner}/${repo.name}#${repo.issueNumber}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        if (amount > 0) { // Only include bounties with valid amounts
          const bounty: Bounty = {
            id,
            title: this.cleanTitle(title),
            amount_usd: amount,
            amount_formatted: `$${amount}`,
            status: "open", // Default to open since we're scraping open bounties
            updated_at: new Date().toISOString(),
            url: repo
              ? `https://github.com/${repo.owner}/${repo.name}/issues/${repo.issueNumber}`
              : baseUrl,
            tags: this.extractTags(title, repo),
            repository: repo ? {
              owner: repo.owner,
              name: repo.name,
              url: `https://github.com/${repo.owner}/${repo.name}`,
            } : undefined,
            issue_number: repo?.issueNumber,
            difficulty: this.inferDifficulty(amount, title),
          };

          bounties.push(bounty);
        }
      }

      // Deduplicate bounties by ID
      const uniqueBounties = bounties.filter((bounty, index, self) =>
        index === self.findIndex(b => b.id === bounty.id)
      );

      this.logger.debug(`Parsed ${uniqueBounties.length} unique bounties from HTML`);
      return uniqueBounties;

    } catch (error) {
      this.logger.error(`Error parsing HTML: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/^\s*\[.*?\]\s*/, "") // Remove issue labels like [Bug], [Feature]
      .replace(/\s*·\s*Algora.*$/, "") // Remove Algora suffix
      .replace(/\s*\|\s*.*$/, "") // Remove pipe separators
      .trim();
  }

  private extractTags(title: string, repo?: { owner: string; name: string }): string[] {
    const tags: string[] = [];

    // Extract from repository name
    if (repo) {
      tags.push(repo.name.toLowerCase());

      // Language/framework tags based on repo name patterns
      const languageTags = {
        "zio": ["scala", "functional"],
        "react": ["javascript", "frontend"],
        "vue": ["javascript", "frontend"],
        "angular": ["javascript", "typescript", "frontend"],
        "spring": ["java", "backend"],
        "django": ["python", "backend"],
        "rails": ["ruby", "backend"],
        "express": ["javascript", "nodejs", "backend"],
      };

      for (const [pattern, langTags] of Object.entries(languageTags)) {
        if (repo.name.toLowerCase().includes(pattern)) {
          tags.push(...langTags);
        }
      }
    }

    // Extract from title
    const titleLower = title.toLowerCase();

    // Common technology tags
    const techTags = [
      "api", "frontend", "backend", "database", "ui", "ux", "performance",
      "security", "testing", "documentation", "bug", "feature", "enhancement",
      "typescript", "javascript", "python", "java", "scala", "rust", "go",
      "react", "vue", "angular", "svelte", "docker", "kubernetes",
    ];

    for (const tag of techTags) {
      if (titleLower.includes(tag)) {
        tags.push(tag);
      }
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  private inferDifficulty(amount: number, title: string): "beginner" | "intermediate" | "advanced" | "expert" {
    // Base difficulty on amount
    if (amount >= 2000) return "expert";
    if (amount >= 1000) return "advanced";
    if (amount >= 500) return "intermediate";

    // Check title for complexity indicators
    const titleLower = title.toLowerCase();
    const complexTerms = ["architecture", "algorithm", "optimization", "performance", "security"];
    const simpleTerms = ["fix", "update", "add", "simple", "minor"];

    if (complexTerms.some(term => titleLower.includes(term))) {
      return amount >= 200 ? "advanced" : "intermediate";
    }

    if (simpleTerms.some(term => titleLower.includes(term))) {
      return "beginner";
    }

    return amount >= 200 ? "intermediate" : "beginner";
  }

  private async fetchGitHubIssueTitle(owner: string, repo: string, issueNumber: number): Promise<string | null> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept": "application/vnd.github.v3+json",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout for GitHub API
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.warn(`GitHub issue not found: ${owner}/${repo}#${issueNumber}`);
          return null;
        }
        throw new Error(`GitHub API responded with ${response.status}: ${response.statusText}`);
      }

      const issue = await response.json();
      return issue.title || null;
    } catch (error) {
      this.logger.warn(`Failed to fetch GitHub issue title: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async rateLimit(): Promise<void> {
    if (this.rateLimitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.rateLimitMs));
    }
  }
}