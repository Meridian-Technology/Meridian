# Meridian Developer Workflow

This guide explains how to work on full-stack features that span Meridian and Events-Backend using the Meridian CLI.

## Workspace Layout

Your workspace should have both repos as siblings:

```
<WORKSPACE>/
  Meridian/
  Events-Backend/
```

If you're in Meridian-Mono, that's `Meridian-Mono/Meridian` and `Meridian-Mono/Events-Backend`. The CLI auto-detects the workspace when run from `Meridian/`. If Events-Backend is missing, the CLI will prompt you to clone it:

```bash
git clone git@github.com:Study-Compass/Events-Backend.git ../Events-Backend
```

You can override workspace detection with `MERIDIAN_WORKSPACE=/path/to/parent`.

## How to Start a Task

1. Create a feature branch in both repos:

   ```bash
   meridian start MER-123-Org-Forms
   ```

   This creates `MER-123-Org-Forms` from `origin/main` in both Meridian and Events-Backend.

2. Work normally in both repos. Make commits as usual.

3. When ready to ship, run:

   ```bash
   meridian ship
   ```

## How to Ship a Full-Stack Feature

`meridian ship` guides you through the full flow:

1. Ensures both repos are clean and on the same branch.
2. Pushes the Events branch if needed.
3. Creates an Events PR (or prints the URL if `gh` isn't available).
4. Waits for you to merge the Events PR to `main`.
5. Pins the lockfile to the merged Events SHA.
6. Pushes the Meridian branch and creates the Meridian PR.

**Important:** Events changes must be merged to `main` before pinning. The CLI never merges PRs automatically—you merge them. After merging the Events PR, the CLI will detect it and continue.

## What the Lockfile Is and Why It Matters

`private-deps.lock` pins the Events-Backend module by SHA. During Heroku builds, `bin/fetch_private_deps` clones Events at the pinned SHA. This ensures:

- **Deterministic builds:** Every deploy uses the exact same Events code.
- **No downtime:** We never pin unmerged or divergent commits.

The lockfile must reference a 40-character hex SHA that exists on `origin/main` in Events-Backend. Branch names, tags, or arbitrary refs are not allowed.

## If Ship Blocks You

If `meridian ship` stops and says "Merge Events PR to main first":

1. Open the Events PR (the CLI prints the URL if available).
2. Get it reviewed and merged.
3. Re-run `meridian ship`. It will detect the merge and continue with pinning and the Meridian PR.

If you don't have `gh` (GitHub CLI) installed, the CLI will print a URL template. Open the PR manually, merge it, then re-run `meridian ship`.

## Switching Branches

To switch both repos to an existing branch:

```bash
meridian switch MER-123-Org-Forms
```

Both repos must be clean. If the branch exists remotely, the CLI checks it out tracking the remote. If it doesn't exist, it prompts to create it from `origin/main`.

## Manual Pin (Advanced)

If you've already merged Events to main and only need to update the lockfile:

```bash
meridian pin
```

Requires both repos clean and Meridian on a feature branch (not `main`). Use `--allow-main` to override.

## Windows Notes

- Use `npm run meridian -- <cmd>` or `node bin/meridian.js <cmd>`.
- Optional: create `m.cmd` and `mer.cmd` that call `node bin/meridian.js %*`.
- PowerShell: `Set-Alias m "node bin/meridian.js"` (or use `npx meridian`).
