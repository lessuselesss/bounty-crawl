{
  description = "Algora Bounty Scraper - Continuous monitoring of Algora bounties";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Core tools
            deno
            git
            jq
            curl

            # Secret management
            sops
            age

            # GitHub integration
            gh

            # Development tools
            nodePackages.typescript
            nodePackages.typescript-language-server

            # Utilities
            ripgrep
            fd
            bat
            eza
            direnv
          ];

          shellHook = ''
            echo "🕷️  Algora Bounty Scraper Development Environment"
            echo "=================================================="
            echo ""
            echo "Available commands:"
            echo "  deno task scrape       - Run scraper manually"
            echo "  deno task test         - Run test suite"
            echo "  deno task setup        - Initialize repository"
            echo "  deno task encrypt      - Encrypt secrets"
            echo "  deno task decrypt      - Decrypt secrets (dev only)"
            echo "  deno task stats        - Generate statistics"
            echo ""
            echo "GitHub Actions:"
            echo "  gh workflow run scrape.yml    - Trigger scraping workflow"
            echo "  gh workflow list              - List all workflows"
            echo "  gh run list                   - Show recent runs"
            echo ""
            echo "Development:"
            echo "  deno fmt                      - Format code"
            echo "  deno lint                     - Lint code"
            echo "  deno check src/index.ts       - Type check"
            echo ""

            # Set up environment
            export DENO_DIR="$PWD/.deno"
            export DENO_INSTALL_ROOT="$PWD/.deno/bin"

            # Create necessary directories
            mkdir -p data/archive
            mkdir -p secrets
            mkdir -p logs

            # Initialize git if not already done
            if [ ! -d .git ]; then
              echo "Initializing git repository..."
              git init
              git config user.name "Algora Bounty Scraper"
              git config user.email "scraper@algora-bounty-scraper.com"
            fi

            echo "Environment ready! 🚀"
          '';

          # Environment variables
          DENO_PERMISSIONS = "--allow-net --allow-read --allow-write --allow-env --allow-run";
          SOPS_AGE_RECIPIENTS = "age127xu5c86lhc72y6z49ldq57hx92up2609h6990mds6p283rvregqa5gd8p";
        };

        # Build the scraper as a package
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "algora-bounty-scraper";
          version = "1.0.0";

          src = ./.;

          nativeBuildInputs = [ pkgs.deno ];

          buildPhase = ''
            deno cache --reload src/index.ts
          '';

          installPhase = ''
            mkdir -p $out/bin
            mkdir -p $out/share/algora-bounty-scraper

            cp -r src $out/share/algora-bounty-scraper/
            cp -r config $out/share/algora-bounty-scraper/
            cp deno.json $out/share/algora-bounty-scraper/

            cat > $out/bin/algora-bounty-scraper << EOF
            #!/bin/sh
            cd $out/share/algora-bounty-scraper
            exec ${pkgs.deno}/bin/deno run --allow-all src/index.ts "\$@"
            EOF

            chmod +x $out/bin/algora-bounty-scraper
          '';
        };

        # CI package for GitHub Actions
        packages.ci = pkgs.stdenv.mkDerivation {
          pname = "algora-bounty-scraper-ci";
          version = "1.0.0";

          src = ./.;

          nativeBuildInputs = with pkgs; [ deno sops git jq ];

          buildPhase = ''
            echo "Preparing CI environment..."
            deno cache --reload src/index.ts
          '';

          installPhase = ''
            mkdir -p $out/bin

            cat > $out/bin/ci-scraper << EOF
            #!/bin/sh
            set -euo pipefail

            echo "🕷️  Starting Algora Bounty Scraper CI"

            # Decrypt secrets if available
            if [ -f secrets/github-token.yaml ] && [ -n "\''${SOPS_AGE_KEY:-}" ]; then
              echo "🔓 Decrypting secrets..."
              sops -d secrets/github-token.yaml > /tmp/secrets.json
              export GITHUB_TOKEN=\$(jq -r '.github_token' /tmp/secrets.json)
              rm /tmp/secrets.json
            fi

            # Run the scraper
            echo "🚀 Running scraper..."
            deno run --allow-all src/index.ts

            echo "✅ Scraper completed successfully"
            EOF

            chmod +x $out/bin/ci-scraper
          '';
        };
      });
}