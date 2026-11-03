import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
const KEY = 'edge-ai-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.read());

  constructor() {
    effect(() => {
      document.documentElement.dataset['theme'] = this.theme();
      localStorage.setItem(KEY, this.theme());
    });
  }

  toggle(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private read(): Theme {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
