import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark' | 'system';

function createThemeStore() {
  const STORAGE_KEY = 'notion-clone-theme';

  // Get initial theme from localStorage or default to system
  const getInitialTheme = (): Theme => {
    if (!browser) return 'system';

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }

    return 'system';
  };

  const { subscribe, set, update } = writable<Theme>(getInitialTheme());

  // Apply theme to document
  const applyTheme = (theme: Theme) => {
    if (!browser) return;

    const root = document.documentElement;

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
  };

  // Listen for system theme changes
  if (browser) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      const currentTheme = getInitialTheme();
      if (currentTheme === 'system') {
        applyTheme('system');
      }
    });
  }

  return {
    subscribe,
    set: (theme: Theme) => {
      if (browser) {
        localStorage.setItem(STORAGE_KEY, theme);
        applyTheme(theme);
      }
      set(theme);
    },
    toggle: () => {
      update(current => {
        const next = current === 'light' ? 'dark' : 'light';
        if (browser) {
          localStorage.setItem(STORAGE_KEY, next);
          applyTheme(next);
        }
        return next;
      });
    },
    init: () => {
      if (browser) {
        const theme = getInitialTheme();
        applyTheme(theme);
        set(theme);
      }
    }
  };
}

export const theme = createThemeStore();