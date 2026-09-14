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
const stubMatchMedia = (prefersLight: boolean) => {
  const listeners = new Set<Listener>();
  const mql = {
    matches: prefersLight,
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
    emit: (nowPrefersLight: boolean) => {
      mql.matches = nowPrefersLight;
      listeners.forEach((fn) =>
        fn({ matches: nowPrefersLight } as MediaQueryListEvent),
      );
    },
    listenerCount: () => listeners.size,
  };
};

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTheme', () => {
  it('follows the operating system when the user has made no choice', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('falls back to dark when the operating system prefers dark', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('falls back to dark when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('prefers a stored choice over the operating system setting', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('ignores a stored value that is not a known theme', () => {
    localStorage.setItem(STORAGE_KEY, 'solarized');
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('writes the chosen theme to the document element so the tokens apply', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('persists the chosen theme so it survives a reload', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('adopts a system theme change while the user has made no choice', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');

    act(() => media.emit(true));

    expect(result.current.theme).toBe('light');
  });

  /**
   * The one that matters. Once someone picks a theme, the OS flipping at
   * sunset must not silently undo their choice.
   */
  it('keeps the user choice when the system theme changes afterwards', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');

    act(() => media.emit(false));

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('does not subscribe to system changes when a stored choice exists', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    const media = stubMatchMedia(false);

    renderHook(() => useTheme());

    expect(media.listenerCount()).toBe(0);
  });
});
