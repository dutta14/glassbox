import { useEffect, useRef, useState } from 'react';
import type { FolderState } from '../hooks/useStorageBackend';
import '../styles/StorageControl.css';

interface StorageControlProps {
  folderState: FolderState;
  folderName: string | null;
  connectError: string | null;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

const FolderIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6c.4 0 .77.16 1.06.44l.9.88c.28.29.65.44 1.05.44H12.5A1.5 1.5 0 0 1 14 6.26V12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4.5Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const BrowserIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const label = (state: FolderState, folderName: string | null): string => {
  switch (state) {
    case 'connected':
      return folderName ?? 'Folder';
    case 'needs-reconnect':
      return folderName ? `Reconnect ${folderName}` : 'Reconnect folder';
    case 'denied':
      return 'Folder access denied';
    case 'disconnected':
      return 'This browser';
    case 'unsupported':
      return 'This browser';
    default:
      return 'This browser';
  }
};

export const StorageControl = ({
  folderState,
  folderName,
  connectError,
  onConnect,
  onReconnect,
  onDisconnect,
}: StorageControlProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeAndRestore = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>(
      'button, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closeAndRestore();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeAndRestore();
      }
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const status = label(folderState, folderName);
  const isFolder = folderState === 'connected';

  const description = ((): string => {
    switch (folderState) {
      case 'connected':
        return `Your notes save to ${folderName}. Sync it with Google Drive if you want them on another machine.`;
      case 'needs-reconnect':
        return 'Chrome needs a click to reopen the folder after a reload. Notes are saving to this browser until you reconnect.';
      case 'denied':
        return 'Folder access was denied for this session. Notes are saving to this browser.';
      case 'disconnected':
        return 'Notes are saving to this browser. Choose a folder to save them as Markdown files on disk.';
      case 'unsupported':
        return 'Folder sync is only available in Chrome or Edge. Your notes stay in this browser.';
      default:
        return '';
    }
  })();

  return (
    <div className="storage-control" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`storage-control__trigger${isFolder ? ' storage-control__trigger--folder' : ''}${
          folderState === 'needs-reconnect' ? ' storage-control__trigger--warn' : ''
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={status}
      >
        <span className="storage-control__icon">
          {isFolder ? <FolderIcon /> : <BrowserIcon />}
        </span>
        <span className="storage-control__label">{status}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="storage-control__menu"
          role="group"
          aria-label="Storage options"
        >
          <p className="storage-control__desc">{description}</p>

          {folderState === 'needs-reconnect' && (
            <button
              type="button"
              className="storage-control__action storage-control__action--primary"
              onClick={() => {
                closeAndRestore();
                onReconnect();
              }}
            >
              Reconnect folder
            </button>
          )}

          {folderState === 'disconnected' && (
            <button
              type="button"
              className="storage-control__action storage-control__action--primary"
              onClick={() => {
                closeAndRestore();
                onConnect();
              }}
            >
              Connect folder
            </button>
          )}

          {folderState === 'denied' && (
            <button
              type="button"
              className="storage-control__action storage-control__action--primary"
              onClick={() => {
                closeAndRestore();
                onConnect();
              }}
            >
              Choose a folder
            </button>
          )}

          {folderState === 'connected' && (
            <>
              <button
                type="button"
                className="storage-control__action"
                onClick={() => {
                  closeAndRestore();
                  onConnect();
                }}
              >
                Change folder
              </button>
              <button
                type="button"
                className="storage-control__action storage-control__action--danger"
                onClick={() => {
                  closeAndRestore();
                  onDisconnect();
                }}
              >
                Disconnect folder
              </button>
            </>
          )}

          {connectError && (
            <p className="storage-control__error" role="alert">
              {connectError}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
