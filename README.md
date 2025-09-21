# Algora Bounty Scraper

A GitHub Actions-powered web scraper that monitors Algora organization bounty pages and maintains a live JSON index with change detection. Works exclusively with GitHub infrastructure using Nix for reproducible environments and SOPS for encrypted secret management.

## Quick Start

```bash
# Clone and setup
git clone <your-fork-url>
cd algora-bounty-scraper

# Initialize repository (generates age keys, creates configs)
deno run --allow-all scripts/setup-repo.ts

# Encrypt secrets
deno run --allow-all scripts/encrypt-secrets.ts

# Add GitHub repository secrets:
# - SOPS_AGE_KEY: contents of .age-key file
# - GITHUB_TOKEN: for API access and commits

# Push to enable automated scraping
git push origin main
```

## Features

- **Continuous Monitoring**: Scrapes organization bounty pages every 15 minutes
- **Change Detection**: Identifies added, removed, and updated bounties
- **Master JSON Index**: Unified bounty data across all organizations
- **Encrypted Secrets**: SOPS with age encryption for secure credential storage
- **GitHub Actions**: Fully automated with GitHub infrastructure
- **Nix Environment**: Reproducible development and CI environments
- **Rate Limiting**: Respectful scraping with configurable delays
- **Archiving**: Historical bounty data preservation
- **Statistics**: Comprehensive bounty analytics and trends

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ GitHub Actions  │────│ Algora Websites  │────│ JSON Index      │
│ (Every 15min)   │    │ (Scrape Pages)   │    │ (Git Commits)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         │              ┌─────────────────┐               │
         └──────────────│ Change Detection│───────────────┘
                        │ & Git Automation│
                        └─────────────────┘
```

## Core Commands

```bash
# Development
deno task dev          # Start development environment
deno task test         # Run test suite
deno task scrape       # Manual scraping run

# Operations
deno task encrypt      # Encrypt secrets with SOPS
deno task decrypt      # Decrypt secrets for debugging
deno task stats        # Generate bounty statistics
```

## Configuration

### Organizations (`data/organizations.json`)
```json
{
  "organizations": [
    {
      "handle": "ZIO",
      "display_name": "ZIO",
      "url": "https://algora.io/ZIO/bounties?status=open",
      "active": true,
      "scrape_interval": 900
    }
  ]
}
```

### Scraper Settings (`config/scraper-config.json`)
```json
{
  "rate_limit_ms": 2000,
  "parallel_limit": 3,
  "enable_change_detection": true,
  "github_integration": {
    "enabled": true,
    "auto_commit": true
  }
}
```

## Secret Management

Uses SOPS with age encryption for secure credential storage:

```bash
# Setup encryption keys
deno run --allow-all scripts/setup-repo.ts

# Encrypt secrets
deno run --allow-all scripts/encrypt-secrets.ts \
  --token ghp_your_token \
  --session optional_algora_session

# Verify encryption
deno run --allow-all scripts/encrypt-secrets.ts --verify
```

Required GitHub Repository Secrets:
- `SOPS_AGE_KEY`: Private age key from `.age-key` file
- `GITHUB_TOKEN`: For API access and automated commits

## Output Structure

### Bounty Index (`data/bounty-index.json`)
```json
{
  "generated_at": "2024-01-15T10:30:00Z",
  "total_organizations": 15,
  "total_bounties": 127,
  "total_value_usd": 45250,
  "organizations": {
    "ZIO": {
      "bounty_count": 12,
      "total_value_usd": 3400,
      "bounties": [...]
    }
  },
  "stats": {...},
  "metadata": {...}
}
```

### Individual Bounty
```json
{
  "id": "b123456",
  "title": "Implement ZIO-Http client",
  "amount_usd": 250,
  "url": "https://github.com/zio/zio-http/issues/1234",
  "status": "open",
  "tags": ["scala", "http", "client"],
  "difficulty": "medium",
  "created_at": "2024-01-10T12:00:00Z"
}
```

## Change Detection

Automatically detects and tracks:
- **Added Bounties**: New bounties discovered
- **Removed Bounties**: Bounties no longer available
- **Updated Bounties**: Changes in title, amount, tags, or status
- **Organization Changes**: New or removed organizations

Changes trigger automated git commits with descriptive messages.

## Monitoring & Observability

### GitHub Actions Summary
- Real-time scraping statistics
- Success rates and error tracking
- Top organizations by bounty count
- Change summaries with affected files

### Artifacts & Logs
- Detailed scraping logs uploaded as artifacts
- 7-day retention for debugging and analysis
- Performance metrics and timing data

## Development

### Environment Setup
```bash
# Enter Nix development shell
nix develop

# Available tools: deno, git, jq, sops, age, rg, fd
```

### Testing
```bash
# Full test suite
deno task test

# Specific test files
deno test tests/scrapers/algora-scraper.test.ts
deno test tests/scrapers/change-detector.test.ts
```

### Local Scraping
```bash
# Test scraping without commits
deno run --allow-all src/index.ts --no-commit

# Force full scan (ignore cache)
deno run --allow-all src/index.ts --full-scan

# CI mode (auto-commit enabled)
deno run --allow-all src/index.ts --ci
```

## Troubleshooting

### Setup Issues
- **Age key generation fails**: Install age toolkit
- **SOPS encryption fails**: Verify `.sops.yaml` configuration
- **Tests fail**: Check Nix development environment

### Runtime Issues
- **GitHub Actions failing**: Verify repository secrets
- **Scraping errors**: Check rate limits and organization URLs
- **Git commit failures**: Verify `GITHUB_TOKEN` permissions

### Common Solutions
```bash
# Regenerate age keys
deno run --allow-all scripts/setup-repo.ts

# Test secret decryption
deno run --allow-all scripts/encrypt-secrets.ts --decrypt

# Verify environment
deno run --allow-all scripts/encrypt-secrets.ts --verify
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/enhancement`
3. Run tests: `deno task test`
4. Submit pull request with clear description

## License

MIT License - see LICENSE file for details