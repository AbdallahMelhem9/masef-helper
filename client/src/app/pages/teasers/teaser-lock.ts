import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TeaserAccessService } from '../../core/teaser-access.service';

// Shown instead of the puzzles until the section's password is entered.
@Component({
  selector: 'app-teaser-lock',
  imports: [FormsModule],
  template: `
    <div class="lock">
      <div class="lock-card">
        <span class="lock-glyph" aria-hidden="true">?</span>
        <p class="eyebrow">Interview puzzles</p>
        <h1>This section is locked</h1>
        <p class="lock-sub">Enter the password to open the brain teasers, probability and company questions.</p>
        <form (ngSubmit)="submit()">
          <input
            type="password"
            name="password"
            [(ngModel)]="password"
            placeholder="Password"
            autocomplete="current-password"
            autofocus
            required
          />
          <button class="btn" type="submit" [disabled]="busy() || !password">{{ busy() ? 'Checking…' : 'Open' }}</button>
        </form>
        @if (error()) {
          <p class="error-note">{{ error() }}</p>
        }
      </div>
    </div>
  `,
  styles: `
    .lock {
      min-height: 80vh;
      display: grid;
      place-items: center;
      padding: 24px 16px;
    }
    .lock-card {
      position: relative;
      width: min(420px, 100%);
      padding: 30px 28px 26px;
      border-radius: 14px;
      background: var(--board);
      color: var(--chalk);
      box-shadow: var(--shadow-2);
      overflow: hidden;
    }
    .lock-glyph {
      position: absolute;
      right: 18px;
      top: -18px;
      font-family: var(--font-display);
      font-style: italic;
      font-weight: 700;
      font-size: 140px;
      line-height: 1;
      color: rgba(217, 166, 33, 0.16);
      pointer-events: none;
    }
    .eyebrow {
      color: var(--chalk-dim);
    }
    h1 {
      font-size: 26px;
      color: #fff;
      margin-top: 4px;
    }
    .lock-sub {
      color: var(--chalk-dim);
      font-size: 14px;
      margin: 8px 0 18px;
    }
    form {
      display: flex;
      gap: 8px;
    }
    input {
      flex: 1;
      min-width: 0;
      font: inherit;
      font-size: 16px;
      padding: 9px 12px;
      border-radius: 8px;
      border: 1px solid var(--board-2);
      background: #fff;
      color: var(--ink);
    }
    .error-note {
      margin: 12px 0 0;
    }
  `,
})
export class TeaserLock {
  private access = inject(TeaserAccessService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  password = '';
  busy = signal(false);
  error = signal('');

  async submit() {
    this.busy.set(true);
    this.error.set('');
    const ok = await this.access.unlock(this.password);
    this.busy.set(false);
    if (!ok) {
      this.error.set('Wrong password.');
      return;
    }
    this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('next') || '/teasers');
  }
}
