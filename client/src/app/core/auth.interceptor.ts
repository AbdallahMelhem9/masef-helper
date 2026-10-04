import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { TEASER_PASS_KEY } from './teaser-access.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // The interview-prep password (puzzles, coding), once entered on this browser.
  const locked = req.url.startsWith('/api/teasers') || req.url.startsWith('/api/coding');
  const teaserPass = locked ? localStorage.getItem(TEASER_PASS_KEY) : null;
  if (teaserPass) headers['X-Teaser-Pass'] = teaserPass;
  const authedReq = Object.keys(headers).length ? req.clone({ setHeaders: headers }) : req;

  return next(authedReq).pipe(
    catchError((err) => {
      if (err.status === 401 && !req.url.includes('/api/auth/')) {
        localStorage.removeItem('masef_token');
        auth.token.set(null);
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
