import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { COPY } from '../engine/copy';
import '../styles/ChatInput.css';

interface ChatInputProps {
  disabled: boolean;
  onSubmit: (text: string) => void;
}

const MAX_CHARS = 500;
const COUNTER_WARNING = 450;

export const ChatInput = ({ disabled, onSubmit }: ChatInputProps) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 6 * 24 + 24;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const placeholder = disabled ? COPY.placeholderChatEmpty : COPY.placeholderChat;
  const showCounter = value.length >= COUNTER_WARNING;

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      aria-label="Ask your notes"
    >
      <label className="sr-only" htmlFor="composer-input">
        Ask a question
      </label>
      <div className="composer__row">
        <textarea
          id="composer-input"
          ref={textareaRef}
          className="composer__input"
          rows={1}
          value={value}
          disabled={disabled}
          maxLength={MAX_CHARS}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="composer__send"
          disabled={disabled || value.trim().length === 0}
          aria-label="Send"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 8l12-6-6 12-2-5-4-1z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {showCounter && (
        <div className="composer__counter" aria-hidden="true">
          {value.length} / {MAX_CHARS}
        </div>
      )}
    </form>
  );
};
