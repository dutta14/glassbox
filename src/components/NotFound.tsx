import { Link } from "react-router-dom";
import "../styles/NotFound.css";

interface NotFoundProps {
  /** What the URL asked for, shown so the message is specific rather than blank. */
  what: "note" | "chat" | "page";
}

/**
 * The calm end of a dead link.
 *
 * Old history entries outlive the things they point at: a note gets deleted,
 * the back button still remembers its URL, and a hand-typed path can name
 * anything at all. None of those should blank the stage or throw. They land
 * here instead, with one plain sentence and a way back to a new chat, which is
 * the one destination guaranteed to exist.
 */
export const NotFound = ({ what }: NotFoundProps) => {
  const label =
    what === "note"
      ? "That note doesn’t exist. It may have been deleted."
      : what === "chat"
        ? "That chat doesn’t exist. It may have been deleted."
        : "There’s nothing at this address.";

  return (
    <div className="not-found" role="status">
      <p className="not-found__message">{label}</p>
      <Link className="not-found__back" to="/">
        Start a new chat
      </Link>
    </div>
  );
};
