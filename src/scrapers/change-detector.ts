import type { BountyIndex, ChangeDetection, Bounty } from "../types.ts";
import { Logger } from "../utils/logging.ts";

export class ChangeDetector {
  private logger: Logger;

  constructor() {
    this.logger = new Logger("ChangeDetector");
  }

  async detectChanges(
    currentIndex: BountyIndex,
    previousIndexPath: string = "data/bounty-index.json"
  ): Promise<ChangeDetection> {
    this.logger.info("Detecting changes in bounty index");

    try {
      const previousIndex = await this.loadPreviousIndex(previousIndexPath);

      if (!previousIndex) {
        this.logger.info("No previous index found, treating all bounties as new");
        return this.createInitialChangeDetection(currentIndex);
      }

      const changes = this.compareIndices(previousIndex, currentIndex);

      this.logger.info(
        `Change detection complete: ${changes.added_bounties.length} added, ` +
        `${changes.removed_bounties.length} removed, ${changes.updated_bounties.length} updated`,
        {
          added: changes.added_bounties.length,
          removed: changes.removed_bounties.length,
          updated: changes.updated_bounties.length,
          orgsAdded: changes.organizations_added.length,
          orgsRemoved: changes.organizations_removed.length,
        }
      );

      return changes;

    } catch (error) {
      this.logger.error(`Error detecting changes: ${error instanceof Error ? error.message : String(error)}`);

      // Return no changes on error to avoid breaking the workflow
      return {
        has_changes: false,
        added_bounties: [],
        removed_bounties: [],
        updated_bounties: [],
        organizations_added: [],
        organizations_removed: [],
        summary: "Error during change detection",
      };
    }
  }

  private async loadPreviousIndex(path: string): Promise<BountyIndex | null> {
    try {
      const content = await Deno.readTextFile(path);
      return JSON.parse(content) as BountyIndex;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      throw error;
    }
  }

  private createInitialChangeDetection(currentIndex: BountyIndex): ChangeDetection {
    const allBounties = Object.values(currentIndex.organizations).flatMap(org => org.bounties);

    return {
      has_changes: true,
      added_bounties: allBounties,
      removed_bounties: [],
      updated_bounties: [],
      organizations_added: Object.keys(currentIndex.organizations),
      organizations_removed: [],
      summary: `Initial scan: ${allBounties.length} bounties across ${Object.keys(currentIndex.organizations).length} organizations`,
    };
  }

  private compareIndices(previous: BountyIndex, current: BountyIndex): ChangeDetection {
    const previousBounties = this.extractAllBounties(previous);
    const currentBounties = this.extractAllBounties(current);

    const previousBountiesMap = new Map(previousBounties.map(b => [b.id, b]));
    const currentBountiesMap = new Map(currentBounties.map(b => [b.id, b]));

    // Find added bounties
    const addedBounties = currentBounties.filter(b => !previousBountiesMap.has(b.id));

    // Find removed bounties
    const removedBounties = previousBounties.filter(b => !currentBountiesMap.has(b.id));

    // Find updated bounties
    const updatedBounties = [];
    for (const currentBounty of currentBounties) {
      const previousBounty = previousBountiesMap.get(currentBounty.id);
      if (previousBounty) {
        const changes = this.detectBountyChanges(previousBounty, currentBounty);
        if (changes.length > 0) {
          updatedBounties.push({
            old: previousBounty,
            new: currentBounty,
            changes,
          });
        }
      }
    }

    // Find organization changes
    const previousOrgs = new Set(Object.keys(previous.organizations));
    const currentOrgs = new Set(Object.keys(current.organizations));

    const organizationsAdded = Array.from(currentOrgs).filter(org => !previousOrgs.has(org));
    const organizationsRemoved = Array.from(previousOrgs).filter(org => !currentOrgs.has(org));

    const hasChanges = addedBounties.length > 0 ||
                      removedBounties.length > 0 ||
                      updatedBounties.length > 0 ||
                      organizationsAdded.length > 0 ||
                      organizationsRemoved.length > 0;

    const summary = this.generateSummary({
      added: addedBounties.length,
      removed: removedBounties.length,
      updated: updatedBounties.length,
      orgsAdded: organizationsAdded.length,
      orgsRemoved: organizationsRemoved.length,
    });

    return {
      has_changes: hasChanges,
      added_bounties: addedBounties,
      removed_bounties: removedBounties,
      updated_bounties: updatedBounties,
      organizations_added: organizationsAdded,
      organizations_removed: organizationsRemoved,
      summary,
    };
  }

  private extractAllBounties(index: BountyIndex): Bounty[] {
    const bounties: Bounty[] = [];

    for (const orgData of Object.values(index.organizations)) {
      for (const bounty of orgData.bounties) {
        bounties.push(bounty);
      }
    }

    return bounties;
  }

  private detectBountyChanges(previous: Bounty, current: Bounty): string[] {
    const changes: string[] = [];

    if (previous.title !== current.title) {
      changes.push(`title: "${previous.title}" → "${current.title}"`);
    }

    if (previous.amount_usd !== current.amount_usd) {
      changes.push(`amount: $${previous.amount_usd} → $${current.amount_usd}`);
    }

    if (previous.status !== current.status) {
      changes.push(`status: ${previous.status} → ${current.status}`);
    }

    if (previous.url !== current.url) {
      changes.push(`url: ${previous.url} → ${current.url}`);
    }

    if (previous.difficulty !== current.difficulty) {
      changes.push(`difficulty: ${previous.difficulty} → ${current.difficulty}`);
    }

    // Compare tags
    const previousTags = new Set(previous.tags);
    const currentTags = new Set(current.tags);

    const addedTags = Array.from(currentTags).filter(tag => !previousTags.has(tag));
    const removedTags = Array.from(previousTags).filter(tag => !currentTags.has(tag));

    if (addedTags.length > 0) {
      changes.push(`tags added: ${addedTags.join(", ")}`);
    }

    if (removedTags.length > 0) {
      changes.push(`tags removed: ${removedTags.join(", ")}`);
    }

    return changes;
  }

  private generateSummary(counts: {
    added: number;
    removed: number;
    updated: number;
    orgsAdded: number;
    orgsRemoved: number;
  }): string {
    const parts: string[] = [];

    if (counts.added > 0) {
      parts.push(`${counts.added} bounties added`);
    }

    if (counts.removed > 0) {
      parts.push(`${counts.removed} bounties removed`);
    }

    if (counts.updated > 0) {
      parts.push(`${counts.updated} bounties updated`);
    }

    if (counts.orgsAdded > 0) {
      parts.push(`${counts.orgsAdded} organizations added`);
    }

    if (counts.orgsRemoved > 0) {
      parts.push(`${counts.orgsRemoved} organizations removed`);
    }

    if (parts.length === 0) {
      return "No changes detected";
    }

    return parts.join(", ");
  }

  async archiveIndex(index: BountyIndex): Promise<void> {
    try {
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const archivePath = `data/archive/bounty-index-${date}.json`;

      // Ensure archive directory exists
      await Deno.mkdir("data/archive", { recursive: true });

      // Check if archive already exists for today
      try {
        await Deno.stat(archivePath);
        this.logger.debug(`Archive already exists for ${date}, skipping`);
        return;
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }

      // Write archive
      await Deno.writeTextFile(archivePath, JSON.stringify(index, null, 2));

      this.logger.info(`Archived bounty index to ${archivePath}`, {
        archivePath,
        totalBounties: index.total_bounties,
        totalOrganizations: index.total_organizations,
      });

    } catch (error) {
      this.logger.error(`Failed to archive index: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}