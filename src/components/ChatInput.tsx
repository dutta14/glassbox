import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { COPY } from "../engine/copy";
import { useScrollFades } from "../hooks/useScrollFades";
import "../styles/ChatInput.css";

interface ChatInputProps {
  disabled: boolean;
  onSubmit: (text: string) => void;
}

const MAX_CHARS = 2000;
const COUNTER_WARNING = 1800;

export const ChatInput = ({ disabled, onSubmit }: ChatInputProps) => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useScrollFades(textareaRef, [value]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 6 * 24 + 24;
    const needed = el.scrollHeight;
    el.style.height = `${Math.min(needed, maxHeight)}px`;
    // The box grows to fit, so a scrollbar is only ever needed past the cap.
    // Leaving overflow on auto let a scrollbar sit against the pill's rounded
    // edge and read as a grey sliver outside the border.
    el.style.overflowY = needed > maxHeight ? "auto" : "hidden";
  }, [value]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter is the only way to send, so an IME confirming a candidate must not
    // be mistaken for a submit. Composing Enter keeps the text in the box.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const placeholder = disabled
    ? COPY.placeholderChatEmpty
    : COPY.placeholderChat;
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
          className="composer__input scroll-fades"
          rows={1}
          value={value}
          disabled={disabled}
          maxLength={MAX_CHARS}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      {showCounter && (
        <div className="composer__counter" aria-hidden="true">
          {value.length} / {MAX_CHARS}
        </div>
      )}
    </form>
  );
};
