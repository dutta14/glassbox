import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'glassbox.theme.v1';

export type Theme = 'light' | 'dark';

const isTheme = (value: unknown): value is Theme =>
  value === 'light' || value === 'dark';

/**
 * An explicit choice, or null to follow the operating system. Reading is
 * wrapped because localStorage throws in some privacy modes, and a theme is
 * never worth failing a boot over.
 */
const readStored = (): Theme | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
};

const writeStored = (theme: Theme): void => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Non-fatal. The theme still applies for this session.
  }
};

const systemTheme = (): Theme =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

export const resolveInitialTheme = (): Theme => readStored() ?? systemTheme();

export interface UseThemeResult {
  theme: Theme;
  toggleTheme: () => void;
}

export const useTheme = (): UseThemeResult => {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  /**
   * Follow the OS only while the user has not made a choice of their own. Once
   * they pick a theme, a system change must not silently override it.
   */
  useEffect(() => {
    if (readStored() !== null) return;
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (readStored() !== null) return;
      setTheme(e.matches ? 'dark' : 'light');
    };

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      writeStored(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
};
