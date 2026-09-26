import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { FolderState } from "../hooks/useStorageBackend";
import type { Theme } from "../hooks/useTheme";
import { StorageControl } from "./StorageControl";
import { ThemeToggle } from "./ThemeToggle";
import "../styles/SettingsModal.css";

interface SettingsModalProps {
  open: boolean;
  folderState: FolderState;
  folderName: string | null;
  connectError: string | null;
  theme: Theme;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  onToggleTheme: () => void;
  onClose: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const SettingsModal = ({
  open,
  folderState,
  folderName,
  connectError,
  theme,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  onToggleTheme,
  onClose,
}: SettingsModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  /* The rest of the app is inert while this is up, so a screen reader cannot
     walk out of the dialog into the rail behind it. */
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    if (!root) return;
    const hadInert = root.hasAttribute("inert");
    root.setAttribute("inert", "");
    return () => {
      if (!hadInert) root.removeAttribute("inert");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute("inert"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="settings-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="settings-modal"
      >
        <header className="settings-modal__header">
          <h2 id={titleId} className="settings-modal__title">
            Settings
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="settings-modal__close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m4 4 8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <section className="settings-modal__section">
          <h3 className="settings-modal__section-title">
            Where notes are kept
          </h3>
          <StorageControl
            folderState={folderState}
            folderName={folderName}
            connectError={connectError}
            onConnect={onConnectFolder}
            onReconnect={onReconnectFolder}
            onDisconnect={onDisconnectFolder}
          />
        </section>

        <section className="settings-modal__section">
          <h3 className="settings-modal__section-title">Appearance</h3>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </section>
      </div>
    </div>,
    document.body,
  );
};
