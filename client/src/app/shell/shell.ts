import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { TEASER_PASS_KEY, TeaserAccessService } from '../core/teaser-access.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  auth = inject(AuthService);
  private router = inject(Router);
  private teaserAccess = inject(TeaserAccessService);

  // Every page of the interview-prep tab (puzzles, coding prep, the lock page).
  private readonly PREP_PREFIXES = ['/teasers', '/teaser/', '/coding', '/prep', '/puzzles-locked'];
  private url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );
  prepActive = () => this.PREP_PREFIXES.some((p) => this.url().startsWith(p));

  async logout() {
    await this.auth.logout();
    // The puzzles password belongs to this session, not the browser.
    localStorage.removeItem(TEASER_PASS_KEY);
    this.teaserAccess.reset();
    this.router.navigate(['/login']);
  }
}
