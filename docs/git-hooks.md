# Git pre-push hook

A pre-push hook runs on **your computer** just before `git push` sends code, and it can stop the push. It is a fast
safety net in front of CI. CI (and GitHub branch protection) stays the real gatekeeper, because a local hook can
always be skipped.

## What it checks
Git tells the hook exactly which commits are being pushed, so it only looks at what changed.

**Always (about a second)**
| Check | Blocks the push when... |
|---|---|
| Protected branch | you push directly to `main`/`master` (creating it, e.g. the first push into an empty repo, is allowed) or delete it |
| Forbidden files | a real `.env*` file (not `.env.example`) or a `.pem`/`.key`/`.p12`/`.pfx` file is committed |
| Secrets | an *added line* looks like a real Supabase secret key, access token, JWT, or a long `*_KEY`/`*_PASSWORD`/`*_TOKEN` value (placeholders like `replace-me` are fine). Reports `file:line` |
| Encoding | a text file has a UTF-8 BOM or CRLF line endings (both broke things earlier in this project) |
| Size | a non-lockfile is over 2 MB |
| Migrations | an **existing** migration was modified or deleted (applied migrations are immutable: add a new one), a new one is misnamed, or two share a timestamp |

**Only when that app changed**
| Changed | Runs | Typical time |
|---|---|---|
| `backend/` | `npm run lint`, `typecheck`, `test` | about 14 s |
| `frontend/` | `npm run lint`, `typecheck`, `test` | about 52 s |

It stops at the first failing step of an app. Docs-only and database-only pushes skip these entirely.

**Left to CI on purpose:** production builds, Docker build and smoke test, `npm audit`, coverage, and the live Supabase
tests (they write to a real database).

## Installing it
It installs itself: `backend/package.json` and `frontend/package.json` have a `prepare` script, so running
`npm install` or `npm ci` in either app enables the hook for your clone (it sets `git config core.hooksPath .githooks`).

- **Manual / check:** `node scripts/setup-hooks.mjs` enables it, `node scripts/setup-hooks.mjs --status` reports.
- **It is per clone:** a fresh clone enables it the first time you install dependencies there.
- **Safe by design:** the installer never fails an install, does nothing in CI/Render/Vercel, inside Docker builds
  (no `../scripts/`), or outside a git checkout, never changes a `core.hooksPath` you set yourself, and makes no network
  calls. Opt out with `SKIP_GIT_HOOKS=1`.

## Everyday workflow
```
git switch -c feature/short-name
# ... work, commit ...
git push -u origin feature/short-name     # hook runs here
# open a pull request on GitHub; merge after CI is green
```
A blocked push prints what to fix. Fix it and push again.

## Overrides (emergencies only)
| Need | How | Note |
|---|---|---|
| Skip everything once | `git push --no-verify` | CI still runs every check |
| Skip via environment | `SKIP_PREPUSH=1` | same |
| Push to `main` once | `ALLOW_PUSH_TO_MAIN=1` | GitHub branch protection still applies |
| Edit a migration that was **never applied** | `ALLOW_MIGRATION_EDIT=1` | otherwise add a new migration |

Claude Code is configured (`.claude/settings.json`) to refuse `--no-verify` and these variables.

## Things to know
- **App checks run on your working tree**, not in a clean checkout. If you have uncommitted changes, or push an older
  commit, the hook prints a note. CI always tests the exact pushed commit.
- **Dependencies must be installed** (`cd backend && npm ci`). Otherwise the push is blocked with that instruction.
- **Hook errors fail open:** if the hook script itself crashes, it reports the error and lets the push proceed (CI is
  the backstop) instead of stranding you.
- **Enforcement lives on GitHub:** also enable branch protection on `main` (require a pull request and the CI checks).
  The hook gives an instant, friendly stop; branch protection is the wall that cannot be skipped.

## Files
| File | Role |
|---|---|
| `.githooks/pre-push` | tiny launcher that Git runs; forwards to the script |
| `scripts/prepush.mjs` | all the checks |
| `scripts/setup-hooks.mjs` | enables/checks the hook for this clone |
| `scripts/prepush.test.mjs` | unit tests: `node --test scripts/prepush.test.mjs` (also run in CI) |

## Troubleshooting
| Symptom | Fix |
|---|---|
| Hook does not run | `node scripts/setup-hooks.mjs --status`; if it says another `core.hooksPath`, unset it or merge the hooks |
| `dependencies are not installed` | `cd backend && npm ci` (and/or `frontend`) |
| False positive on the secrets check | use an obvious placeholder (`replace-me`, `test-...`) in committed files; real values go in `.env` |
| Windows: hook not found | make sure `.githooks/pre-push` has LF endings (`.gitattributes` enforces it) |
