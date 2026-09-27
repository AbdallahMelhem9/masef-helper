import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export const TEASER_PASS_KEY = 'masef_teaser_pass';

// The puzzles section is password-protected (the owner's account is always
// let in). The password, once accepted, is kept in this browser and sent
// with every puzzle request by the auth interceptor.
@Injectable({ providedIn: 'root' })
export class TeaserAccessService {
  private http = inject(HttpClient);
  private unlocked: boolean | null = null;

  async check(): Promise<boolean> {
    if (this.unlocked) return true;
    try {
      const r = await firstValueFrom(this.http.get<{ unlocked: boolean }>('/api/teasers/access'));
      this.unlocked = r.unlocked;
    } catch {
      this.unlocked = false;
    }
    return this.unlocked;
  }

  async unlock(password: string): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post('/api/teasers/unlock', { password }));
    } catch {
      return false;
    }
    localStorage.setItem(TEASER_PASS_KEY, password);
    this.unlocked = true;
    return true;
  }

  // Forget the answer on sign-out (another account may use this browser).
  reset() {
    this.unlocked = null;
  }
}
