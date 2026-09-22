# Sharing this repo

Read this before adding anyone. There is one decision to make and it is not reversible by
deleting a file afterwards.

## What is safe to share

Everything the code needs. The demo show, `shows/demo-creator-summit.json`, is entirely
made up: fictional hosts, fictional guests, fictional sponsors. `TESTING.md` points testers
at it and nothing else.

## What is not

**`shows/reference/card-party-dallas-ros.md` contains real contact details.** Three vendor
email addresses and two phone numbers, plus Marielou's production notes. It was captured
from her Notion page as source material for the data model.

**`shows/card-party-dallas-day1.json` and `day2.json`** carry real names of hosts and
guests from a real client event. Lower risk, since those people appeared publicly at a
public event, but it is still a client's run of show.

**Deleting these files does not unshare them.** They are in the git history. Anyone with
repository access can read them with `git log -p`. That is the whole point of this page.

## Three options

### 1. Keep it private, add the production team only

Right for Marielou, Fuljens, Brandon, Katie. They are on this production and already have
the run of show, so nothing here is new to them.

```bash
gh repo add-collaborator docrock/stage-time <username> --permission push
```

Nothing else to do.

### 2. Add outside testers, and scrub the history first

If anyone outside the production is going to have access, remove the real material from
history before adding them. This rewrites commits, so do it once, deliberately, and tell
anyone who already has a clone that they need to re-clone.

```bash
# from a fresh clone, with git-filter-repo installed
git filter-repo --path shows/reference/card-party-dallas-ros.md --invert-paths
git filter-repo --path shows/card-party-dallas-day1.json --invert-paths
git filter-repo --path shows/card-party-dallas-day2.json --invert-paths
git push --force origin main
```

Keep a copy of the real show files somewhere outside the repo first. They took work to
build and you will want them for the next Card Party.

### 3. Split it

Public or widely shared repo with the code and the demo show. Real show files live in a
private sibling repo, or in a `shows/private/` folder added to `.gitignore`.

This is the cleanest long-term answer if Stage Time is ever going to be something other
people use. It is more setup than the other two.

## If it ever goes public or onto a hosted URL

Two things from `TODO.md` become non-negotiable rather than nice to have:

- **There is no authentication of any kind.** On a LAN that is a feature. On a public URL it
  means anyone with the link can start, stop, and retitle a live show.
- **Bind the server to one interface** rather than every network the machine happens to be
  on.

## Before you hand anyone a link

- [ ] Decided which of the three options above applies
- [ ] `npm test` passes
- [ ] The demo show loads: `node server.js --show shows/demo-creator-summit.json --fresh`
- [ ] `TESTING.md` still matches what the app actually does
- [ ] `run/` is not committed (it is gitignored, but check)
