# Specs

Design-time documents for Glassbox, kept as a record of what was decided and why.

**The code is the source of truth, not these files.** They were written before or
during implementation and some have drifted. Each entry below says how far.
Where a document and the code disagree, the code wins and the document is history.

| Document | Author | Status |
| --- | --- | --- |
| [`architecture.md`](./architecture.md) | Alex (Staff Architect) | Current in shape. Module boundaries, retrieval pipeline, and the no-LLM constraint all still hold. |
| [`pm-spec.md`](./pm-spec.md) | Morgan (PM Lead) | Current. The acceptance criteria are still the contract the tests are written against. AC 5 is the tag rule below. |
| [`storage-architecture.md`](./storage-architecture.md) | Alex | Implemented. The header says "not yet implemented"; that is out of date. See `src/storage/`. |
| [`design.md`](./design.md) | Jordan (Design Lead) | Partly superseded. Layout, states, and reasoning are sound. The token names are not: this spec uses `--border-subtle` and `--dur-micro`, the app ships the Finance vocabulary (`--color-border`, `--space-*`). Read `src/styles/tokens.css` for real values. |
| [`inline-reasoning-design.md`](./inline-reasoning-design.md) | Jordan | A delta on `design.md`, not a replacement. Same token caveat. |
| [`a11y-audit.md`](./a11y-audit.md) | Sasha (A11y Auditor) | Historical. The full original finding list. Most items are fixed. |
| [`a11y-reaudit.md`](./a11y-reaudit.md) | Sasha | Supersedes the audit above for regression status. Read this one first. |

## The one rule worth knowing before you edit anything

**The note body is the source of truth for tags.** Tags are `#word` tokens written
into the body text. On every save, `useNotes.updateNote` re-extracts them from the
body and keeps only what it finds, plus the `sample` provenance tag. A tag that
exists only in a file's frontmatter is silently dropped the first time that note is
edited.

This is deliberate and specified as AC 5 in `pm-spec.md`, and it is exercised by
`src/hooks/useNotes.tags.test.ts`. It is also easy to violate when generating notes
outside the app, which has already caused one round of data loss. Anything that
writes `.md` files directly must put the tags in the body.

## Testing gap to be aware of

The Vitest block in `vite.config.ts` sets `css: false`, so no stylesheet is loaded during tests. Every
visual decision in these specs is unverified by the suite. Styling regressions are
currently caught by eye alone.
