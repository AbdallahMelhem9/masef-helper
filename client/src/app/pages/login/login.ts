import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrownianPath } from '../../shared/brownian';

@Component({
  selector: 'app-login',
  imports: [FormsModule, BrownianPath],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  // Which form is shown: sign in to an existing account, or create one.
  mode = signal<'signin' | 'signup'>('signin');
  loading = signal(false);
  error = signal('');

  email = '';
  password = '';
  name = '';

  async ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/courses']);
      return;
    }
    try {
      const s = await this.auth.status();
      if (s.firstRun) this.mode.set('signup');
    } catch {
      this.error.set('Cannot reach the server. Is it running on port 3000?');
    }
  }

  setMode(mode: 'signin' | 'signup') {
    this.mode.set(mode);
    this.error.set('');
  }

  async submit() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.mode() === 'signup') await this.auth.signup(this.email, this.password, this.name || undefined);
      else await this.auth.login(this.email, this.password);
      this.router.navigate(['/courses']);
    } catch (err: any) {
      this.error.set(err?.error?.error || (this.mode() === 'signup' ? 'Sign-up failed' : 'Login failed'));
    } finally {
      this.loading.set(false);
    }
  }
}
