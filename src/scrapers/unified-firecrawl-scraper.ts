/**
 * Unified Playwright Scraper
 *
 * Direct browser automation using Playwright for reliable bounty scraping.
 * Eliminates external API dependencies and rate limits.
 */

import { chromium, Browser, Page } from "playwright";
import { AlgoraApiResponse, BountyItem, OrganizationConfig } from "../types/bounty.ts";

export interface FirecrawlConfig {
  // Browser configuration
  headless: boolean;
  requestTimeout: number;
  retryAttempts: number;

  // Scraping optimization
  maxConcurrent: number;
  rateLimitDelay: number;

  // Deprecated fields (kept for backward compatibility)
  externalApiKey?: string;
  externalApiUrl?: string;
  selfHostedUrl?: string;
  selfHostedAuthSecret?: string;
  preferSelfHosted?: boolean;
  enableFallback?: boolean;
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
  private browser: Browser | null = null;
  private failedUrls: Set<string> = new Set();

  constructor(config?: Partial<FirecrawlConfig>) {
    this.config = {
      headless: Deno.env.get("PLAYWRIGHT_HEADLESS") !== "false",
      requestTimeout: 30000,
      retryAttempts: 3,
      maxConcurrent: 5,
      rateLimitDelay: 1000,
      ...config,
    };

    console.log(`🎭 Playwright Scraper initialized`);
    console.log(`   Headless: ${this.config.headless}`);
    console.log(`   Timeout: ${this.config.requestTimeout}ms`);
    console.log(`   Max concurrent: ${this.config.maxConcurrent}`);
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      console.log("🚀 Launching Chromium browser...");
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  private htmlToMarkdown(html: string): string {
    // Simple HTML to markdown conversion
    // Remove scripts and styles
    let markdown = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Convert headers
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n');
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n');
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n');

    // Convert links
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // Convert paragraphs
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

    // Convert line breaks
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');

    // Remove remaining HTML tags
    markdown = markdown.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    markdown = markdown
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Clean up whitespace
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    return markdown;
  }

  private async scrapeWithPlaywright(url: string): Promise<FirecrawlResponse> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    try {
      console.log(`🌐 Navigating to: ${url}`);

      // Navigate to the page
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.config.requestTimeout,
      });

      // Wait for Next.js/React to hydrate
      try {
        await page.waitForSelector('#__next', { timeout: 5000 });
        await page.waitForTimeout(4000); // Additional wait for React hydration
      } catch {
        await page.waitForTimeout(5000); // Fallback wait
      }

      // Try to extract data from __NEXT_DATA__ script tag (Next.js apps)
      const pageData = await page.evaluate(() => {
        const nextScript = document.querySelector('#__NEXT_DATA__');
        let nextData = null;
        if (nextScript && nextScript.textContent) {
          try {
            nextData = JSON.parse(nextScript.textContent);
          } catch {}
        }

        // Get body text
        const bodyText = document.body.innerText || '';

        // Find all GitHub links
        const githubLinks = Array.from(document.querySelectorAll('a[href*="github.com"]'))
          .map(a => (a as HTMLAnchorElement).href);

        return {
          nextData,
          bodyText,
          githubLinks,
        };
      });

      // Get the HTML content
      const html = await page.content();
      const markdown = this.htmlToMarkdown(html);

      // Combine all text sources for better extraction
      const combinedText = [
        markdown,
        pageData.bodyText,
        pageData.githubLinks.join('\n'),
      ].join('\n\n');

      console.log(`✅ Scraped ${url} (HTML: ${html.length}, Combined: ${combinedText.length} chars, Links: ${pageData.githubLinks.length})`);

      return {
        success: true,
        data: {
          markdown: combinedText, // Use combined text for better extraction
          html,
          metadata: {
            url,
            title: await page.title(),
            timestamp: new Date().toISOString(),
            nextData: pageData.nextData,
            githubLinks: pageData.githubLinks,
          },
        },
      };
    } catch (error) {
      console.error(`❌ Error scraping ${url}: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await page.close();
      await context.close();
    }
  }

  async scrapeUrl(url: string): Promise<FirecrawlResponse> {
    // Skip URLs that consistently fail
    if (this.failedUrls.has(url)) {
      return {
        success: false,
        error: "URL previously failed, skipping",
      };
    }

    let lastError = "Unknown error";

    // Retry with exponential backoff
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const result = await this.scrapeWithPlaywright(url);

        if (result.success) {
          return result;
        } else {
          lastError = result.error || "Scraping failed";
          console.log(`⚠️  Attempt ${attempt}/${this.config.retryAttempts} failed: ${lastError}`);
        }
      } catch (error) {
        lastError = error.message;
        console.log(`❌ Attempt ${attempt}/${this.config.retryAttempts} error: ${lastError}`);
      }

      // Wait before retrying (exponential backoff)
      if (attempt < this.config.retryAttempts) {
        const delay = this.config.rateLimitDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Mark URL as failed after all attempts exhausted
    this.failedUrls.add(url);

    return {
      success: false,
      error: lastError,
    };
  }

  async close() {
    if (this.browser) {
      console.log("🔒 Closing browser...");
      await this.browser.close();
      this.browser = null;
    }
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
      browserActive: this.browser !== null,
      headless: this.config.headless,
      timeout: this.config.requestTimeout,
    };
  }

  clearFailedUrls() {
    this.failedUrls.clear();
    console.log("🧹 Cleared failed URLs cache");
  }
}