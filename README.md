# Glassbox

A personal archive that answers in your own words. Ask it a question and it quotes the passage you wrote, names the note it came from, and shows exactly how it got there.

The value is in the depth of the archive, not the cleverness of the answer. The library this was built against runs to 566 notes going back to 2010, and the questions worth asking it are the ones you cannot answer from memory: what you thought about something years ago, and how often you have come back to it since.

There is no LLM anywhere in this project. No API keys, no model weights, no network calls.

## Why no model

For a personal note library, the answer to "what did I decide about the Postgres index?" already exists in something you wrote. It does not need to be generated. It needs to be found.

That reframes the problem from generation to retrieval, which buys three things:

- **It cannot hallucinate.** Every answer is a verbatim passage from a note, with attribution. There is no step where text is invented.
- **It is explainable.** Each answer carries its own reasoning: the terms it searched, how the query was classified, which passages ranked where, and why the top one won.
- **It runs entirely offline.** Your notes never leave the machine.

The tradeoff is real and worth stating plainly: Glassbox cannot summarise across notes, rephrase an answer, or reason about anything you never wrote down. When retrieval is not confident, it refuses and tells you why rather than guessing.

## How retrieval works

Notes are split into overlapping chunks, tokenised (stopwords removed, stemmed), and scored with TF-IDF cosine similarity against the query.

The interesting part is the gate. Cosine similarity alone is not sufficient to decide whether an answer is trustworthy. Measured on a real three-note corpus:

| Query | Score | Coverage | Correct action |
|---|---|---|---|
| why is my bread flat | 0.306 | 0.50 | answer |
| quarterly revenue forecast | 0.339 | 0.33 | refuse |

The *wrong* result scores *higher* than the right one. No single cosine threshold separates them. The second query matched only one of three terms ("quarterly" stemming to "quarter", hitting an unrelated "next quarter") and that one strong match dragged the score up.

So the gate is two-factor, and coverage is a hard requirement:

```
GATE = { minScore: 0.15, minCoverage: 0.5 }
```

Coverage is the fraction of distinct query terms that matched. A passage must clear both bars. This is what turns "here is the closest thing I found" into "I do not have an answer for this."

Note that TF-IDF cosine on short queries clusters in the 0.1–0.5 range and never approaches 1.0. Confidence tiers are calibrated to that real distribution, not to a theoretical 0–1 scale.

## How notes are stored

One Markdown file per note, in a folder you pick on disk.

```
---
id: 8f3a2b1c
title: "Postgres index tuning"
tags: ["database","performance"]
createdAt: 2026-09-13T10:04:00.000Z
updatedAt: 2026-09-13T11:20:00.000Z
---

The composite index on (tenant_id, created_at) fixed the sequential scan...
```

Design decisions behind this:

- **One file per note, not one JSON blob.** If you sync the folder with Drive or Dropbox, per-file granularity means editing note A on one machine and note B on another merges cleanly. A single blob would produce a conflicted copy of the entire library and lose one machine's work.
- **Plain Markdown with YAML frontmatter.** The frontmatter is verified to parse with a real YAML parser, so the folder opens directly in Obsidian or any editor. Your notes are not trapped in this app.
- **`id` in the frontmatter is identity, never the filename.** Rename a file in Finder and the note keeps its identity instead of duplicating.
- **Writes are per note and debounced.** A whole-library save on every keystroke would rewrite every file and thrash folder sync.

Notes are last-write-wins on `updatedAt`, so a newer copy synced from another machine is preserved rather than clobbered.

### Browser support

Folder storage uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), which is **Chromium only** (Chrome, Edge, Arc, Brave). Firefox and Safari implement only OPFS, with no directory picker.

In those browsers Glassbox falls back to `localStorage` and stays fully functional, but notes live in the browser profile rather than on disk.

Two things to know about the API even in Chrome:

- Folder permission is **not** automatically restored on reload. The app detects this and shows a "Reconnect folder" button, because the browser requires a user gesture to re-grant.
- Work done in `localStorage` while disconnected is merged into the folder on reconnect, not discarded.

## Running it

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | `tsc -b` then Vite production build |
| `npm run build:pages` | The same build with the `/glassbox/` base path used on GitHub Pages |
| `npm run test` | Vitest in watch mode |
| `npm run test:run` | Single unit test run |
| `npm run test:coverage` | Unit tests with the coverage thresholds enforced |
| `npm run test:storybook` | Every story and its play function, in real Chromium, with accessibility checks |
| `npm run test:e2e` | Playwright end to end and screenshot tests |
| `npm run storybook` | Storybook dev server on port 6006 |
| `npm run lint` | Oxlint |
| `npm run format` / `npm run format:check` | Prettier, write or verify |
| `npm run typecheck` | `tsc -b` |
| `npm run check` | Lint, format, typecheck and coverage together: what CI's fast gates run |

`npm run build` is the real gate, not `tsc --noEmit`. The build runs `tsc -b` with `erasableSyntaxOnly`, which is stricter and rejects things like TypeScript constructor parameter properties.

## Layout

```
src/
  engine/      retrieval: tokenize, tfidf, router, copy
  storage/     NotesStore interface + localStorage, folder, and merge adapters
  hooks/       useNotes, useChat, useStorageBackend
  components/  UI
  styles/      one CSS file per component, tokens in tokens.css
  data/        sample notes
```

`src/engine/` is deliberately free of React and of storage concerns. It is pure functions over plain data, which is why it is the most heavily tested part of the codebase.

`src/engine/copy.ts` holds every fixed string the assistant can say. Because nothing is generated, the assistant's entire vocabulary is enumerable and reviewable in one file.

## Tests

```bash
npm run test:run
```

Coverage concentrates on the engine (tokenisation, stemming, scoring, routing) and the storage layer, including an in-memory fake of `FileSystemDirectoryHandle` that exercises the folder adapter without a browser: one file per note, updates in place, retitling without duplicating, external renames, and corrupt files being skipped rather than crashing a load.

The two data-loss regressions the code review caught (deleting a note while its write is still in flight, and reconnecting a folder without merging interim work) each have a test that was confirmed to fail when the fix is reverted.

## Quality gates and delivery

Every pull request runs five jobs in `.github/workflows/ci.yml`, and a push to `main` only publishes if all five pass.

| Job | Gate |
|---|---|
| `check` | `npm audit` (high severity), Prettier, Oxlint, `tsc -b` |
| `unit` | Vitest with coverage thresholds (statements 85, branches 78, functions 85, lines 87) |
| `storybook` | Story play functions and axe accessibility checks in Chromium, then a Storybook build |
| `e2e` | Playwright specs and screenshot comparisons |
| `build` | A `/glassbox/` Pages build, booted in a browser to prove every asset resolves under that path |

Lint is a ratchet. Oxlint is allowed 30 existing warnings (`--max-warnings 30` in `package.json`) and no new ones, so lower the number as they are fixed. It went from 26 to 30 only because oxlint 1.91 started flagging four more places in code that was already there; raise it for a linter upgrade like that and never for new code.

Husky runs lint and the format check before each commit, and the type check and unit tests before each push.

### Shipping

Merging to `main` deploys automatically. There is no manual publish step.

- App: https://anindya.dev/glassbox/
- Storybook: https://anindya.dev/glassbox/storybook/

Pages must be set to deploy from **GitHub Actions** (Settings, Pages, Source). The `anindya.dev` domain is owned by the `dutta14.github.io` repository, which is why this project serves under the `/glassbox/` path.

### Screenshot baselines

Screenshot tests compare against per-platform baselines. CI runs on Linux, so it uses the `*-linux.png` files, which cannot be produced on a Mac. After an intentional visual change, regenerate them on the CI image and commit the result to your branch:

```bash
gh workflow run visual-baselines.yml --ref <your-branch>
```

For quick local iteration, `npm run test:e2e:update` rewrites the `*-darwin.png` files.

### Stories

Stories sit beside their component as `*.stories.tsx`. A story's `play` function runs as a test, and an accessibility violation fails it. A rule is only waived per story, with a comment saying why.

## Known limitations

- No cross-note synthesis. It quotes one passage; it does not combine three.
- No semantic matching. Lexical retrieval means "car" does not match "automobile".
- Folder storage is Chromium only.
- Stemming is a hand-rolled suffix stripper, not a full Porter implementation. It handles the common English families and is tuned against the sample corpus.
