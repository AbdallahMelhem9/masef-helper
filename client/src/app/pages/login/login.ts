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

  firstRun = signal(false);
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
      this.firstRun.set(s.firstRun);
    } catch {
      this.error.set('Cannot reach the server. Is it running on port 3000?');
    }
  }

  async submit() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.email, this.password, this.name || undefined);
      this.router.navigate(['/courses']);
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Login failed');
    } finally {
      this.loading.set(false);
    }
  }
}
