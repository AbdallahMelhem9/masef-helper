import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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

  async logout() {
    await this.auth.logout();
    // The puzzles password belongs to this session, not the browser.
    localStorage.removeItem(TEASER_PASS_KEY);
    this.teaserAccess.reset();
    this.router.navigate(['/login']);
  }
}
