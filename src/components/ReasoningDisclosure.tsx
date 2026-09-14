import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Answer } from '../types';
import { displayTerms, stem } from '../engine/tokenize';
import { tierFor, type ConfidenceTier } from '../engine/router';
import { CandidateRow } from './CandidateRow';
import '../styles/ReasoningDisclosure.css';

interface ReasoningDisclosureProps {
  answer: Answer;
  userQuery: string | null;
  onOpenCandidate: (noteId: string) => void;
}

const TIER_LABEL: Record<ConfidenceTier, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

const TITLE_MAX = 32;

const truncateTitle = (title: string): string => {
  const clean = title.trim() || 'Untitled note';
  if (clean.length <= TITLE_MAX) return clean;
  return `${clean.slice(0, TITLE_MAX - 1)}…`;
};

export const ReasoningDisclosure = ({
  answer,
  userQuery,
  onOpenCandidate,
}: ReasoningDisclosureProps) => {
  const [expanded, setExpanded] = useState(false);
  const summaryRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (expanded) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [expanded]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const handlePanelKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setExpanded(false);
      summaryRef.current?.focus();
    }
  }, []);

  const topSource = answer.sources[0];
  const isRefusal = topSource === undefined;
  const tier: ConfidenceTier | 'refused' = isRefusal
    ? 'refused'
    : tierFor(topSource);
  const m = answer.trace.candidatesConsidered;
  const n = answer.sources.length;

  const displayed = userQuery ? displayTerms(userQuery) : [];

  return (
    <div className="reason">
      <button
        ref={summaryRef}
        type="button"
        className="reason__summary"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggle}
        data-tier={tier}
      >
        <span className="reason__chevron" aria-hidden="true" />
        <span
          className={`reason__dot${
            tier === 'refused' ? ' reason__dot--ring' : ''
          }`}
          data-tier={tier}
          aria-hidden="true"
        />
        <span className="reason__label">
          {isRefusal ? 'No match' : TIER_LABEL[tier as ConfidenceTier]}
        </span>
        {isRefusal ? (
          m > 0 ? (
            <>
              <span className="reason__sep" aria-hidden="true">·</span>
              <span className="reason__meta-text">
                nothing in your notes covered this
              </span>
              <span className="reason__sep" aria-hidden="true">·</span>
              <span className="reason__meta-text">{m} passages searched</span>
            </>
          ) : (
            <>
              <span className="reason__sep" aria-hidden="true">·</span>
              <span className="reason__meta-text">you have no notes yet</span>
            </>
          )
        ) : (
          <>
            <span className="reason__sep" aria-hidden="true">·</span>
            <span className="reason__source">
              from {truncateTitle(topSource.noteTitle)}
            </span>
            <span className="reason__sep" aria-hidden="true">·</span>
            <span className="reason__meta-text">
              {n} of {m} passages
            </span>
          </>
        )}
      </button>

      <div
        className="reason__panel-wrap"
        data-expanded={expanded}
      >
        <div
          id={panelId}
          ref={panelRef}
          role="region"
          aria-label="Reasoning for this answer"
          aria-live="off"
          className="reason__panel"
          onKeyDown={handlePanelKey}
        >
          <ReasoningPanelContent
            answer={answer}
            displayed={displayed}
            isRefusal={isRefusal}
            onOpenCandidate={onOpenCandidate}
          />
        </div>
      </div>
    </div>
  );
};

interface ReasoningPanelContentProps {
  answer: Answer;
  displayed: string[];
  isRefusal: boolean;
  onOpenCandidate: (noteId: string) => void;
}

const ReasoningPanelContent = ({
  answer,
  displayed,
  isRefusal,
  onOpenCandidate,
}: ReasoningPanelContentProps) => {
  const terms = answer.trace.queryTerms;
  const results = answer.trace.results;
  const topScore = results[0]?.score ?? 1;

  return (
    <div className="reason__card">
      <dl className="reason__meta">
        <div className="reason__row">
          <dt>Intent</dt>
          <dd>
            <span className="reason__pill">{answer.trace.intent}</span>
          </dd>
        </div>
        <div className="reason__row">
          <dt>Terms</dt>
          <dd className="reason__terms">
            {termChips(displayed, terms)}
          </dd>
        </div>
      </dl>

      {results.length > 0 && (
        <section className="reason__ranked" aria-label="Ranked passages">
          <h3 className="reason__ranked-title">Ranked passages</h3>
          <ol className="reason__ranked-list">
            {results.slice(0, 5).map((candidate, i) => (
              <CandidateRow
                key={`${candidate.noteId}-${candidate.position}-${i}`}
                candidate={candidate}
                rank={i + 1}
                topScore={topScore}
                onOpen={() => onOpenCandidate(candidate.noteId)}
              />
            ))}
          </ol>
        </section>
      )}

      <div className="reason__why">
        <h3 className="reason__why-title">
          {isRefusal ? 'Why nothing matched' : 'Why this ranking'}
        </h3>
        <p className="reason__why-text">{answer.trace.reason}</p>
      </div>
    </div>
  );
};

const termChips = (displayed: string[], stemmed: string[]) => {
  if (stemmed.length === 0) {
    return (
      <span className="reason__value-muted">
        None after removing common words.
      </span>
    );
  }
  const stemSet = new Set(stemmed);
  const pairs: { raw: string; stem: string }[] = [];
  const seen = new Set<string>();
  for (const raw of displayed) {
    const s = stem(raw);
    if (!stemSet.has(s) || seen.has(s)) continue;
    seen.add(s);
    pairs.push({ raw, stem: s });
  }
  const finalPairs =
    pairs.length > 0 ? pairs : stemmed.map((s) => ({ raw: s, stem: s }));

  return finalPairs.map((p) => (
    <span key={p.stem} className="reason__term">
      {p.raw}
      {p.raw !== p.stem && <em> → {p.stem}</em>}
    </span>
  ));
};
