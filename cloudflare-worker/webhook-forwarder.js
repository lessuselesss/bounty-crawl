/**
 * Cloudflare Worker: changedetection.io Webhook Forwarder
 *
 * Receives webhooks from changedetection.io when Algora bounty pages change,
 * aggregates changes over a 2-minute batching window, and triggers GitHub Actions
 * via repository_dispatch to scrape only the organizations that changed.
 *
 * Deploy to Cloudflare Workers for free, serverless webhook handling.
 */

// Configuration - Set these as environment variables in Cloudflare Worker
const GITHUB_REPO_OWNER = 'lessuselesss'; // Your GitHub username
const GITHUB_REPO_NAME = 'bounty-crawl';  // Your repository name
const BATCHING_WINDOW_MS = 120000;        // 2 minutes

// In-memory store for batching (resets on worker restart, but that's fine)
let pendingChanges = new Set();
let batchTimeout = null;

export default {
  async fetch(request, env, ctx) {
    // CORS headers for browser requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders
      });
    }

    try {
      // Verify webhook secret if configured
      if (env.WEBHOOK_SECRET) {
        const providedSecret = request.headers.get('X-Webhook-Secret');
        if (providedSecret !== env.WEBHOOK_SECRET) {
          console.error('Invalid webhook secret');
          return new Response('Unauthorized', {
            status: 401,
            headers: corsHeaders
          });
        }
      }

      // Parse webhook payload from changedetection.io
      const payload = await request.json();

      // Extract organization handle from the watch URL
      // Example URL: https://algora.io/tscircuit/bounties?status=open
      const orgHandle = extractOrgHandle(payload);

      if (!orgHandle) {
        console.error('Could not extract org handle from payload:', payload);
        return new Response('Invalid payload', {
          status: 400,
          headers: corsHeaders
        });
      }

      console.log(`Change detected for org: ${orgHandle}`);

      // Add to pending changes
      pendingChanges.add(orgHandle);

      // Clear existing timeout and set new one
      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }

      // Wait for batching window before triggering GitHub Actions
      batchTimeout = setTimeout(async () => {
        await triggerGitHubActions(pendingChanges, env);
        pendingChanges.clear();
        batchTimeout = null;
      }, BATCHING_WINDOW_MS);

      // Acknowledge receipt immediately
      return new Response(JSON.stringify({
        success: true,
        org: orgHandle,
        queued: Array.from(pendingChanges),
        will_trigger_in: `${BATCHING_WINDOW_MS / 1000}s`
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('Error processing webhook:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  },

  // Handle scheduled events for cleanup
  async scheduled(event, env, ctx) {
    // Clear any stale pending changes (safety measure)
    if (pendingChanges.size > 0 && batchTimeout === null) {
      console.log('Cleanup: clearing stale pending changes');
      pendingChanges.clear();
    }
  }
};

/**
 * Extract organization handle from changedetection.io payload
 */
function extractOrgHandle(payload) {
  try {
    // changedetection.io sends the watch URL in the payload
    // Payload structure: { watch_url: "https://algora.io/ORG/bounties?status=open", ... }
    const watchUrl = payload.watch_url || payload.url || payload.message;

    if (!watchUrl) {
      return null;
    }

    // Extract org handle from URL pattern: algora.io/{org}/bounties
    const match = watchUrl.match(/algora\.io\/([^\/]+)\/bounties/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting org handle:', error);
    return null;
  }
}

/**
 * Trigger GitHub Actions workflow via repository_dispatch
 */
async function triggerGitHubActions(changedOrgs, env) {
  if (changedOrgs.size === 0) {
    console.log('No changes to trigger');
    return;
  }

  const orgsArray = Array.from(changedOrgs);
  console.log(`Triggering GitHub Actions for ${orgsArray.length} orgs:`, orgsArray);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'bounty-crawl-webhook-forwarder'
        },
        body: JSON.stringify({
          event_type: 'bounty_changed',
          client_payload: {
            changed_orgs: orgsArray,
            timestamp: new Date().toISOString(),
            batch_size: orgsArray.length
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('GitHub API error:', response.status, error);
      throw new Error(`GitHub API returned ${response.status}: ${error}`);
    }

    console.log(`Successfully triggered GitHub Actions for ${orgsArray.length} organizations`);
  } catch (error) {
    console.error('Failed to trigger GitHub Actions:', error);
    // Don't throw - we don't want to fail the webhook response
    // The changes will be picked up by the daily full scrape as fallback
  }
}
