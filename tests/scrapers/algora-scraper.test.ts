import { assertEquals, assertExists, assertMatch } from "@std/assert";
import { AlgoraScraper } from "../../src/scrapers/algora-scraper.ts";
import type { Organization } from "../../src/types.ts";

// Mock HTML for testing
const MOCK_BOUNTY_HTML = `
<div class="bounty-item" phx-value-id="b123">
  <div class="bounty-title">Test Bounty Title</div>
  <div class="bounty-amount">$150</div>
  <div class="bounty-tags">
    <span class="tag">typescript</span>
    <span class="tag">react</span>
  </div>
  <div class="bounty-url">
    <a href="https://github.com/test/repo/issues/123">GitHub Issue</a>
  </div>
</div>
<div class="bounty-item" phx-value-id="b456">
  <div class="bounty-title">Another Bounty</div>
  <div class="bounty-amount">$75</div>
  <div class="bounty-tags">
    <span class="tag">javascript</span>
  </div>
  <div class="bounty-url">
    <a href="https://github.com/test/repo/issues/456">GitHub Issue</a>
  </div>
</div>
`;

const EMPTY_BOUNTY_HTML = `
<div class="container">
  <h1>No bounties found</h1>
  <p>This organization has no open bounties.</p>
</div>
`;

// Mock fetch function
let mockFetchResponse: string = MOCK_BOUNTY_HTML;
let mockFetchStatus: number = 200;

function setupMockFetch() {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url: string | URL | Request): Promise<Response> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));

    if (mockFetchStatus !== 200) {
      return new Response(null, { status: mockFetchStatus });
    }

    return new Response(mockFetchResponse, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };

  // Return cleanup function
  return () => {
    globalThis.fetch = originalFetch;
  };
}

Deno.test("AlgoraScraper - Basic instantiation", () => {
  const scraper = new AlgoraScraper({
    userAgent: "Test/1.0",
    rateLimitMs: 100,
    timeoutMs: 5000,
    maxRetries: 2,
  });

  assertExists(scraper);
});

Deno.test("AlgoraScraper - Parse bounties from HTML", async () => {
  const cleanup = setupMockFetch();
  mockFetchResponse = MOCK_BOUNTY_HTML;
  mockFetchStatus = 200;

  try {
    const scraper = new AlgoraScraper({
      userAgent: "Test/1.0",
      rateLimitMs: 50,
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const bounties = await scraper.scrapeBountiesFromPage("https://algora.io/test/bounties?status=open");

    assertEquals(bounties.length, 2);

    // Check first bounty
    assertEquals(bounties[0].id, "b123");
    assertEquals(bounties[0].title, "Test Bounty Title");
    assertEquals(bounties[0].amount_usd, 150);
    assertEquals(bounties[0].tags, ["typescript", "react"]);
    assertMatch(bounties[0].url, /github\.com\/test\/repo\/issues\/123/);

    // Check second bounty
    assertEquals(bounties[1].id, "b456");
    assertEquals(bounties[1].title, "Another Bounty");
    assertEquals(bounties[1].amount_usd, 75);
    assertEquals(bounties[1].tags, ["javascript"]);

  } finally {
    cleanup();
  }
});

Deno.test("AlgoraScraper - Handle empty bounty page", async () => {
  const cleanup = setupMockFetch();
  mockFetchResponse = EMPTY_BOUNTY_HTML;
  mockFetchStatus = 200;

  try {
    const scraper = new AlgoraScraper({
      userAgent: "Test/1.0",
      rateLimitMs: 50,
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const bounties = await scraper.scrapeBountiesFromPage("https://algora.io/empty/bounties?status=open");
    assertEquals(bounties.length, 0);

  } finally {
    cleanup();
  }
});

Deno.test("AlgoraScraper - Handle HTTP errors", async () => {
  const cleanup = setupMockFetch();
  mockFetchStatus = 404;

  try {
    const scraper = new AlgoraScraper({
      userAgent: "Test/1.0",
      rateLimitMs: 50,
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const bounties = await scraper.scrapeBountiesFromPage("https://algora.io/notfound/bounties?status=open");
    assertEquals(bounties.length, 0);

  } finally {
    cleanup();
  }
});

Deno.test("AlgoraScraper - Scrape organization with success", async () => {
  const cleanup = setupMockFetch();
  mockFetchResponse = MOCK_BOUNTY_HTML;
  mockFetchStatus = 200;

  try {
    const scraper = new AlgoraScraper({
      userAgent: "Test/1.0",
      rateLimitMs: 50,
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const organization: Organization = {
      handle: "test",
      display_name: "Test Organization",
      url: "https://algora.io/test/bounties?status=open",
      active: true,
      scrape_interval: 900,
    };

    const result = await scraper.scrapeOrganization(organization);

    assertEquals(result.success, true);
    assertEquals(result.organization, "test");
    assertEquals(result.bounties.length, 2);
    assertEquals(result.total_value_usd, 225); // 150 + 75
    assertExists(result.scrape_duration_ms);

  } finally {
    cleanup();
  }
});

Deno.test("AlgoraScraper - Handle organization scraping failure", async () => {
  const cleanup = setupMockFetch();
  mockFetchStatus = 500;

  try {
    const scraper = new AlgoraScraper({
      userAgent: "Test/1.0",
      rateLimitMs: 50,
      timeoutMs: 1000,
      maxRetries: 1,
    });

    const organization: Organization = {
      handle: "failed",
      display_name: "Failed Organization",
      url: "https://algora.io/failed/bounties?status=open",
      active: true,
      scrape_interval: 900,
    };

    const result = await scraper.scrapeOrganization(organization);

    assertEquals(result.success, false);
    assertEquals(result.organization, "failed");
    assertEquals(result.bounties.length, 0);
    assertEquals(result.total_value_usd, 0);
    assertExists(result.error);

  } finally {
    cleanup();
  }
});

Deno.test("AlgoraScraper - Rate limiting", async () => {
  const cleanup = setupMockFetch();
  mockFetchResponse = MOCK_BOUNTY_HTML;
  mockFetchStatus = 200;

  try {
    const scraper = new AlgoraScraper({
      userAgent: "Test/1.0",
      rateLimitMs: 200, // 200ms rate limit
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const startTime = Date.now();

    // Make two consecutive requests
    await scraper.scrapeBountiesFromPage("https://algora.io/test1/bounties?status=open");
    await scraper.scrapeBountiesFromPage("https://algora.io/test2/bounties?status=open");

    const duration = Date.now() - startTime;

    // Should take at least 200ms due to rate limiting
    // (Allow some tolerance for timing variations)
    assertEquals(duration >= 180, true, `Expected >= 180ms, got ${duration}ms`);

  } finally {
    cleanup();
  }
});

Deno.test("AlgoraScraper - Parse amount variations", async () => {
  const cleanup = setupMockFetch();

  const htmlWithVariousAmounts = `
    <div class="bounty-item" phx-value-id="b1">
      <div class="bounty-amount">$100</div>
    </div>
    <div class="bounty-item" phx-value-id="b2">
      <div class="bounty-amount">$1,250</div>
    </div>
    <div class="bounty-item" phx-value-id="b3">
      <div class="bounty-amount">$50.00</div>
    </div>
    <div class="bounty-item" phx-value-id="b4">
      <div class="bounty-amount">No amount</div>
    </div>
  `;

  mockFetchResponse = htmlWithVariousAmounts;
  mockFetchStatus = 200;

  try {
    const scraper = new AlgoraScraper({
      userAgent: "Test/1.0",
      rateLimitMs: 50,
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const bounties = await scraper.scrapeBountiesFromPage("https://algora.io/test/bounties?status=open");

    assertEquals(bounties.length, 4);
    assertEquals(bounties[0].amount_usd, 100);
    assertEquals(bounties[1].amount_usd, 1250);
    assertEquals(bounties[2].amount_usd, 50);
    assertEquals(bounties[3].amount_usd, 0); // No amount found

  } finally {
    cleanup();
  }
});