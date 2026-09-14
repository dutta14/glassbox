import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTheme } from './useTheme';

const STORAGE_KEY = 'glassbox.theme.v1';

type Listener = (e: MediaQueryListEvent) => void;

/**
 * jsdom does not implement matchMedia, so each test installs its own stub.
 * The stub keeps its listeners so a test can simulate the OS flipping theme
 * while the app is open.
 */
const stubMatchMedia = (prefersDark: boolean) => {
  const listeners = new Set<Listener>();
  const mql = {
    matches: prefersDark,
    addEventListener: (_: string, fn: Listener) => {
      listeners.add(fn);
    },
    removeEventListener: (_: string, fn: Listener) => {
      listeners.delete(fn);
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  return {
    emit: (nowPrefersDark: boolean) => {
      mql.matches = nowPrefersDark;
      listeners.forEach((fn) =>
        fn({ matches: nowPrefersDark } as MediaQueryListEvent),
      );
    },
    listenerCount: () => listeners.size,
  };
};

beforeEach(() => {
  document.body.classList.remove('dark');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTheme', () => {
  it('follows the operating system when the user has made no choice', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('falls back to light when the operating system prefers light', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  /** Light is the default, so an absent matchMedia must not yield dark. */
  it('falls back to light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('prefers a stored choice over the operating system setting', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('ignores a stored value that is not a known theme', () => {
    localStorage.setItem(STORAGE_KEY, 'solarized');
    stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  /**
   * Finance's convention: light is the base theme and `body.dark` overrides
   * it. The class has to land on body, not the document element, or none of
   * the dark tokens resolve.
   */
  it('toggles the dark class on body so the tokens apply', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(document.body.classList.contains('dark')).toBe(true);

    act(() => result.current.toggleTheme());
    expect(document.body.classList.contains('dark')).toBe(false);
  });

  it('persists the chosen theme so it survives a reload', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('adopts a system theme change while the user has made no choice', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    act(() => media.emit(true));

    expect(result.current.theme).toBe('dark');
  });

  /**
   * The one that matters. Once someone picks a theme, the OS flipping at
   * sunset must not silently undo their choice.
   */
  it('keeps the user choice when the system theme changes afterwards', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');

    act(() => media.emit(true));

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('does not subscribe to system changes when a stored choice exists', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const media = stubMatchMedia(true);

    renderHook(() => useTheme());

    expect(media.listenerCount()).toBe(0);
  });
});
