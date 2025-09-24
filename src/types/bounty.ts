/**
 * Algora API Format Type Definitions
 *
 * These types match the exact structure of Algora's API responses for perfect
 * compatibility with bounty-pipe and other downstream consumers.
 */

export interface AlgoraApiResponse {
  result: {
    data: {
      json: {
        items: BountyItem[];
        next_cursor: string | null;
      };
    };
  };
}

export interface BountyItem {
  id: string;
  status: "open" | "in_progress" | "completed" | "closed";
  type: "standard" | "premium" | "featured";
  kind: "dev" | "design" | "content" | "research";
  org: OrganizationData;
  updated_at: string;
  created_at: string;
  visibility: "public" | "private";
  autopay_disabled: boolean;
  tech: string[];
  bids: any[];
  is_external: boolean;
  manual_assignments: boolean;
  point_reward: number | null;
  reward: RewardData;
  reward_formatted: string;
  reward_tiers: any[];
  reward_type: "cash" | "points" | "mixed";
  task: TaskData;
  timeouts_disabled: boolean;
}

export interface OrganizationData {
  handle: string;
  id: string;
  name: string;
  description: string;
  members: any[];
  display_name: string;
  created_at: string;
  website_url: string;
  avatar_url: string;
  discord_url: string;
  slack_url: string;
  stargazers_count: number;
  twitter_url: string;
  youtube_url: string;
  tech: string[];
  github_handle: string;
  accepts_sponsorships: boolean;
  days_until_timeout: number | null;
  enabled_expert_recs: boolean;
  enabled_private_bounties: boolean;
}

export interface RewardData {
  currency: "USD" | "EUR" | "GBP";
  amount: number; // Amount in cents
}

export interface TaskData {
  id: string;
  status: "open" | "in_progress" | "completed";
  type: "issue" | "feature" | "bug" | "enhancement";
  number: number;
  title: string;
  source: TaskSource;
  hash: string;
  body: string;
  url: string;
  tech: string[];
  repo_name: string;
  repo_owner: string;
  forge: "github" | "gitlab" | "bitbucket";
}

export interface TaskSource {
  data: {
    id: string;
    user: {
      id: number;
      name: string;
      location: string;
      company: string;
      avatar_url: string;
      login: string;
      twitter_username: string;
      html_url: string;
    };
    title: string;
    body: string;
    html_url: string;
  };
  type: "github" | "gitlab" | "bitbucket";
}

/**
 * Organization Configuration for Scraping
 *
 * Configuration format for organizations to be scraped, including
 * tier-based scheduling and scraping preferences.
 */
export interface OrganizationConfig {
  handle: string;
  display_name: string;
  url: string;
  active: boolean;
  scrape_interval: number; // seconds
  tier: "highly-active" | "active" | "emerging" | "platform";
  description?: string;
  tech?: string[];
  firecrawl_enabled?: boolean;
}

/**
 * Legacy Format Types (for backward compatibility)
 */
export interface LegacyBounty {
  id: string;
  title: string;
  amount_usd: number;
  url: string;
  status: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface LegacyOrganizationData {
  display_name: string;
  url: string;
  bounty_count: number;
  total_value_usd: number;
  bounties: LegacyBounty[];
  last_updated: string;
  scrape_duration_ms: number;
}

export interface LegacyBountyIndex {
  generated_at: string;
  total_organizations: number;
  total_bounties: number;
  total_value_usd: number;
  version: string;
  organizations: Record<string, LegacyOrganizationData>;
  metadata: {
    success_rate: number;
    processing_time_ms: number;
    scraper_version: string;
    data_format: string;
  };
  stats: {
    avg_bounty_value: number;
    median_bounty_value: number;
    top_organizations: Array<{
      handle: string;
      display_name: string;
      bounty_count: number;
      total_value_usd: number;
    }>;
  };
}