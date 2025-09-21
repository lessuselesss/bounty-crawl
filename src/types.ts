// Type definitions for the Algora Bounty Scraper

export interface Organization {
  handle: string;
  display_name: string;
  url: string;
  last_scraped?: string;
  active: boolean;
  scrape_interval: number; // seconds
  error_count?: number;
  last_error?: string;
}

export interface Bounty {
  id: string;
  title: string;
  amount_usd: number;
  amount_formatted: string;
  status: "open" | "claimed" | "paid" | "closed";
  created_at?: string;
  updated_at: string;
  url: string;
  description?: string;
  tags: string[];
  attempt_count?: number;
  difficulty?: "beginner" | "intermediate" | "advanced" | "expert";
  repository?: {
    owner: string;
    name: string;
    url: string;
  };
  issue_number?: number;
}

export interface OrganizationBounties {
  display_name: string;
  url: string;
  bounty_count: number;
  total_value_usd: number;
  last_updated: string;
  scrape_duration_ms?: number;
  error?: string;
  bounties: Bounty[];
}

export interface BountyIndex {
  generated_at: string;
  total_organizations: number;
  total_bounties: number;
  total_value_usd: number;
  last_change?: string;
  version: string;
  organizations: Record<string, OrganizationBounties>;
  stats: {
    by_language: Record<string, { count: number; total_value: number }>;
    by_amount: Record<string, number>;
    by_difficulty: Record<string, number>;
    by_status: Record<string, number>;
    organizations_with_bounties: number;
    organizations_with_errors: number;
    average_bounty_value: number;
    median_bounty_value: number;
  };
  metadata: {
    scraper_version: string;
    scrape_duration_ms: number;
    success_rate: number;
    last_full_scan: string;
  };
}

export interface OrganizationList {
  updated_at: string;
  version: string;
  organizations: Organization[];
}

export interface ScrapingResult {
  organization: string;
  success: boolean;
  bounties: Bounty[];
  total_value_usd: number;
  scrape_duration_ms: number;
  error?: string;
}

export interface ChangeDetection {
  has_changes: boolean;
  added_bounties: Bounty[];
  removed_bounties: Bounty[];
  updated_bounties: Array<{
    old: Bounty;
    new: Bounty;
    changes: string[];
  }>;
  organizations_added: string[];
  organizations_removed: string[];
  summary: string;
}

export interface ScraperConfig {
  user_agent: string;
  rate_limit_ms: number;
  timeout_ms: number;
  max_retries: number;
  parallel_limit: number;
  enable_change_detection: boolean;
  enable_archiving: boolean;
  archive_interval_hours: number;
  enable_stats: boolean;
  github_integration: {
    enabled: boolean;
    auto_commit: boolean;
    commit_message_template: string;
  };
}

export interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  organization?: string;
  duration_ms?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}