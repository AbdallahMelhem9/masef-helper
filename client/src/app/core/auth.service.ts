import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoginResponse } from './models';

const TOKEN_KEY = 'masef_token';
const EMAIL_KEY = 'masef_email';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly email = signal<string | null>(localStorage.getItem(EMAIL_KEY));

  constructor(private http: HttpClient) {}

  isLoggedIn(): boolean {
    return !!this.token();
  }

  async status(): Promise<{ firstRun: boolean }> {
    return firstValueFrom(this.http.get<{ firstRun: boolean }>('/api/auth/status'));
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    return this.start(await firstValueFrom(this.http.post<LoginResponse>('/api/auth/login', { email, password })));
  }

  async signup(email: string, password: string, name?: string): Promise<LoginResponse> {
    return this.start(await firstValueFrom(this.http.post<LoginResponse>('/api/auth/signup', { email, password, name })));
  }

  private start(res: LoginResponse): LoginResponse {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(EMAIL_KEY, res.email);
    this.token.set(res.token);
    this.email.set(res.email);
    return res;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // Session may already be gone; clear locally regardless.
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    this.token.set(null);
    this.email.set(null);
  }
}
