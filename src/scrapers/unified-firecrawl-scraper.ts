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
        await page.waitForSelector('#__next', { timeout: 10000 });
      } catch {
        console.log(`⚠️  No #__next found for ${url}, waiting anyway`);
      }

      // Wait for content to actually load (multiple attempts)
      let contentLoaded = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await page.waitForTimeout(attempt * 2000); // Progressive wait: 2s, 4s, 6s

        const linkCount = await page.evaluate(() => {
          return document.querySelectorAll('a[href*="github.com/"][href*="/issues/"]').length;
        });

        if (linkCount > 0) {
          console.log(`✅ Found ${linkCount} issue links on attempt ${attempt}`);
          contentLoaded = true;
          break;
        }

        if (attempt < 3) {
          console.log(`⏳ Attempt ${attempt}: No issue links yet, waiting longer...`);
        }
      }

      if (!contentLoaded) {
        console.log(`⚠️  No issue links found after 3 attempts (12s total) for ${url}`);
      }

      // Final wait for any late-loading content
      await page.waitForTimeout(1000);

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

        // Find all GitHub links - prioritize issue/PR links
        const allGithubLinks = Array.from(document.querySelectorAll('a[href*="github.com"]'))
          .map(a => (a as HTMLAnchorElement).href)
          .filter(href => href && href.trim().length > 0);

        // Separate issue/PR links from other GitHub links
        const issueLinks = allGithubLinks.filter(href =>
          href.includes('/issues/') || href.includes('/pull/')
        );
        const otherLinks = allGithubLinks.filter(href =>
          !href.includes('/issues/') && !href.includes('/pull/')
        );

        // Prefer issue/PR links, but include others if no issues found
        const githubLinks = issueLinks.length > 0 ? issueLinks : allGithubLinks;

        return {
          nextData,
          bodyText,
          githubLinks,
          linkStats: {
            total: allGithubLinks.length,
            issues: issueLinks.length,
            other: otherLinks.length
          }
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

      console.log(`✅ Scraped ${url} (HTML: ${html.length}, Text: ${combinedText.length} chars, Issues: ${pageData.linkStats.issues}, Other: ${pageData.linkStats.other})`);

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

    // Try Algora API first (best approach - no scraping needed!)
    try {
      const bounties = await this.fetchFromAlgoraAPI(org);
      if (bounties.length > 0) {
        console.log(`✅ Fetched ${bounties.length} bounties from Algora API for ${org.handle}`);
        return bounties;
      }
    } catch (error) {
      console.log(`⚠️  Algora API fetch failed for ${org.handle}: ${error.message}, falling back to scraping`);
    }

    // Fallback: Try scraping with Playwright
    const result = await this.scrapeUrl(org.url);

    if (!result.success || !result.data) {
      console.log(`❌ Failed to scrape ${org.handle}: ${result.error}`);
      return [];
    }

    // Try to extract from __NEXT_DATA__ first (more reliable)
    if (result.data.metadata?.nextData) {
      const bounties = this.extractBountiesFromNextData(result.data.metadata.nextData, org);
      if (bounties.length > 0) {
        console.log(`✅ Extracted ${bounties.length} bounties from __NEXT_DATA__ for ${org.handle}`);
        return bounties;
      }
    }

    // Fallback to markdown extraction
    if (result.data.markdown) {
      return this.extractBountiesFromMarkdown(result.data.markdown, org);
    }

    console.log(`⚠️  No bounties found for ${org.handle}`);
    return [];
  }

  private async fetchFromAlgoraAPI(org: OrganizationConfig): Promise<BountyItem[]> {
    const apiUrl = `https://console.algora.io/api/orgs/${org.handle}/bounties?limit=100`;
    console.log(`📡 Fetching from Algora API: ${apiUrl}`);

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const bounties: BountyItem[] = [];

    for (const item of data.items || []) {
      // Only include active bounties
      if (item.status !== "active") continue;

      const bounty: BountyItem = {
        id: item.id,
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
          created_at: item.created_at || new Date().toISOString(),
          website_url: "",
          avatar_url: `https://avatars.githubusercontent.com/u/${org.handle}?v=4`,
          discord_url: "",
          slack_url: "",
          stargazers_count: 0,
          twitter_url: "",
          youtube_url: "",
          tech: org.tech || [],
          github_handle: item.repo_owner,
          accepts_sponsorships: false,
          days_until_timeout: null,
          enabled_expert_recs: false,
          enabled_private_bounties: false,
        },
        updated_at: item.updated_at || new Date().toISOString(),
        created_at: item.created_at || new Date().toISOString(),
        visibility: "public",
        autopay_disabled: false,
        tech: [],
        bids: [],
        is_external: false,
        manual_assignments: false,
        point_reward: null,
        reward: {
          currency: item.currency || "USD",
          amount: item.amount,
        },
        reward_formatted: `$${(item.amount / 100).toFixed(0)}`,
        reward_tiers: [],
        reward_type: "cash",
        task: {
          id: `task-${item.id}`,
          status: "open",
          type: "issue",
          number: item.issue?.number || 0,
          title: item.issue?.title || `Issue #${item.issue?.number || 0}`,
          source: {
            data: {
              id: `source-${item.id}`,
              user: {
                id: item.issue?.user?.id || 0,
                name: item.issue?.user?.login || `${org.display_name} Team`,
                location: "",
                company: org.display_name,
                avatar_url: item.issue?.user?.avatar_url || `https://avatars.githubusercontent.com/u/${org.handle}?v=4`,
                login: item.issue?.user?.login || `${org.handle}-team`,
                twitter_username: "",
                html_url: item.issue?.user?.html_url || `https://github.com/${org.handle}-team`,
              },
              title: item.issue?.title || `Issue #${item.issue?.number || 0}`,
              body: item.issue?.body || "",
              html_url: item.issue?.html_url || "",
            },
            type: "github",
          },
          hash: `${item.repo_owner}/${item.repo_name}#${item.issue?.number || 0}`,
          body: item.issue?.body || "",
          url: item.issue?.html_url || "",
          tech: [],
          repo_name: item.repo_name,
          repo_owner: item.repo_owner,
          forge: "github",
        },
        timeouts_disabled: false,
      };

      bounties.push(bounty);
    }

    return bounties;
  }

  private extractBountiesFromNextData(nextData: any, org: OrganizationConfig): BountyItem[] {
    const bounties: BountyItem[] = [];

    try {
      // Next.js data structure: nextData.props.pageProps usually contains the data
      const pageProps = nextData?.props?.pageProps;
      if (!pageProps) {
        console.log(`⚠️  No pageProps found in __NEXT_DATA__`);
        return bounties;
      }

      // Look for bounties in common locations
      const bountyList = pageProps.bounties || pageProps.items || pageProps.data || [];

      console.log(`🔍 Found ${bountyList.length} potential bounties in __NEXT_DATA__`);

      for (const item of bountyList) {
        // Extract task/issue information
        const task = item.task || item;
        const issueUrl = task.url || task.html_url || task.source?.data?.html_url;

        if (!issueUrl || !issueUrl.includes('github.com')) {
          continue;
        }

        // Parse GitHub URL
        const githubMatch = issueUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/);
        if (!githubMatch) {
          continue;
        }

        const [_, owner, repo, issueNumber] = githubMatch;

        // Extract reward information
        const reward = item.reward || {};
        const rewardAmount = reward.amount || 10000; // Default $100 in cents
        const rewardCurrency = reward.currency || "USD";

        // Create bounty item
        const bounty: BountyItem = {
          id: item.id || `${org.handle}#${issueNumber}`,
          status: item.status || "open",
          type: item.type || "standard",
          kind: item.kind || "dev",
          org: item.org || {
            handle: org.handle,
            id: `generated-${org.handle}`,
            name: org.display_name,
            description: org.description || "",
            members: [],
            display_name: org.display_name,
            created_at: item.created_at || new Date().toISOString(),
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
          updated_at: item.updated_at || new Date().toISOString(),
          created_at: item.created_at || new Date().toISOString(),
          visibility: item.visibility || "public",
          autopay_disabled: item.autopay_disabled || false,
          tech: item.tech || task.tech || [],
          bids: item.bids || [],
          is_external: item.is_external || false,
          manual_assignments: item.manual_assignments || false,
          point_reward: item.point_reward || null,
          reward: {
            currency: rewardCurrency,
            amount: rewardAmount,
          },
          reward_formatted: `$${(rewardAmount / 100).toFixed(0)}`,
          reward_tiers: item.reward_tiers || [],
          reward_type: item.reward_type || "cash",
          task: {
            id: task.id || `task-${org.handle}#${issueNumber}`,
            status: task.status || "open",
            type: task.type || "issue",
            number: parseInt(issueNumber),
            title: task.title || task.source?.data?.title || `Issue #${issueNumber}`,
            source: task.source || {
              data: {
                id: `source-${org.handle}#${issueNumber}`,
                user: task.source?.data?.user || {
                  id: 0,
                  name: `${org.display_name} Team`,
                  location: "",
                  company: org.display_name,
                  avatar_url: `https://avatars.githubusercontent.com/u/${org.handle}?v=4`,
                  login: `${org.handle}-team`,
                  twitter_username: "",
                  html_url: `https://github.com/${org.handle}-team`,
                },
                title: task.title || `Issue #${issueNumber}`,
                body: task.body || task.source?.data?.body || "",
                html_url: issueUrl,
              },
              type: "github",
            },
            hash: `${owner}/${repo}#${issueNumber}`,
            body: task.body || "",
            url: issueUrl,
            tech: task.tech || [],
            repo_name: repo,
            repo_owner: owner,
            forge: "github",
          },
          timeouts_disabled: item.timeouts_disabled || false,
        };

        bounties.push(bounty);
      }
    } catch (error) {
      console.error(`❌ Error extracting bounties from __NEXT_DATA__: ${error.message}`);
    }

    return bounties;
  }

  private async fetchGitHubIssue(owner: string, repo: string, issueNumber: string): Promise<any> {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  private async extractBountiesFromMarkdown(markdown: string, org: OrganizationConfig): Promise<BountyItem[]> {
    const bounties: BountyItem[] = [];

    // Look for GitHub issue patterns in the markdown
    const githubIssuePattern = /github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/g;
    const matches = [...markdown.matchAll(githubIssuePattern)];

    for (const match of matches) {
      const [fullUrl, owner, repo, issueNumber] = match;

      // Fetch actual issue data from GitHub
      const issueData = await this.fetchGitHubIssue(owner, repo, issueNumber);

      // Extract title and amount from surrounding context
      const bountyData = this.extractBountyContext(markdown, fullUrl);

      if (bountyData || issueData) {
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
            title: issueData?.title || bountyData?.title || `Issue #${issueNumber}`,
            source: {
              data: {
                id: `source-${org.handle}#${issueNumber}`,
                user: issueData?.user || {
                  id: 0,
                  name: `${org.display_name} Team`,
                  location: "",
                  company: org.display_name,
                  avatar_url: `https://avatars.githubusercontent.com/u/${org.handle}?v=4`,
                  login: `${org.handle}-team`,
                  twitter_username: "",
                  html_url: `https://github.com/${org.handle}-team`,
                },
                title: issueData?.title || bountyData?.title || `Issue #${issueNumber}`,
                body: issueData?.body || bountyData?.description || "",
                html_url: issueData?.html_url || fullUrl,
              },
              type: "github",
            },
            hash: `${owner}/${repo}#${issueNumber}`,
            body: issueData?.body || bountyData?.description || "",
            url: issueData?.html_url || fullUrl,
            tech: bountyData?.tech || [],
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