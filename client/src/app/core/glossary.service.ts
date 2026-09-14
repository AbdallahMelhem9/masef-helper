import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface GlossaryEntry {
  term: string;
  aliases: string[];
  def: string;
  src: string;
}

@Injectable({ providedIn: 'root' })
export class GlossaryService {
  // All matchable strings sorted longest-first, each pointing to its entry.
  readonly entries = signal<GlossaryEntry[]>([]);
  readonly matchers = signal<{ text: string; entry: GlossaryEntry }[]>([]);
  private loading = false;

  constructor(private http: HttpClient) {}

  async load() {
    if (this.loading || this.entries().length > 0) return;
    this.loading = true;
    try {
      const entries = await firstValueFrom(this.http.get<GlossaryEntry[]>('/api/glossary'));
      this.entries.set(entries);
      const matchers = entries
        .flatMap((entry) => [entry.term, ...entry.aliases].map((text) => ({ text, entry })))
        .sort((a, b) => b.text.length - a.text.length);
      this.matchers.set(matchers);
    } finally {
      this.loading = false;
    }
  }

  byTerm(term: string): GlossaryEntry | undefined {
    return this.entries().find((e) => e.term === term);
  }
}
