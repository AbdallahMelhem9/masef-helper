import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CodingSummary } from '../../core/models';

// /coding: the finance firms with LeetCode lists, grouped by kind of firm.
@Component({
  selector: 'app-coding-home',
  imports: [RouterLink],
  templateUrl: './coding-home.html',
  styleUrls: ['../teasers/teasers.css', './coding.css'],
})
export class CodingHome implements OnInit {
  private api = inject(ApiService);

  data = signal<CodingSummary | null>(null);
  error = signal('');
  query = signal('');

  groups = computed(() => {
    const d = this.data();
    if (!d) return [];
    const q = this.query().trim().toLowerCase();
    return d.groups
      .map((g) => ({ ...g, firms: d.firms.filter((f) => f.group === g.key && (!q || f.name.toLowerCase().includes(q))) }))
      .filter((g) => g.firms.length);
  });

  ngOnInit() {
    this.api
      .getCoding()
      .then((d) => this.data.set(d))
      .catch((err) => this.error.set(err?.error?.error || 'Could not load the coding lists'));
  }

  pct(done: number, total: number): number {
    return total ? Math.round((100 * done) / total) : 0;
  }
}
