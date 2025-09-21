import { assertEquals, assertExists } from "@std/assert";
import { ChangeDetector } from "../../src/scrapers/change-detector.ts";
import type { BountyIndex, Bounty } from "../../src/types.ts";

// Test data
const createMockBounty = (id: string, title: string, amount: number, tags: string[] = []): Bounty => ({
  id,
  title,
  amount_usd: amount,
  url: `https://github.com/test/repo/issues/${id}`,
  status: "open",
  tags,
  difficulty: "medium",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const createMockIndex = (bounties: Bounty[]): BountyIndex => {
  const organizations = {
    "test-org": {
      display_name: "Test Organization",
      url: "https://algora.io/test-org/bounties?status=open",
      bounty_count: bounties.length,
      total_value_usd: bounties.reduce((sum, b) => sum + b.amount_usd, 0),
      last_updated: new Date().toISOString(),
      scrape_duration_ms: 1000,
      bounties,
    },
  };

  return {
    generated_at: new Date().toISOString(),
    total_organizations: 1,
    total_bounties: bounties.length,
    total_value_usd: bounties.reduce((sum, b) => sum + b.amount_usd, 0),
    version: "1.0.0",
    organizations,
    stats: {
      by_language: {},
      by_amount: {},
      by_difficulty: {},
      by_status: {},
      organizations_with_bounties: 1,
      organizations_with_errors: 0,
      average_bounty_value: 0,
      median_bounty_value: 0,
    },
    metadata: {
      scraper_version: "1.0.0",
      scrape_duration_ms: 1000,
      success_rate: 1.0,
      last_full_scan: new Date().toISOString(),
    },
  };
};

// Mock file system for testing
const mockFiles: Map<string, string> = new Map();

function setupMockFileSystem() {
  const originalReadTextFile = Deno.readTextFile;
  const originalWriteTextFile = Deno.writeTextFile;
  const originalMkdir = Deno.mkdir;
  const originalStat = Deno.stat;

  Deno.readTextFile = async (path: string): Promise<string> => {
    const content = mockFiles.get(path);
    if (content === undefined) {
      throw new Deno.errors.NotFound(`File not found: ${path}`);
    }
    return content;
  };

  Deno.writeTextFile = async (path: string, data: string): Promise<void> => {
    mockFiles.set(path, data);
  };

  Deno.mkdir = async (_path: string, _options?: { recursive?: boolean }): Promise<void> => {
    // Mock mkdir - do nothing
  };

  Deno.stat = async (path: string): Promise<Deno.FileInfo> => {
    if (mockFiles.has(path)) {
      return {
        isFile: true,
        isDirectory: false,
        isSymlink: false,
        size: mockFiles.get(path)!.length,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        dev: 0,
        ino: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      } as Deno.FileInfo;
    }
    throw new Deno.errors.NotFound(`File not found: ${path}`);
  };

  // Return cleanup function
  return () => {
    Deno.readTextFile = originalReadTextFile;
    Deno.writeTextFile = originalWriteTextFile;
    Deno.mkdir = originalMkdir;
    Deno.stat = originalStat;
    mockFiles.clear();
  };
}

Deno.test("ChangeDetector - Initial detection with no previous index", async () => {
  const cleanup = setupMockFileSystem();

  try {
    const detector = new ChangeDetector();
    const bounties = [
      createMockBounty("b1", "First Bounty", 100),
      createMockBounty("b2", "Second Bounty", 200),
    ];
    const currentIndex = createMockIndex(bounties);

    const changes = await detector.detectChanges(currentIndex);

    assertEquals(changes.has_changes, true);
    assertEquals(changes.added_bounties.length, 2);
    assertEquals(changes.removed_bounties.length, 0);
    assertEquals(changes.updated_bounties.length, 0);
    assertEquals(changes.organizations_added.length, 1);
    assertEquals(changes.organizations_removed.length, 0);
    assertExists(changes.summary);

  } finally {
    cleanup();
  }
});

Deno.test("ChangeDetector - Detect added bounties", async () => {
  const cleanup = setupMockFileSystem();

  try {
    const detector = new ChangeDetector();

    // Setup previous index
    const previousBounties = [createMockBounty("b1", "First Bounty", 100)];
    const previousIndex = createMockIndex(previousBounties);
    mockFiles.set("data/bounty-index.json", JSON.stringify(previousIndex));

    // Current index with additional bounty
    const currentBounties = [
      createMockBounty("b1", "First Bounty", 100),
      createMockBounty("b2", "New Bounty", 150),
    ];
    const currentIndex = createMockIndex(currentBounties);

    const changes = await detector.detectChanges(currentIndex);

    assertEquals(changes.has_changes, true);
    assertEquals(changes.added_bounties.length, 1);
    assertEquals(changes.added_bounties[0].id, "b2");
    assertEquals(changes.removed_bounties.length, 0);
    assertEquals(changes.updated_bounties.length, 0);

  } finally {
    cleanup();
  }
});

Deno.test("ChangeDetector - Detect removed bounties", async () => {
  const cleanup = setupMockFileSystem();

  try {
    const detector = new ChangeDetector();

    // Setup previous index with two bounties
    const previousBounties = [
      createMockBounty("b1", "First Bounty", 100),
      createMockBounty("b2", "Second Bounty", 200),
    ];
    const previousIndex = createMockIndex(previousBounties);
    mockFiles.set("data/bounty-index.json", JSON.stringify(previousIndex));

    // Current index with one bounty removed
    const currentBounties = [createMockBounty("b1", "First Bounty", 100)];
    const currentIndex = createMockIndex(currentBounties);

    const changes = await detector.detectChanges(currentIndex);

    assertEquals(changes.has_changes, true);
    assertEquals(changes.added_bounties.length, 0);
    assertEquals(changes.removed_bounties.length, 1);
    assertEquals(changes.removed_bounties[0].id, "b2");
    assertEquals(changes.updated_bounties.length, 0);

  } finally {
    cleanup();
  }
});

Deno.test("ChangeDetector - Detect updated bounties", async () => {
  const cleanup = setupMockFileSystem();

  try {
    const detector = new ChangeDetector();

    // Setup previous index
    const previousBounties = [createMockBounty("b1", "First Bounty", 100, ["javascript"])];
    const previousIndex = createMockIndex(previousBounties);
    mockFiles.set("data/bounty-index.json", JSON.stringify(previousIndex));

    // Current index with updated bounty
    const currentBounties = [createMockBounty("b1", "Updated Bounty Title", 150, ["typescript", "react"])];
    const currentIndex = createMockIndex(currentBounties);

    const changes = await detector.detectChanges(currentIndex);

    assertEquals(changes.has_changes, true);
    assertEquals(changes.added_bounties.length, 0);
    assertEquals(changes.removed_bounties.length, 0);
    assertEquals(changes.updated_bounties.length, 1);

    const update = changes.updated_bounties[0];
    assertEquals(update.old.id, "b1");
    assertEquals(update.new.id, "b1");
    assertEquals(update.old.title, "First Bounty");
    assertEquals(update.new.title, "Updated Bounty Title");
    assertEquals(update.changes.length > 0, true);

  } finally {
    cleanup();
  }
});

Deno.test("ChangeDetector - No changes detected", async () => {
  const cleanup = setupMockFileSystem();

  try {
    const detector = new ChangeDetector();

    // Setup identical previous and current indices
    const bounties = [createMockBounty("b1", "First Bounty", 100)];
    const previousIndex = createMockIndex(bounties);
    mockFiles.set("data/bounty-index.json", JSON.stringify(previousIndex));

    const currentIndex = createMockIndex(bounties);

    const changes = await detector.detectChanges(currentIndex);

    assertEquals(changes.has_changes, false);
    assertEquals(changes.added_bounties.length, 0);
    assertEquals(changes.removed_bounties.length, 0);
    assertEquals(changes.updated_bounties.length, 0);
    assertEquals(changes.summary, "No changes detected");

  } finally {
    cleanup();
  }
});

Deno.test("ChangeDetector - Archive index", async () => {
  const cleanup = setupMockFileSystem();

  try {
    const detector = new ChangeDetector();
    const bounties = [createMockBounty("b1", "Test Bounty", 100)];
    const index = createMockIndex(bounties);

    await detector.archiveIndex(index);

    const today = new Date().toISOString().slice(0, 10);
    const expectedPath = `data/archive/bounty-index-${today}.json`;

    assertEquals(mockFiles.has(expectedPath), true);
    const archived = JSON.parse(mockFiles.get(expectedPath)!);
    assertEquals(archived.total_bounties, 1);

  } finally {
    cleanup();
  }
});

Deno.test("ChangeDetector - Skip duplicate archive", async () => {
  const cleanup = setupMockFileSystem();

  try {
    const detector = new ChangeDetector();
    const bounties = [createMockBounty("b1", "Test Bounty", 100)];
    const index = createMockIndex(bounties);

    const today = new Date().toISOString().slice(0, 10);
    const archivePath = `data/archive/bounty-index-${today}.json`;

    // Pre-create archive file
    mockFiles.set(archivePath, JSON.stringify({ existing: "archive" }));

    await detector.archiveIndex(index);

    // Should not overwrite existing archive
    const archived = JSON.parse(mockFiles.get(archivePath)!);
    assertEquals(archived.existing, "archive");

  } finally {
    cleanup();
  }
});

Deno.test("ChangeDetector - Complex bounty changes", async () => {
  const cleanup = setupMockFileSystem();

  try {
    const detector = new ChangeDetector();

    // Setup previous index with multiple bounties
    const previousBounties = [
      createMockBounty("b1", "Unchanged Bounty", 100),
      createMockBounty("b2", "Will be Updated", 200, ["javascript"]),
      createMockBounty("b3", "Will be Removed", 150),
    ];
    const previousIndex = createMockIndex(previousBounties);
    mockFiles.set("data/bounty-index.json", JSON.stringify(previousIndex));

    // Current index with various changes
    const currentBounties = [
      createMockBounty("b1", "Unchanged Bounty", 100), // No change
      createMockBounty("b2", "Updated Bounty", 250, ["typescript", "react"]), // Updated
      createMockBounty("b4", "New Bounty", 300), // Added
    ];
    const currentIndex = createMockIndex(currentBounties);

    const changes = await detector.detectChanges(currentIndex);

    assertEquals(changes.has_changes, true);
    assertEquals(changes.added_bounties.length, 1);
    assertEquals(changes.added_bounties[0].id, "b4");
    assertEquals(changes.removed_bounties.length, 1);
    assertEquals(changes.removed_bounties[0].id, "b3");
    assertEquals(changes.updated_bounties.length, 1);
    assertEquals(changes.updated_bounties[0].new.id, "b2");

  } finally {
    cleanup();
  }
});