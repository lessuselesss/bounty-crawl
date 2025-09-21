import type { BountyIndex } from "../types.ts";

/**
 * Generates comprehensive statistics from the bounty index
 * Provides insights into bounty distribution, trends, and patterns
 */
export function generateStats(organizations: BountyIndex["organizations"]) {
  const allBounties = Object.values(organizations).flatMap(org => org.bounties);

  if (allBounties.length === 0) {
    return createEmptyStats();
  }

  return {
    by_language: analyzeByLanguage(allBounties),
    by_amount: analyzeByAmount(allBounties),
    by_difficulty: analyzeByDifficulty(allBounties),
    by_status: analyzeByStatus(allBounties),
    organizations_with_bounties: Object.values(organizations).filter(org => org.bounties.length > 0).length,
    organizations_with_errors: Object.values(organizations).filter(org => org.error).length,
    average_bounty_value: calculateAverage(allBounties.map(b => b.amount_usd)),
    median_bounty_value: calculateMedian(allBounties.map(b => b.amount_usd)),
    total_tags: countUniqueTags(allBounties),
    top_tags: getTopTags(allBounties, 10),
    bounty_age_distribution: analyzeBountyAge(allBounties),
    value_distribution: analyzeValueDistribution(allBounties),
  };
}

function createEmptyStats() {
  return {
    by_language: {},
    by_amount: {},
    by_difficulty: {},
    by_status: {},
    organizations_with_bounties: 0,
    organizations_with_errors: 0,
    average_bounty_value: 0,
    median_bounty_value: 0,
    total_tags: 0,
    top_tags: [],
    bounty_age_distribution: {},
    value_distribution: {},
  };
}

function analyzeByLanguage(bounties: any[]) {
  const languageCounts: Record<string, { count: number; total_value: number }> = {};

  for (const bounty of bounties) {
    for (const tag of bounty.tags) {
      // Common programming language tags
      const languages = ['typescript', 'javascript', 'python', 'rust', 'go', 'java', 'react', 'vue', 'angular', 'node'];
      const normalizedTag = tag.toLowerCase();

      if (languages.some(lang => normalizedTag.includes(lang))) {
        if (!languageCounts[normalizedTag]) {
          languageCounts[normalizedTag] = { count: 0, total_value: 0 };
        }
        languageCounts[normalizedTag].count++;
        languageCounts[normalizedTag].total_value += bounty.amount_usd;
      }
    }
  }

  return languageCounts;
}

function analyzeByAmount(bounties: any[]) {
  const ranges = {
    'under_50': 0,
    '50_to_100': 0,
    '100_to_250': 0,
    '250_to_500': 0,
    '500_to_1000': 0,
    'over_1000': 0,
  };

  for (const bounty of bounties) {
    const amount = bounty.amount_usd;
    if (amount < 50) ranges.under_50++;
    else if (amount < 100) ranges['50_to_100']++;
    else if (amount < 250) ranges['100_to_250']++;
    else if (amount < 500) ranges['250_to_500']++;
    else if (amount < 1000) ranges['500_to_1000']++;
    else ranges.over_1000++;
  }

  return ranges;
}

function analyzeByDifficulty(bounties: any[]) {
  const difficulties: Record<string, number> = {};

  for (const bounty of bounties) {
    const difficulty = bounty.difficulty || 'unknown';
    difficulties[difficulty] = (difficulties[difficulty] || 0) + 1;
  }

  return difficulties;
}

function analyzeByStatus(bounties: any[]) {
  const statuses: Record<string, number> = {};

  for (const bounty of bounties) {
    const status = bounty.status || 'unknown';
    statuses[status] = (statuses[status] || 0) + 1;
  }

  return statuses;
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  } else {
    return sorted[middle];
  }
}

function countUniqueTags(bounties: any[]): number {
  const uniqueTags = new Set<string>();

  for (const bounty of bounties) {
    for (const tag of bounty.tags) {
      uniqueTags.add(tag.toLowerCase());
    }
  }

  return uniqueTags.size;
}

function getTopTags(bounties: any[], limit: number): Array<{ tag: string; count: number; total_value: number }> {
  const tagCounts: Record<string, { count: number; total_value: number }> = {};

  for (const bounty of bounties) {
    for (const tag of bounty.tags) {
      const normalizedTag = tag.toLowerCase();
      if (!tagCounts[normalizedTag]) {
        tagCounts[normalizedTag] = { count: 0, total_value: 0 };
      }
      tagCounts[normalizedTag].count++;
      tagCounts[normalizedTag].total_value += bounty.amount_usd;
    }
  }

  return Object.entries(tagCounts)
    .map(([tag, data]) => ({ tag, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function analyzeBountyAge(bounties: any[]) {
  const now = new Date();
  const ageRanges = {
    'less_than_week': 0,
    'week_to_month': 0,
    'month_to_quarter': 0,
    'quarter_to_year': 0,
    'over_year': 0,
  };

  for (const bounty of bounties) {
    if (!bounty.created_at) continue;

    const created = new Date(bounty.created_at);
    const ageMs = now.getTime() - created.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays < 7) ageRanges.less_than_week++;
    else if (ageDays < 30) ageRanges.week_to_month++;
    else if (ageDays < 90) ageRanges.month_to_quarter++;
    else if (ageDays < 365) ageRanges.quarter_to_year++;
    else ageRanges.over_year++;
  }

  return ageRanges;
}

function analyzeValueDistribution(bounties: any[]) {
  const values = bounties.map(b => b.amount_usd).sort((a, b) => a - b);

  if (values.length === 0) {
    return {
      min: 0,
      max: 0,
      percentile_25: 0,
      percentile_75: 0,
      percentile_90: 0,
      percentile_95: 0,
    };
  }

  return {
    min: values[0],
    max: values[values.length - 1],
    percentile_25: getPercentile(values, 0.25),
    percentile_75: getPercentile(values, 0.75),
    percentile_90: getPercentile(values, 0.90),
    percentile_95: getPercentile(values, 0.95),
  };
}

function getPercentile(sortedValues: number[], percentile: number): number {
  const index = percentile * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sortedValues.length) {
    return sortedValues[sortedValues.length - 1];
  }

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}