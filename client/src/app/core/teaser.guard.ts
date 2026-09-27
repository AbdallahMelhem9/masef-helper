import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TeaserAccessService } from './teaser-access.service';

export const teaserGuard: CanActivateFn = async (_route, state) => {
  const access = inject(TeaserAccessService);
  const router = inject(Router);
  return (await access.check()) ? true : router.createUrlTree(['/puzzles-locked'], { queryParams: { next: state.url } });
};
