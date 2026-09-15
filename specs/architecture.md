# Glassbox — Architecture

**Author:** Alex (Staff Architect)
**Status:** Draft for PM / Design / Eng

## Problem

A note-taking app where the user can ask questions about their own notes and get
answers, with no LLM anywhere in the stack.

The insight that makes this tractable: for personal notes, **the answer already
exists in something the user wrote**. We do not need generation. We need
retrieval that is good enough to find the right passage, and an interface that
presents that passage as an answer. This cannot hallucinate, because every word
returned was typed by the user.

## Non-goals

- No text generation, summarisation, or paraphrasing.
- No backend, no accounts, no network calls at all.
- No embeddings / vector DB / WASM models. Classic IR only.

## Stack

React 19 + TypeScript + Vite. Vitest + React Testing Library. localStorage.
Deploys as static files to GitHub Pages.

## Data model

```ts
Note   { id, title, body, tags[], createdAt, updatedAt }
Chunk  { noteId, noteTitle, position, text }   // paragraph-sized
Answer { text, sources: ScoredChunk[], trace: Trace }
Trace  { intent, confidence, queryTerms, candidatesConsidered, results, reason }
```

Notes are the only persisted entity. Everything else is derived at runtime.

## Retrieval design (built, needs review)

`src/engine/tokenize.ts` — lowercase, strip punctuation, drop stopwords, light
suffix stripping. Deliberately not a full Porter stemmer; it only collapses the
endings that cause real misses in short notes, and refuses to touch words ≤4
chars where stripping produces garbage.

`src/engine/tfidf.ts` — chunks notes by paragraph, builds a TF-IDF index with
smoothed IDF `log((N+1)/(df+1)) + 1`, log-normalised TF, L2-normalised vectors,
cosine similarity. Scoring prepends the note title to each chunk so a note
titled "Postgres indexing" matches a postgres query even if the body never
repeats the word.

**Why chunk by paragraph:** whole-note scoring buries a one-line answer inside a
long note. Paragraph chunks let the UI quote the exact passage.

**Complexity:** index build is O(total terms), rebuilt on note change. Search
iterates the *query* vector per chunk, so O(chunks × query terms). At realistic
personal scale (<5k chunks) this is sub-millisecond and needs no worker.

## Query router

Not every question is a search. Classify, then dispatch:

| Intent | Example | Handler |
|---|---|---|
| `search` | "what did I write about postgres" | TF-IDF, quote top passage |
| `count` | "how many notes do I have" | deterministic count |
| `recent` | "what did I write last week" | date filter |
| `tag` | "show me #work notes" | tag filter |
| `greeting` / `help` | "hi", "what can you do" | canned |
| `unknown` | — | honest "I don't know", suggest rephrase |

Confidence gate: below a similarity floor, return "I could not find this in your
notes" rather than the best of a bad set. **Saying nothing is better than saying
something wrong** — that is the entire credibility of this product.

## The differentiator: the glass box

Every answer ships with its reasoning: matched intent, confidence, query terms
after stemming, how many chunks were considered, and the ranked candidates with
scores. An LLM is a black box that is confidently wrong. This is a glass box
that is either right or admits it isn't.

This is the product, not a debug panel. It should be designed, not bolted on.

## Module boundaries

```
src/types.ts              shared types, no logic
src/engine/tokenize.ts    pure, no deps
src/engine/tfidf.ts       depends on tokenize + types only
src/engine/router.ts      depends on tfidf; owns intents; returns Answer
src/storage/notes.ts      localStorage CRUD; the ONLY module touching storage
src/hooks/                React state over the above
src/components/           dumb-ish UI
```

The engine must never import React. It has to stay testable as plain functions.

## Risks

1. **Cold start.** Zero notes means zero answers, and the app looks broken.
   Needs seeded demo notes or a strong empty state. PM must specify.
2. **Retrieval quality on small corpora.** IDF is unstable with <10 chunks.
   Mitigation: confidence floor plus honest failure.
3. **Vocabulary mismatch.** User asks "db" but wrote "database". Classic IR
   weakness with no fix short of a synonym list. Accept and be honest about it.
4. **Scope creep into fake AI.** Any temptation to template answers into
   sentences the user did not write reintroduces hallucination. Hard no.

## Open questions for PM

- Seed with demo notes on first run, or empty state?
- Does the chat need persistent history, or is it ephemeral per session?
- Editing a note while chat references it: stale sources or live re-resolve?
