import type { Chunk, Note, ScoredChunk } from '../types';
import { tokenize } from './tokenize';

/** Splits a note into paragraph-sized chunks so retrieval points at a passage, not a whole note. */
export const chunkNote = (note: Note): Chunk[] => {
  const paragraphs = note.body
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

  const source = paragraphs.length > 0 ? paragraphs : [note.title];

  return source.map((text, position) => ({
    noteId: note.id,
    noteTitle: note.title,
    position,
    text,
  }));
};

export interface TfIdfIndex {
  chunks: Chunk[];
  vectors: Map<string, number>[];
  idf: Map<string, number>;
  size: number;
}

const termFrequencies = (terms: string[]): Map<string, number> => {
  const tf = new Map<string, number>();
  for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1);
  return tf;
};

export const buildIndex = (notes: Note[]): TfIdfIndex => {
  const chunks = notes.flatMap(chunkNote);
  // The note title is folded into each chunk's scoring text so a note titled
  // "Postgres indexing" still matches a postgres query when the body never
  // repeats the word. chunk.text stays clean for display.
  const chunkTerms = chunks.map((chunk) => tokenize(`${chunk.noteTitle} ${chunk.text}`));

  const documentFrequency = new Map<string, number>();
  for (const terms of chunkTerms) {
    for (const term of new Set(terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const total = chunks.length;
  const idf = new Map<string, number>();
  for (const [term, df] of documentFrequency) {
    // Smoothed IDF keeps the value positive even for a term present in every chunk.
    idf.set(term, Math.log((total + 1) / (df + 1)) + 1);
  }

  const vectors = chunkTerms.map((terms) => {
    const tf = termFrequencies(terms);
    const vector = new Map<string, number>();
    let norm = 0;
    for (const [term, count] of tf) {
      const weight = (1 + Math.log(count)) * (idf.get(term) ?? 0);
      vector.set(term, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) for (const [term, weight] of vector) vector.set(term, weight / norm);
    return vector;
  });

  return { chunks, vectors, idf, size: total };
};

const queryVector = (terms: string[], idf: Map<string, number>): Map<string, number> => {
  const tf = termFrequencies(terms);
  const vector = new Map<string, number>();
  let norm = 0;
  for (const [term, count] of tf) {
    const weight = (1 + Math.log(count)) * (idf.get(term) ?? 0);
    if (weight === 0) continue;
    vector.set(term, weight);
    norm += weight * weight;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [term, weight] of vector) vector.set(term, weight / norm);
  return vector;
};

export const search = (index: TfIdfIndex, query: string, topK = 5): ScoredChunk[] => {
  const terms = tokenize(query);
  if (terms.length === 0 || index.size === 0) return [];
  const uniqueQueryTerms = new Set(terms);

  const qv = queryVector(terms, index.idf);
  if (qv.size === 0) return [];

  const scored: ScoredChunk[] = [];
  index.vectors.forEach((vector, i) => {
    let score = 0;
    const matched: string[] = [];
    // Iterate the query vector, not the document: queries are short, so this
    // is O(query terms) per chunk instead of O(chunk terms).
    for (const [term, weight] of qv) {
      const docWeight = vector.get(term);
      if (docWeight === undefined) continue;
      score += weight * docWeight;
      matched.push(term);
    }
    if (score > 0) {
      scored.push({
        ...index.chunks[i],
        score,
        matchedTerms: matched,
        // Cosine similarity alone cannot tell "1 of 5 query words matched
        // strongly" from "5 of 5 matched". Coverage exposes that difference so
        // the router can reject a confident-looking but mostly irrelevant hit.
        coverage: matched.length / uniqueQueryTerms.size,
      });
    }
  });

  return scored.sort((a, b) => b.score - a.score || a.noteTitle.localeCompare(b.noteTitle)).slice(0, topK);
};
