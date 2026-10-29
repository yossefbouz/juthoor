#!/usr/bin/env bash
# Rebuild https://staging.juthoor.app on the VPS. Runs as the deploy user `juthoor`,
# fed over SSH from the repo root (cmd or Git Bash), or by the "Deploy staging" workflow:
#
#   ssh -i ~/.ssh/juthoor_deploy juthoor@80.241.218.49 "bash -s" < scripts/staging/deploy.sh
#   ssh -i ~/.ssh/juthoor_deploy juthoor@80.241.218.49 "bash -s -- my-branch" < scripts/staging/deploy.sh
#
# Deploys origin/main, or the branch or tag given, into /opt/juthoor/staging, builds it
# with the staging settings in apps/web/.env.local and restarts `juthoor-staging`.
# Never touches /opt/juthoor/app (production). Setup: RUN_GUIDE.md section 9.
set -euo pipefail

REF="${1:-main}"
STAGING_DIR=/opt/juthoor/staging
WEB_ENV="$STAGING_DIR/apps/web/.env.local"

[[ "$REF" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "bad ref: $REF"; exit 1; }
[ -d "$STAGING_DIR/.git" ] || git clone --depth=1 git@github.com:yossefbouz/juthoor.git "$STAGING_DIR"
[ -f "$WEB_ENV" ] || { echo "missing $WEB_ENV (RUN_GUIDE.md section 9)"; exit 1; }
# Staging must never build against the production Supabase project.
if grep -q nlufpicjdeeqcgepewdg "$WEB_ENV"; then echo "$WEB_ENV points at production Supabase"; exit 1; fi
grep -qx 'NEXT_PUBLIC_SITE_URL=https://staging.juthoor.app' "$WEB_ENV" \
  || { echo "$WEB_ENV needs NEXT_PUBLIC_SITE_URL=https://staging.juthoor.app"; exit 1; }

cd "$STAGING_DIR"
echo "▶ Fetching $REF..."
git fetch --depth=1 origin "$REF"
git reset --hard FETCH_HEAD
echo "▶ Installing deps..."
pnpm install --frozen-lockfile --prefer-offline
echo "▶ Building..."
nice -n 10 pnpm --filter web build
echo "▶ Restarting juthoor-staging..."
sudo /usr/bin/systemctl restart juthoor-staging
echo "▶ Health check..."
for _ in 1 2 3 4 5 6; do
  sleep 5
  if curl -fsS -o /dev/null http://127.0.0.1:3001/; then
    echo "✓ Staging at $(git rev-parse --short HEAD) ($REF), $(date -u)"
    exit 0
  fi
done
systemctl --no-pager status juthoor-staging | head -15 || true
echo "Health check failed; as root: journalctl -u juthoor-staging -n 100"
exit 1
