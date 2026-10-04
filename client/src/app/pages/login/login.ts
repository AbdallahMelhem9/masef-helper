import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrownianPath } from '../../shared/brownian';

// signin / signup: the account forms. forgot: asks for an email to send a reset
// link to. reset: opened from that link (/reset-password?token=...), sets a new password.
type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

const FAILED: Record<Mode, string> = {
  signin: 'Login failed',
  signup: 'Sign-up failed',
  forgot: 'Could not send the reset email',
  reset: 'Could not reset the password',
};

@Component({
  selector: 'app-login',
  imports: [FormsModule, BrownianPath],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  mode = signal<Mode>('signin');
  loading = signal(false);
  error = signal('');
  notice = signal('');

  email = '';
  password = '';
  confirm = '';
  name = '';
  token = '';

  async ngOnInit() {
    if (this.route.snapshot.data['reset']) {
      this.mode.set('reset');
      this.token = this.route.snapshot.queryParamMap.get('token') || '';
      if (!this.token) this.error.set('This reset link is incomplete. Request a new one from the sign-in page.');
      return;
    }
    if (this.route.snapshot.queryParamMap.get('reset') === 'ok') {
      this.notice.set('Password updated. Sign in with your new password.');
    }
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

  setMode(mode: Mode) {
    this.mode.set(mode);
    this.error.set('');
    this.notice.set('');
  }

  backToSignIn() {
    if (this.mode() === 'reset') this.router.navigate(['/login']);
    else this.setMode('signin');
  }

  async submit() {
    const mode = this.mode();
    this.error.set('');
    this.notice.set('');

    if (mode === 'reset') {
      if (this.password.length < 6) return this.error.set('Password must be at least 6 characters');
      if (this.password !== this.confirm) return this.error.set('The two passwords do not match');
    } else if (!this.email || (mode !== 'forgot' && !this.password)) {
      return;
    }

    this.loading.set(true);
    try {
      if (mode === 'forgot') {
        this.notice.set((await this.auth.forgot(this.email)).message);
      } else if (mode === 'reset') {
        await this.auth.reset(this.token, this.password);
        this.router.navigate(['/login'], { queryParams: { reset: 'ok' } });
      } else {
        if (mode === 'signup') await this.auth.signup(this.email, this.password, this.name || undefined);
        else await this.auth.login(this.email, this.password);
        this.router.navigate(['/courses']);
      }
    } catch (err: any) {
      this.error.set(err?.error?.error || FAILED[mode]);
    } finally {
      this.loading.set(false);
    }
  }
}
