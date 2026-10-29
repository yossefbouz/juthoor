#!/usr/bin/env bash
# One-time root setup for https://staging.juthoor.app on the production VPS.
# From the repo root on your machine (you type the sudo password):
#
#   scp scripts/staging/setup-vps.sh yousef@80.241.218.49:/tmp/
#   ssh -t yousef@80.241.218.49 "sudo bash /tmp/setup-vps.sh"
#
# Adds, next to the production `juthoor` service and site, without changing them:
#   - systemd unit `juthoor-staging`: Next.js from /opt/juthoor/staging on 127.0.0.1:3001
#   - a sudoers rule so the deploy user `juthoor` can restart it (scripts/staging/deploy.sh)
#   - a Caddy site for staging.juthoor.app, kept out of search engines
# The Caddyfile is backed up and validated before Caddy reloads. Safe to re-run.
# Everything else (checkout, build, web settings): RUN_GUIDE.md section 9.
set -euo pipefail

STAGING_DIR=/opt/juthoor/staging
UNIT=/etc/systemd/system/juthoor-staging.service
SUDOERS=/etc/sudoers.d/juthoor-staging
CADDYFILE=/etc/caddy/Caddyfile

[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo bash $0"; exit 1; }

echo "▶ systemd unit $UNIT"
cat > "$UNIT" <<'EOF'
[Unit]
Description=Juthoor Next.js app (staging, demo data)
After=network.target

[Service]
Type=simple
User=juthoor
WorkingDirectory=/opt/juthoor/staging/apps/web
Environment=NODE_ENV=production
ExecStart=/usr/bin/pnpm exec next start --port 3001 --hostname 127.0.0.1
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
LimitNOFILE=65535
# Staging shares the box with production: cap its memory and give it half prod's CPU share.
MemoryMax=1G
CPUWeight=50

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable juthoor-staging

echo "▶ sudoers $SUDOERS"
echo 'juthoor ALL=(root) NOPASSWD: /usr/bin/systemctl restart juthoor-staging' > "$SUDOERS.tmp"
chmod 440 "$SUDOERS.tmp"
visudo -cf "$SUDOERS.tmp"
mv "$SUDOERS.tmp" "$SUDOERS"

if grep -q '^staging\.juthoor\.app' "$CADDYFILE"; then
  echo "▶ Caddy site already present"
else
  echo "▶ Caddy site staging.juthoor.app"
  backup="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$CADDYFILE" "$backup"
  cat >> "$CADDYFILE" <<'EOF'

# Staging copy with demo data (RUN_GUIDE.md section 9). Kept out of search engines.
staging.juthoor.app {
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        X-Robots-Tag "noindex, nofollow"
        -Server
    }
    respond /robots.txt <<TXT
        User-agent: *
        Disallow: /
        TXT 200
    reverse_proxy 127.0.0.1:3001
}
EOF
  if ! caddy validate --config "$CADDYFILE" --adapter caddyfile; then
    cp -p "$backup" "$CADDYFILE"
    echo "Caddyfile did not validate; restored $backup and left Caddy running unchanged"
    exit 1
  fi
  systemctl reload caddy
fi

if [ -d "$STAGING_DIR/apps/web/.next" ]; then
  systemctl restart juthoor-staging
  echo "✓ juthoor-staging restarted"
else
  echo "✓ juthoor-staging enabled; it starts on the first scripts/staging/deploy.sh run"
fi
