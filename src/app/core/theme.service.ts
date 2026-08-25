import { effect, Service, signal } from '@angular/core';

const STORAGE_KEY = 'stampyx.theme';

const DARK_CLASS = 'app-dark';

@Service()
export class ThemeService {
  readonly isDark = signal(initialPreference());

  constructor() {
    effect(() => {
      const dark = this.isDark();
      document.documentElement.classList.toggle(DARK_CLASS, dark);
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.isDark.update((dark) => !dark);
  }
}

function initialPreference(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') {
    return stored === 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
