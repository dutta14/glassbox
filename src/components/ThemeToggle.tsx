import type { Theme } from "../hooks/useTheme";
import "../styles/ThemeToggle.css";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

const SunIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M8 1.2v1.6M8 13.2v1.6M14.8 8h-1.6M2.8 8H1.2M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1M12.8 12.8l-1.1-1.1M4.3 4.3L3.2 3.2"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Two explicit choices rather than one toggle. A single button labelled "Dark
 * mode" cannot say whether that is the state or the action, which is tolerable
 * in a rail foot and not in a settings dialog where the reader has come
 * specifically to check. Selecting the active theme is a no-op, so a double
 * press cannot flip it by accident.
 */
export const ThemeToggle = ({ theme, onToggle }: ThemeToggleProps) => (
  <div className="theme-toggle" role="group" aria-label="Theme">
    <button
      type="button"
      className={`theme-toggle__option${theme === "light" ? " theme-toggle__option--active" : ""}`}
      aria-pressed={theme === "light"}
      onClick={() => {
        if (theme === "dark") onToggle();
      }}
    >
      <span className="theme-toggle__icon">
        <SunIcon />
      </span>
      Light
    </button>
    <button
      type="button"
      className={`theme-toggle__option${theme === "dark" ? " theme-toggle__option--active" : ""}`}
      aria-pressed={theme === "dark"}
      onClick={() => {
        if (theme === "light") onToggle();
      }}
    >
      <span className="theme-toggle__icon">
        <MoonIcon />
      </span>
      Dark
    </button>
  </div>
);
