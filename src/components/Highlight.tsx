import { splitByHits } from "../utils/searchNotes";
import "../styles/Highlight.css";

interface HighlightProps {
  text: string;
  query: string;
}

/** The text with every occurrence of the query wrapped in <mark>. Reads the
    same to a screen reader as the plain text. */
export const Highlight = ({ text, query }: HighlightProps) => (
  <>
    {splitByHits(text, query).map((part, i) =>
      part.hit ? <mark key={i}>{part.text}</mark> : part.text,
    )}
  </>
);
