import type { MouseEventHandler, Ref } from "react";
import { COPY } from "../engine/copy";
import type { NoteReading } from "../hooks/useNoteReading";
import { Highlight } from "./Highlight";
import "../styles/NoteEditor.css";

interface ReadingViewProps {
  reading: NoteReading;
  /** The search in progress, so every hit in the text is marked. */
  query?: string;
  measuring?: boolean;
  /** Kept from assistive technology, for a view that duplicates a field. */
  decorative?: boolean;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  ref?: Ref<HTMLDivElement>;
}

export const ReadingView = ({
  reading,
  query = "",
  measuring = false,
  decorative = false,
  onMouseDown,
  ref,
}: ReadingViewProps) => {
  const { isEmpty, hasBreaks, segments, readBody, cap } = reading;
  const text = (value: string) =>
    query === "" ? value : <Highlight text={value} query={query} />;

  return (
    <div
      ref={ref}
      aria-hidden={decorative ? "true" : undefined}
      className={`editor__body editor__read${
        isEmpty ? " editor__read--empty" : ""
      }`}
      data-dropcap={cap === 0 ? undefined : String(cap)}
      data-measuring={measuring ? "on" : undefined}
      onMouseDown={onMouseDown}
    >
      {isEmpty
        ? COPY.placeholderBody
        : hasBreaks
          ? segments.map((seg) =>
              seg.kind === "text" ? (
                <span key={seg.start} data-offset={seg.start}>
                  {text(seg.text)}
                </span>
              ) : (
                <span
                  key={seg.start}
                  className={`editor__break${
                    seg.opening ? " editor__break--opening" : ""
                  }`}
                  data-offset={seg.start}
                  data-break="true"
                >
                  <span className="editor__break-number">{seg.number}</span>
                </span>
              ),
            )
          : text(readBody)}
    </div>
  );
};
