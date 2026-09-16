import "../styles/RailTip.css";

interface RailTipProps {
  /** Should repeat the host button's aria-label verbatim. */
  label: string;
}

/**
 * The label that appears beside an icon in the collapsed rail.
 *
 * Purely visual, so it is hidden from assistive tech: every host button
 * already carries the same string as its aria-label, and a screen reader
 * hitting both would hear the name twice. Rendering it as a real element
 * rather than a CSS ::after keeps it assertable in tests, which matters here
 * because the suite runs with styling disabled and cannot see generated
 * content at all.
 *
 * The host needs `.rail-tip-host` for the positioning to work.
 */
export const RailTip = ({ label }: RailTipProps) => (
  <span className="rail-tip" aria-hidden="true">
    {label}
  </span>
);
