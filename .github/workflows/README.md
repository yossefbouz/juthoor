# GitHub Actions Workflows

Two workflows form the CI/CD pipeline:

```
push to main
   │
   ▼
┌──────────┐    success    ┌──────────┐
│  ci.yml  │ ────────────▶ │deploy.yml│
└──────────┘               └──────────┘
   │ failure                   │ success
   ▼                           ▼
  block                      live on VPS
```

## ci.yml — runs on every push + PR
- Type check (`tsc --noEmit`)
- Lint (`oxlint`, soft-fail until baseline clean)
- Build (`pnpm --filter web build`)
- On `main` push only: upload `.next/` artifact (7-day retention)

## deploy.yml — runs after CI green on `main`
- Triggered by `workflow_run` once CI completes successfully
- Also manually triggerable from Actions UI (`workflow_dispatch`)
- SSHs into the VPS, `git reset --hard origin/main`, install, build, `systemctl restart juthoor`
- Curls `/` post-restart; if 5xx, dumps `journalctl` and fails the run

## deploy-staging.yml — manual only
- **Actions → Deploy staging → Run workflow**, with the branch or tag to deploy (default `main`)
- SSHs in as the same deploy user and runs `scripts/staging/deploy.sh`: rebuilds `/opt/juthoor/staging` and restarts `juthoor-staging` (https://staging.juthoor.app). Never touches production
- Same secrets as `deploy.yml`; staging setup and its database steps are in `RUN_GUIDE.md` §9

## Required GitHub Secrets
| Name | Where to get it |
|---|---|
| `SSH_HOST` | `80.241.218.49` (later: `juthoor.app`) |
| `SSH_USER` | `juthoor` (the system user from Step 8.3) |
| `SSH_PRIVATE_KEY` | Generated locally with `ssh-keygen -t ed25519`. Paste the **private** key. The public key goes in `/home/juthoor/.ssh/authorized_keys` on the VPS. |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -H 80.241.218.49` (run from your laptop after Step 8.1) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | From `apps/web/.env.local` |

## Required GitHub Variables (optional)
| Name | Default |
|---|---|
| `DEPLOY_PATH` | `/opt/juthoor/app` |

## How to configure (once, after VPS is set up)

1. **Generate a deploy key** on your laptop:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/juthoor_deploy -C "github-actions"
   ```
2. **Authorize the public key on the VPS**:
   ```bash
   ssh yousef@80.241.218.49
   sudo -u juthoor mkdir -p /home/juthoor/.ssh
   sudo -u juthoor tee -a /home/juthoor/.ssh/authorized_keys < ~/.ssh/juthoor_deploy.pub
   sudo chmod 600 /home/juthoor/.ssh/authorized_keys
   sudo chown -R juthoor:juthoor /home/juthoor/.ssh
   ```
3. **Allow `juthoor` to restart its own service without a password**:
   ```bash
   echo 'juthoor ALL=(root) NOPASSWD: /usr/bin/systemctl restart juthoor' | sudo tee /etc/sudoers.d/juthoor-deploy
   sudo chmod 440 /etc/sudoers.d/juthoor-deploy
   ```
4. **Get the host fingerprint**:
   ```bash
   ssh-keyscan -H 80.241.218.49 > /tmp/known_hosts
   cat /tmp/known_hosts
   ```
5. **Paste secrets into GitHub** at `Settings → Secrets and variables → Actions`:
   - `SSH_HOST` = `80.241.218.49`
   - `SSH_USER` = `juthoor`
   - `SSH_PRIVATE_KEY` = paste `~/.ssh/juthoor_deploy` (the private key, NOT `.pub`)
   - `SSH_KNOWN_HOSTS` = paste the `ssh-keyscan` output
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = paste from `.env.local`
6. **Test it**: push a no-op commit to `main`. CI runs → deploy runs → site updates.

## Rollback

Rollback by reverting on `main` — the next push redeploys the reverted state.
For an emergency manual rollback:
```bash
ssh yousef@80.241.218.49
sudo -u juthoor -H bash -c "cd /opt/juthoor/app && git reset --hard HEAD~1 && pnpm install && pnpm --filter web build"
sudo systemctl restart juthoor
```

## Why this structure (decisions)

- **Two workflows, not one.** Separating CI from deploy means a broken build on `main` doesn't waste time SSH-ing. Also lets you run CI on PRs without deploying them.
- **`workflow_run` dependency** instead of putting deploy steps in the same job: keeps deploy logic out of every PR run. PR runs only do CI.
- **`concurrency: deploy-prod, cancel-in-progress: false`**: never cancel a half-finished deploy. If two pushes land within 30s, the second waits.
- **Build on the VPS, not on Actions runner.** Why? Because Cache Components in Next 16 generates a build manifest that bakes in the build host's filesystem paths. Building on the actual runtime host avoids a class of "works on CI but not in prod" issues. Trade-off: ~60s per deploy vs ~10s — acceptable for our scale.
- **`oxlint` is `continue-on-error: true`** until we lock a clean baseline. Once we hit zero warnings we'll flip it to a hard fail.
- **No tests in CI yet.** The Vitest suite is set up for `lib/tree/zodSchemas` (Step 3 work) but coverage is sparse. Step 5 Matching Engine work will require unit tests on `arabic_phonetic` outputs and BFS edge cases — that's when CI grows a `test` step.

## What's missing (deferred)

- **Slack/Discord notification** on deploy failure — drop a webhook in `secrets.DEPLOY_WEBHOOK` later
- **Preview deploys** for PRs — needs Vercel-style throwaway environments (defer)
- **Database migrations** in CI — currently applied via Supabase MCP from this dev machine. Eventually we should run `supabase db push` from a CI job that has the service-role key. Defer until we have more than one deploy environment.
- **Lighthouse CI** for performance regressions on each PR — defer
