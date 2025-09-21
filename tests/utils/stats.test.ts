import { assertEquals } from "@std/assert";
import { generateStats } from "../../src/utils/stats.ts";
import type { BountyIndex, Bounty } from "../../src/types.ts";

// Test data factory
const createMockBounty = (
  id: string,
  amount: number,
  tags: string[] = [],
  createdDaysAgo: number = 0
): Bounty => ({
  id,
  title: `Bounty ${id}`,
  amount_usd: amount,
  url: `https://github.com/test/repo/issues/${id}`,
  status: "open",
  tags,
  difficulty: "medium",
  created_at: new Date(Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date().toISOString(),
});

const createMockOrganizations = (bounties: Bounty[]): BountyIndex["organizations"] => ({
  "test-org": {
    display_name: "Test Organization",
    url: "https://algora.io/test-org/bounties?status=open",
    bounty_count: bounties.length,
    total_value_usd: bounties.reduce((sum, b) => sum + b.amount_usd, 0),
    last_updated: new Date().toISOString(),
    scrape_duration_ms: 1000,
    bounties,
  },
});

Deno.test("generateStats - Empty bounties", () => {
  const organizations = createMockOrganizations([]);
  const stats = generateStats(organizations);

  assertEquals(stats.organizations_with_bounties, 0);
  assertEquals(stats.organizations_with_errors, 0);
  assertEquals(stats.average_bounty_value, 0);
  assertEquals(stats.median_bounty_value, 0);
  assertEquals(stats.total_tags, 0);
  assertEquals(stats.top_tags.length, 0);
});

Deno.test("generateStats - Basic statistics", () => {
  const bounties = [
    createMockBounty("b1", 100, ["typescript", "react"]),
    createMockBounty("b2", 200, ["javascript", "vue"]),
    createMockBounty("b3", 150, ["python", "django"]),
  ];

  const organizations = createMockOrganizations(bounties);
  const stats = generateStats(organizations);

  assertEquals(stats.organizations_with_bounties, 1);
  assertEquals(stats.organizations_with_errors, 0);
  assertEquals(stats.average_bounty_value, 150); // (100 + 200 + 150) / 3
  assertEquals(stats.median_bounty_value, 150);
  assertEquals(stats.total_tags, 6); // All unique tags
});

Deno.test("generateStats - Amount distribution", () => {
  const bounties = [
    createMockBounty("b1", 25),   // under_50
    createMockBounty("b2", 75),   // 50_to_100
    createMockBounty("b3", 150),  // 100_to_250
    createMockBounty("b4", 300),  // 250_to_500
    createMockBounty("b5", 750),  // 500_to_1000
    createMockBounty("b6", 1500), // over_1000
  ];

  const organizations = createMockOrganizations(bounties);
  const stats = generateStats(organizations);

  assertEquals(stats.by_amount.under_50, 1);
  assertEquals(stats.by_amount["50_to_100"], 1);
  assertEquals(stats.by_amount["100_to_250"], 1);
  assertEquals(stats.by_amount["250_to_500"], 1);
  assertEquals(stats.by_amount["500_to_1000"], 1);
  assertEquals(stats.by_amount.over_1000, 1);
});

Deno.test("generateStats - Language analysis", () => {
  const bounties = [
    createMockBounty("b1", 100, ["typescript", "frontend"]),
    createMockBounty("b2", 200, ["typescript", "backend"]),
    createMockBounty("b3", 150, ["javascript", "react"]),
    createMockBounty("b4", 300, ["python", "machine-learning"]),
  ];

  const organizations = createMockOrganizations(bounties);
  const stats = generateStats(organizations);

  assertEquals(stats.by_language.typescript.count, 2);
  assertEquals(stats.by_language.typescript.total_value, 300);
  assertEquals(stats.by_language.javascript.count, 1);
  assertEquals(stats.by_language.javascript.total_value, 150);
});

Deno.test("generateStats - Top tags", () => {
  const bounties = [
    createMockBounty("b1", 100, ["typescript", "frontend"]),
    createMockBounty("b2", 200, ["typescript", "backend"]),
    createMockBounty("b3", 150, ["frontend", "react"]),
    createMockBounty("b4", 250, ["backend", "api"]),
    createMockBounty("b5", 300, ["typescript", "fullstack"]),
  ];

  const organizations = createMockOrganizations(bounties);
  const stats = generateStats(organizations);

  assertEquals(stats.top_tags.length > 0, true);

  // TypeScript should be the top tag (appears 3 times)
  const topTag = stats.top_tags[0];
  assertEquals(topTag.tag, "typescript");
  assertEquals(topTag.count, 3);
  assertEquals(topTag.total_value, 600); // 100 + 200 + 300
});

Deno.test("generateStats - Bounty age distribution", () => {
  const bounties = [
    createMockBounty("b1", 100, [], 3),   // 3 days ago - less_than_week
    createMockBounty("b2", 200, [], 15),  // 15 days ago - week_to_month
    createMockBounty("b3", 150, [], 60),  // 60 days ago - month_to_quarter
    createMockBounty("b4", 250, [], 180), // 180 days ago - quarter_to_year
    createMockBounty("b5", 300, [], 400), // 400 days ago - over_year
  ];

  const organizations = createMockOrganizations(bounties);
  const stats = generateStats(organizations);

  assertEquals(stats.bounty_age_distribution.less_than_week, 1);
  assertEquals(stats.bounty_age_distribution.week_to_month, 1);
  assertEquals(stats.bounty_age_distribution.month_to_quarter, 1);
  assertEquals(stats.bounty_age_distribution.quarter_to_year, 1);
  assertEquals(stats.bounty_age_distribution.over_year, 1);
});

Deno.test("generateStats - Value distribution percentiles", () => {
  const bounties = [
    createMockBounty("b1", 50),
    createMockBounty("b2", 100),
    createMockBounty("b3", 150),
    createMockBounty("b4", 200),
    createMockBounty("b5", 250),
    createMockBounty("b6", 300),
    createMockBounty("b7", 400),
    createMockBounty("b8", 500),
    createMockBounty("b9", 750),
    createMockBounty("b10", 1000),
  ];

  const organizations = createMockOrganizations(bounties);
  const stats = generateStats(organizations);

  assertEquals(stats.value_distribution.min, 50);
  assertEquals(stats.value_distribution.max, 1000);
  assertEquals(stats.value_distribution.percentile_25, 175); // 25th percentile
  assertEquals(stats.value_distribution.percentile_75, 475); // 75th percentile
  assertEquals(stats.value_distribution.percentile_90, 850); // 90th percentile
  assertEquals(stats.value_distribution.percentile_95, 925); // 95th percentile
});

Deno.test("generateStats - Median calculation", () => {
  // Test odd number of values
  const oddBounties = [
    createMockBounty("b1", 100),
    createMockBounty("b2", 200),
    createMockBounty("b3", 300),
  ];

  let organizations = createMockOrganizations(oddBounties);
  let stats = generateStats(organizations);
  assertEquals(stats.median_bounty_value, 200);

  // Test even number of values
  const evenBounties = [
    createMockBounty("b1", 100),
    createMockBounty("b2", 200),
    createMockBounty("b3", 300),
    createMockBounty("b4", 400),
  ];

  organizations = createMockOrganizations(evenBounties);
  stats = generateStats(organizations);
  assertEquals(stats.median_bounty_value, 250); // (200 + 300) / 2
});

Deno.test("generateStats - Organizations with errors", () => {
  const organizations: BountyIndex["organizations"] = {
    "success-org": {
      display_name: "Success Organization",
      url: "https://algora.io/success-org/bounties?status=open",
      bounty_count: 2,
      total_value_usd: 300,
      last_updated: new Date().toISOString(),
      scrape_duration_ms: 1000,
      bounties: [
        createMockBounty("b1", 100),
        createMockBounty("b2", 200),
      ],
    },
    "error-org": {
      display_name: "Error Organization",
      url: "https://algora.io/error-org/bounties?status=open",
      bounty_count: 0,
      total_value_usd: 0,
      last_updated: new Date().toISOString(),
      scrape_duration_ms: 1000,
      bounties: [],
      error: "Failed to scrape",
    },
  };

  const stats = generateStats(organizations);

  assertEquals(stats.organizations_with_bounties, 1);
  assertEquals(stats.organizations_with_errors, 1);
});

Deno.test("generateStats - Case insensitive tag handling", () => {
  const bounties = [
    createMockBounty("b1", 100, ["TypeScript", "FRONTEND"]),
    createMockBounty("b2", 200, ["typescript", "frontend"]),
    createMockBounty("b3", 150, ["JavaScript", "React"]),
  ];

  const organizations = createMockOrganizations(bounties);
  const stats = generateStats(organizations);

  // Tags should be normalized to lowercase
  assertEquals(stats.total_tags, 4); // typescript, frontend, javascript, react (all unique)

  const topTags = stats.top_tags;
  const typescriptTag = topTags.find(tag => tag.tag === "typescript");
  const frontendTag = topTags.find(tag => tag.tag === "frontend");

  assertEquals(typescriptTag?.count, 2);
  assertEquals(frontendTag?.count, 2);
});