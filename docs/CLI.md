# Meridian CLI Reference

Command reference for the Meridian CLI, which coordinates work across Meridian and Events-Backend.

## Installation

Run from Meridian root:

```bash
npm run meridian -- <command>
# or
./m <command>
# or
./mer <command>
```

With `npm link` or global install: `meridian <command>`.

## Commands

### `meridian status`

Shows the current state of both repos and the lockfile.

**Output:**
- Meridian: branch, clean/dirty, short SHA
- Events: branch, clean/dirty, short SHA
- Lockfile: `events.ref` (short SHA)
- Whether the lockfile pin matches `events/main`

**Example:**
```bash
meridian status
```

```
Meridian:     branch=MER-123-Org-Forms clean sha=abc1234
Events:       branch=MER-123-Org-Forms dirty sha=def5678
Lockfile:     events.ref=6622704
             matches events/main? no
```

---

### `meridian start <branch>`

Creates a fresh feature branch in both repos from `origin/main`.

**Branch name format:** `MER-<number>-<slug>` (e.g. `MER-123-Org-Forms`)

**Steps:**
1. Validates branch name
2. Ensures both repos are clean
3. Fetches all remotes
4. If branch exists remotely: offers Resume / Abort / Force create new
5. Creates branch from `origin/main` in both repos

**Example:**
```bash
meridian start MER-123-Org-Forms
```

---

### `meridian switch <branch>`

Switches both repos to an existing branch (or creates it if missing).

**Steps:**
1. Validates branch name
2. Ensures both repos are clean
3. Fetches all remotes
4. For each repo: checkout local if exists, else checkout tracking remote, else create from `origin/main`

**Example:**
```bash
meridian switch MER-123-Org-Forms
```

---

### `meridian pin`

Updates `private-deps.lock` to pin Events to the current `origin/main` SHA.

**Requirements:**
- Both repos clean
- Meridian on a feature branch (not `main`), unless `--allow-main` is used

**Steps:**
1. Fetches Events
2. Gets `origin/main` SHA
3. Updates lockfile
4. Commits in Meridian: `chore(<branch>): pin events @ <shortSha>`

**Example:**
```bash
meridian pin
meridian pin --allow-main   # override main check
```

---

### `meridian ship`

Guided flow to ship a full-stack feature.

**Requirements:**
- Both repos clean
- Meridian and Events on the same feature branch (not `main`)

**Flow:**
1. Prompts to push Events branch if not pushed
2. Creates Events PR (or prints URL if `gh` not available)
3. Waits for Events PR to be merged to `main`
4. Pins lockfile to merged Events SHA
5. Prompts to push Meridian branch if not pushed
6. Creates Meridian PR (or prints URL)

**Example:**
```bash
meridian ship
```

---

## Troubleshooting

### Dirty state

**Error:** "Meridian has uncommitted changes" or "Events-Backend has uncommitted changes"

**Fix:** Commit, stash, or discard changes in both repos before running the command. The CLI does not auto-stash.

### Branch collision

**Error:** "Branch MER-123-X already exists on remote in: Meridian, Events-Backend"

**Options:**
1. **Resume** – Checkout the existing branch (tracking remote)
2. **Abort** – Use a different branch name
3. **Force create new** – Requires a different branch name; never overwrites remote

### `gh` not found

**Symptom:** `meridian ship` prints URL templates instead of creating PRs.

**Fix:** Install [GitHub CLI](https://cli.github.com/) and run `gh auth login`. The CLI will then create and check PR status automatically.

### Events-Backend not found

**Error:** "Events-Backend not found at ..."

**Fix:**
```bash
git clone git@github.com:Study-Compass/Events-Backend.git ../Events-Backend
```

Or set `MERIDIAN_WORKSPACE` to the parent directory containing both Meridian and Events-Backend.

### Invalid branch name

**Error:** "Invalid branch name. Must match: MER-<number>-<slug>"

**Examples:** `MER-123-Org-Forms`, `MER-456-Fix-Login`
