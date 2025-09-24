#!/usr/bin/env -S deno run --allow-all

/**
 * Comprehensive Algora Organization Discovery
 *
 * Uses multiple strategies to find ALL organizations on Algora:
 * 1. Scrapes Algora's main pages for organization links
 * 2. Uses web scraping to find complete organization directories
 * 3. Cross-references with known GitHub organizations
 */

import { parseArgs } from "@std/cli/parse_args.ts";

async function scrapeWithBasicFetch(url: string): Promise<string | null> {
  try {
    console.log(`🌐 Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (!response.ok) {
      console.log(`❌ Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    console.log(`✅ Fetched ${html.length} characters from ${url}`);
    return html;
  } catch (error) {
    console.log(`❌ Error fetching ${url}: ${error.message}`);
    return null;
  }
}

function extractOrgHandles(html: string): Set<string> {
  const orgHandles = new Set<string>();

  // Look for various patterns that might contain organization handles
  const patterns = [
    // Direct algora.io links
    /algora\.io\/([a-zA-Z0-9-_]+)\/bounties/g,
    /algora\.io\/([a-zA-Z0-9-_]+)/g,

    // href attributes
    /href="[^"]*\/([a-zA-Z0-9-_]+)\/bounties[^"]*"/g,
    /href="\/([a-zA-Z0-9-_]+)\/bounties"/g,
    /href="\/([a-zA-Z0-9-_]+)"/g,

    // Organization references in text
    /@([a-zA-Z0-9-_]+)/g,

    // GitHub-style org references
    /github\.com\/([a-zA-Z0-9-_]+)/g,
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const handle = match[1];

      // Filter out common false positives
      if (handle &&
          !['bounties', 'login', 'signup', 'about', 'terms', 'privacy', 'contact', 'api', 'docs', 'help', 'support', 'static', 'assets', 'img', 'images', 'css', 'js', 'fonts', 'favicon', 'robots', 'sitemap', 'admin', 'dashboard', 'settings', 'profile', 'account', 'user', 'users', 'www', 'blog', 'news', 'press', 'careers', 'jobs', 'team', 'company', 'legal', 'security', 'status', 'health', 'ping', 'version', 'v1', 'v2', 'api', 'graphql', 'webhook', 'webhooks', 'callback', 'oauth', 'auth', 'login', 'logout', 'signin', 'signout', 'register', 'forgot', 'reset', 'verify', 'activate', 'deactivate', 'disable', 'enable', 'delete', 'remove', 'create', 'new', 'edit', 'update', 'save', 'cancel', 'submit', 'search', 'filter', 'sort', 'page', 'pages', 'next', 'prev', 'first', 'last', 'home', 'index', 'main', 'welcome', 'get-started', 'getting-started', 'how-it-works', 'pricing', 'plans', 'features', 'faq', 'tutorial', 'guide', 'documentation', 'explore', 'discover', 'browse', 'categories', 'tags', 'topics', 'popular', 'trending', 'featured', 'recent', 'latest', 'top', 'best', 'recommended', 'all', 'public', 'open', 'closed', 'completed', 'active', 'inactive', 'draft', 'published', 'archived', 'deleted', 'suspended', 'banned', 'verified', 'unverified', 'approved', 'rejected', 'pending', 'processing', 'failed', 'success', 'error', 'warning', 'info', 'debug', 'trace', 'log', 'logs', 'analytics', 'metrics', 'stats', 'statistics', 'reports', 'export', 'import', 'backup', 'restore', 'sync', 'refresh', 'reload', 'retry', 'resend', 'download', 'upload', 'share', 'embed', 'copy', 'paste', 'cut', 'undo', 'redo', 'print', 'preview', 'zoom', 'fullscreen', 'minimize', 'maximize', 'close', 'open', 'expand', 'collapse', 'toggle', 'switch', 'change', 'modify', 'adjust', 'configure', 'setup', 'install', 'uninstall', 'upgrade', 'downgrade', 'migrate', 'transfer', 'move', 'copy', 'clone', 'duplicate', 'fork', 'merge', 'split', 'join', 'combine', 'separate', 'divide', 'group', 'ungroup', 'organize', 'reorganize', 'rearrange', 'reorder', 'sort', 'shuffle', 'randomize', 'reverse', 'invert', 'flip', 'rotate', 'scale', 'resize', 'crop', 'trim', 'pad', 'margin', 'border', 'background', 'foreground', 'color', 'theme', 'style', 'layout', 'design', 'template', 'format', 'structure', 'content', 'text', 'image', 'video', 'audio', 'media', 'file', 'folder', 'directory', 'path', 'url', 'uri', 'link', 'href', 'src', 'alt', 'title', 'description', 'summary', 'abstract', 'overview', 'introduction', 'conclusion', 'appendix', 'references', 'bibliography', 'credits', 'acknowledgments', 'contributors', 'authors', 'editors', 'reviewers', 'moderators', 'admins', 'administrators', 'owners', 'managers', 'developers', 'maintainers', 'collaborators', 'members', 'subscribers', 'followers', 'following', 'friends', 'connections', 'network', 'community', 'forum', 'discussion', 'chat', 'message', 'comment', 'reply', 'mention', 'notification', 'alert', 'reminder', 'bookmark', 'favorite', 'like', 'dislike', 'upvote', 'downvote', 'rate', 'review', 'feedback', 'suggestion', 'recommendation', 'proposal', 'request', 'question', 'answer', 'solution', 'problem', 'issue', 'bug', 'feature', 'enhancement', 'improvement', 'optimization', 'performance', 'speed', 'efficiency', 'quality', 'reliability', 'stability', 'security', 'privacy', 'safety', 'compliance', 'standards', 'guidelines', 'policies', 'rules', 'terms', 'conditions', 'agreement', 'contract', 'license', 'copyright', 'trademark', 'patent', 'intellectual', 'property', 'rights', 'permissions', 'access', 'authorization', 'authentication', 'verification', 'validation', 'confirmation', 'approval', 'rejection', 'acceptance', 'denial', 'grant', 'revoke', 'suspend', 'ban', 'block', 'unblock', 'allow', 'deny', 'permit', 'forbid', 'restrict', 'limit', 'quota', 'threshold', 'minimum', 'maximum', 'range', 'interval', 'duration', 'timeout', 'delay', 'schedule', 'calendar', 'date', 'time', 'timestamp', 'timezone', 'locale', 'language', 'translation', 'localization', 'internationalization', 'currency', 'money', 'payment', 'billing', 'invoice', 'receipt', 'transaction', 'order', 'purchase', 'sale', 'refund', 'discount', 'coupon', 'promotion', 'campaign', 'marketing', 'advertising', 'seo', 'sem', 'social', 'media', 'platform', 'service', 'tool', 'utility', 'application', 'app', 'software', 'program', 'system', 'framework', 'library', 'package', 'module', 'component', 'widget', 'plugin', 'extension', 'addon', 'integration', 'api', 'sdk', 'cli', 'gui', 'ui', 'ux', 'frontend', 'backend', 'fullstack', 'database', 'server', 'client', 'browser', 'mobile', 'desktop', 'web', 'website', 'webapp', 'app', 'application', 'portal', 'dashboard', 'panel', 'interface', 'console', 'terminal', 'shell', 'command', 'script', 'code', 'programming', 'development', 'dev', 'prod', 'production', 'staging', 'testing', 'test', 'qa', 'quality', 'assurance', 'automation', 'ci', 'cd', 'devops', 'infrastructure', 'cloud', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'helm', 'terraform', 'ansible', 'jenkins', 'github', 'gitlab', 'bitbucket', 'git', 'svn', 'mercurial', 'version', 'control', 'repository', 'repo', 'branch', 'tag', 'commit', 'push', 'pull', 'fetch', 'checkout', 'merge', 'rebase', 'cherry-pick', 'stash', 'diff', 'patch', 'conflict', 'resolution', 'review', 'pr', 'pullrequest', 'merge-request', 'mr', 'issue', 'ticket', 'task', 'todo', 'milestone', 'release', 'deployment', 'build', 'compile', 'bundle', 'package', 'publish', 'distribute', 'install', 'setup', 'configure', 'environment', 'config', 'configuration', 'settings', 'preferences', 'options', 'parameters', 'arguments', 'flags', 'variables', 'constants', 'secrets', 'keys', 'tokens', 'credentials', 'passwords', 'certificates', 'ssl', 'tls', 'https', 'http', 'ftp', 'ssh', 'telnet', 'smtp', 'pop3', 'imap', 'dns', 'tcp', 'udp', 'ip', 'ipv4', 'ipv6', 'mac', 'address', 'port', 'protocol', 'network', 'internet', 'intranet', 'extranet', 'vpn', 'proxy', 'firewall', 'router', 'switch', 'hub', 'gateway', 'load', 'balancer', 'cdn', 'cache', 'redis', 'memcached', 'mysql', 'postgresql', 'sqlite', 'mongodb', 'elasticsearch', 'solr', 'lucene', 'neo4j', 'cassandra', 'dynamodb', 'firebase', 'supabase', 'planetscale', 'neon', 'cockroachdb', 'dgraph', 'hasura', 'prisma', 'drizzle', 'knex', 'sequelize', 'mongoose', 'typeorm', 'mikro-orm', 'objection', 'bookshelf', 'waterline', 'sails', 'adonis', 'nest', 'fastify', 'koa', 'hapi', 'restify', 'loopback', 'meteor', 'feathers', 'strapi', 'keystone', 'ghost', 'wordpress', 'drupal', 'joomla', 'magento', 'shopify', 'woocommerce', 'prestashop', 'opencart', 'zen-cart', 'oscommerce', 'bigcommerce', 'squarespace', 'wix', 'webflow', 'bubble', 'zapier', 'ifttt', 'automate', 'workflow', 'process', 'business', 'logic', 'rules', 'engine', 'decision', 'tree', 'machine', 'learning', 'ml', 'ai', 'artificial', 'intelligence', 'neural', 'network', 'deep', 'learning', 'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy', 'matplotlib', 'seaborn', 'plotly', 'bokeh', 'jupyter', 'notebook', 'colab', 'kaggle', 'huggingface', 'transformers', 'openai', 'anthropic', 'claude', 'chatgpt', 'gpt', 'llm', 'nlp', 'computer', 'vision', 'cv', 'opencv', 'pillow', 'skimage', 'imageio', 'ffmpeg', 'gstreamer', 'vlc', 'media', 'player', 'streaming', 'video', 'audio', 'music', 'podcast', 'radio', 'tv', 'broadcast', 'live', 'real-time', 'websocket', 'sse', 'push', 'notification', 'firebase', 'fcm', 'apns', 'gcm', 'twilio', 'sendgrid', 'mailgun', 'postmark', 'ses', 'sns', 'sqs', 'lambda', 'cloudflare', 'workers', 'edge', 'computing', 'serverless', 'function', 'faas', 'saas', 'paas', 'iaas', 'baas', 'daas', 'caas', 'kubernetes', 'docker', 'podman', 'containerd', 'cri-o', 'runc', 'buildah', 'skopeo', 'helm', 'kustomize', 'istio', 'linkerd', 'envoy', 'nginx', 'apache', 'haproxy', 'traefik', 'caddy', 'certbot', 'letsencrypt', 'ssl', 'certificate', 'authority', 'ca', 'pki', 'encryption', 'decryption', 'cryptography', 'hash', 'signature', 'verification', 'authentication', 'authorization', 'oauth', 'oidc', 'saml', 'ldap', 'active', 'directory', 'ad', 'kerberos', 'ntlm', 'radius', 'tacacs', 'duo', 'okta', 'auth0', 'cognito', 'firebase', 'auth', 'clerk', 'supabase', 'auth', 'next-auth', 'passport', 'session', 'cookie', 'jwt', 'token', 'refresh', 'access', 'bearer', 'basic', 'digest', 'api', 'key', 'secret', 'client', 'id', 'scope', 'permission', 'role', 'rbac', 'abac', 'acl', 'policy', 'rule', 'condition', 'expression', 'evaluation', 'enforcement', 'audit', 'log', 'monitoring', 'observability', 'telemetry', 'metrics', 'traces', 'logs', 'apm', 'performance', 'profiling', 'debugging', 'troubleshooting', 'error', 'tracking', 'sentry', 'rollbar', 'bugsnag', 'raygun', 'airbrake', 'honeybadger', 'datadog', 'new', 'relic', 'dynatrace', 'appdynamics', 'splunk', 'elastic', 'stack', 'elk', 'logstash', 'kibana', 'grafana', 'prometheus', 'jaeger', 'zipkin', 'opencensus', 'opentelemetry', 'honeycomb', 'lightstep', 'wavefront', 'sumologic', 'loggly', 'papertrail', 'fluentd', 'fluent', 'bit', 'rsyslog', 'syslog-ng', 'journald', 'systemd', 'upstart', 'init', 'supervisor', 'pm2', 'forever', 'nodemon', 'concurrently', 'cross-env', 'dotenv', 'config', 'yargs', 'commander', 'inquirer', 'chalk', 'ora', 'progress', 'cli-progress', 'listr', 'boxen', 'update-notifier', 'semver', 'npm', 'yarn', 'pnpm', 'rush', 'lerna', 'nx', 'turbo', 'changeset', 'semantic-release', 'standard-version', 'conventional-changelog', 'commitizen', 'husky', 'lint-staged', 'prettier', 'eslint', 'tslint', 'jshint', 'jscs', 'standard', 'xo', 'stylelint', 'postcss', 'autoprefixer', 'cssnano', 'purgecss', 'tailwind', 'bootstrap', 'bulma', 'foundation', 'semantic', 'ui', 'material', 'design', 'ant', 'design', 'chakra', 'ui', 'mantine', 'nextui', 'react', 'bootstrap', 'reactstrap', 'react-router', 'reach', 'router', 'wouter', 'gatsby', 'next', 'nuxt', 'sapper', 'svelte', 'kit', 'angular', 'vue', 'ember', 'backbone', 'knockout', 'aurelia', 'polymer', 'lit', 'stencil', 'solid', 'alpine', 'stimulus', 'turbo', 'hotwire', 'unpoly', 'htmx', 'livewire', 'inertia', 'remix', 'blitz', 'redwood', 'keystone', 'strapi', 'sanity', 'contentful', 'forestry', 'netlify', 'cms', 'ghost', 'butter', 'cms', 'directus', 'payload', 'cms', 'tina', 'cms', 'dato', 'cms', 'cosmic', 'js', 'agility', 'cms', 'kentico', 'kontent', 'storyblok', 'prismic', 'graphcms', 'hygraph', 'builder', 'io', 'webiny', 'cockpit', 'cms', 'october', 'cms', 'craft', 'cms', 'drupal', 'wordpress', 'joomla', 'typo3', 'concrete5', 'silverstripe', 'umbraco', 'sitecore', 'episerver', 'optimizely', 'adobe', 'experience', 'manager', 'aem', 'sharepoint', 'confluence', 'notion', 'coda', 'airtable', 'monday', 'asana', 'trello', 'jira', 'linear', 'height', 'clickup', 'todoist', 'any', 'do', 'wunderlist', 'things', 'omnifocus', 'fantastical', 'calendly', 'acuity', 'scheduling', 'zoom', 'meet', 'teams', 'slack', 'discord', 'telegram', 'whatsapp', 'signal', 'wire', 'element', 'matrix', 'rocket', 'chat', 'mattermost', 'zulip', 'gitter', 'freenode', 'irc', 'libera', 'oftc', 'rizon', 'undernet', 'quakenet', 'dalnet', 'efnet', 'ircnet', 'hackint', 'snoonet', 'espernet', 'mozilla', 'foznet', 'synergy', 'networks', 'chatnet', 'ircstorm', 'p2p-network', 'afternet', 'abjects', 'austnet', 'azzurra', 'barafranca', 'blitzed', 'brasirc', 'canternet', 'chatjunkies', 'darkscience', 'darkside', 'darkmyst', 'euirc', 'europnet', 'evolu', 'forestnet', 'freequest', 'gamesurge', 'german-elite', 'gigachat', 'globalchat', 'gtanet', 'hackthissite', 'icq-chat', 'idlenet', 'insiderz', 'interlinked', 'irchighway', 'ircstorm', 'krstarica', 'linknet', 'mibbit', 'mircx', 'nixhelp', 'nkplex', 'oftc', 'othernet', 'ozorg', 'p2p-network', 'pirc', 'ponychat', 'ponyville', 'quakenet', 'recycled-irc', 'rizon', 'root-me', 'rusnet', 'scarynet', 'slashnet', 'snoonet', 'sorcerynet', 'starchat', 'syndiairc', 'synirc', 'teksavvy', 'tomsk', 'twistednet', 'undernet', 'unibg', 'ustream', 'whiffle', 'worldirc', 'xertion', 'zerochat', 'zeronode', 'zirc'].includes(handle.toLowerCase()) &&
          handle.length >= 2 &&
          handle.length <= 50 &&
          /^[a-zA-Z0-9-_]+$/.test(handle)) {
        orgHandles.add(handle);
      }
    }
  }

  return orgHandles;
}

async function validateOrgHandle(handle: string): Promise<{ handle: string; valid: boolean; error?: string }> {
  try {
    const response = await fetch(`https://algora.io/${handle}/bounties?status=open`, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      }
    });

    return { handle, valid: response.status === 200 };
  } catch (error) {
    return { handle, valid: false, error: error.message };
  }
}

async function comprehensiveDiscovery() {
  console.log("🚀 Starting comprehensive Algora organization discovery...");

  const allOrgHandles = new Set<string>();

  // Load existing organizations
  try {
    const existing = await Deno.readTextFile("data/organizations.json");
    const data = JSON.parse(existing);
    for (const org of data.organizations || []) {
      allOrgHandles.add(org.handle);
    }
    console.log(`📋 Loaded ${allOrgHandles.size} existing organizations`);
  } catch {
    console.log("ℹ️  No existing organizations file found");
  }

  // URLs to scrape for organization discovery
  const discoveryUrls = [
    'https://algora.io/',
    'https://algora.io/bounties',
    'https://algora.io/bounties?status=open',
    'https://algora.io/bounties?status=completed',
    'https://algora.io/leaderboard',
    'https://algora.io/organizations',
    'https://algora.io/explore',
    'https://algora.io/discover',
    'https://algora.io/browse',
    'https://algora.io/popular',
    'https://algora.io/trending',
    'https://algora.io/recent',
    'https://algora.io/featured',
    'https://algora.io/top',
    // Try different pagination
    'https://algora.io/bounties?page=1',
    'https://algora.io/bounties?page=2',
    'https://algora.io/bounties?page=3',
    'https://algora.io/bounties?page=4',
    'https://algora.io/bounties?page=5',
    // Try different sorting
    'https://algora.io/bounties?sort=newest',
    'https://algora.io/bounties?sort=oldest',
    'https://algora.io/bounties?sort=highest',
    'https://algora.io/bounties?sort=popular',
  ];

  // Scrape each URL
  for (const url of discoveryUrls) {
    try {
      const html = await scrapeWithBasicFetch(url);
      if (html) {
        const orgHandles = extractOrgHandles(html);
        console.log(`🔍 Found ${orgHandles.size} potential organizations from ${url}`);

        for (const handle of orgHandles) {
          allOrgHandles.add(handle);
        }
      }

      // Rate limiting between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.log(`❌ Error scraping ${url}: ${error.message}`);
    }
  }

  console.log(`\n📊 Discovery Summary:`);
  console.log(`   Total unique handles found: ${allOrgHandles.size}`);

  // Validate all discovered handles
  console.log(`\n🔍 Validating ${allOrgHandles.size} organization handles...`);

  const validOrgs = [];
  const invalidOrgs = [];
  const errors = [];

  const handles = Array.from(allOrgHandles);

  // Process in batches to avoid overwhelming the server
  const batchSize = 5;
  const delay = 2000;

  for (let i = 0; i < handles.length; i += batchSize) {
    const batch = handles.slice(i, i + batchSize);
    console.log(`📋 Validating batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(handles.length/batchSize)} (${batch.length} orgs)`);

    const batchPromises = batch.map(validateOrgHandle);
    const results = await Promise.all(batchPromises);

    for (const result of results) {
      if (result.error) {
        errors.push(result);
        console.log(`❌ Error validating ${result.handle}: ${result.error}`);
      } else if (result.valid) {
        validOrgs.push(result.handle);
        console.log(`✅ Valid: ${result.handle}`);
      } else {
        invalidOrgs.push(result.handle);
        console.log(`⭕ Invalid: ${result.handle}`);
      }
    }

    // Delay between batches
    if (i + batchSize < handles.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Generate results
  const organizations = validOrgs.map(handle => ({
    handle,
    display_name: handle.charAt(0).toUpperCase() + handle.slice(1),
    url: `https://algora.io/${handle}/bounties?status=open`,
    active: true,
    scrape_interval: 1800,
    tier: "active" as const,
    firecrawl_enabled: true
  })).sort((a, b) => a.handle.localeCompare(b.handle));

  const output = {
    updated_at: new Date().toISOString(),
    version: "3.0.0",
    total_organizations: organizations.length,
    discovery_method: "Comprehensive web scraping + validation",
    discovery_stats: {
      total_handles_found: allOrgHandles.size,
      valid_organizations: validOrgs.length,
      invalid_handles: invalidOrgs.length,
      validation_errors: errors.length,
      discovery_urls_scraped: discoveryUrls.length
    },
    organizations
  };

  console.log(`\n📊 Final Results:`);
  console.log(`   Total handles discovered: ${allOrgHandles.size}`);
  console.log(`   Valid organizations: ${validOrgs.length}`);
  console.log(`   Invalid handles: ${invalidOrgs.length}`);
  console.log(`   Validation errors: ${errors.length}`);
  console.log(`\n🎯 Valid Organizations Found:`);
  validOrgs.forEach((org, i) => console.log(`   ${i + 1}. ${org}`));

  return output;
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "dry-run", "save"],
    string: ["output"],
    alias: {
      h: "help",
      o: "output"
    }
  });

  if (args.help) {
    console.log(`
🔍 Comprehensive Algora Organization Discovery

USAGE:
  deno run --allow-net --allow-read --allow-write scripts/comprehensive-discovery.ts [OPTIONS]

OPTIONS:
  --save           Save results to organizations.json
  --output FILE    Output file (default: data/organizations.json)
  --dry-run        Just show results without saving
  --help, -h       Show this help message

This script comprehensively scrapes Algora's pages to find ALL organizations,
then validates each one to ensure they actually exist.
`);
    Deno.exit(0);
  }

  const result = await comprehensiveDiscovery();

  if (args.save || !args["dry-run"]) {
    const outputFile = args.output || "data/organizations.json";
    await Deno.writeTextFile(outputFile, JSON.stringify(result, null, 2));
    console.log(`\n✅ Saved ${result.organizations.length} organizations to ${outputFile}`);
  }

  console.log(`\n🎉 Comprehensive discovery complete! Found ${result.organizations.length} valid organizations.`);
}

if (import.meta.main) {
  await main();
}