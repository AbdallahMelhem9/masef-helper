import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { Shell } from './shell/shell';
import { Login } from './pages/login/login';
import { Courses } from './pages/courses/courses';
import { CourseDetail } from './pages/course-detail/course-detail';
import { LessonDetail } from './pages/lesson-detail/lesson-detail';
import { PdfViewer } from './pages/pdf-viewer/pdf-viewer';
import { NotesPage } from './pages/notes/notes';
import { TeaserBrowse } from './pages/teasers/teaser-browse';
import { TeaserPage } from './pages/teasers/teaser-page';
import { TeaserLock } from './pages/teasers/teaser-lock';
import { teaserGuard } from './core/teaser.guard';
import { CodingHome } from './pages/coding/coding-home';
import { CodingFirm } from './pages/coding/coding-firm';

export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'courses' },
      { path: 'courses', component: Courses },
      { path: 'courses/:id', component: CourseDetail },
      { path: 'lessons/:id', component: LessonDetail },
      { path: 'pdfs/:id', component: PdfViewer },
      { path: 'pdfs/:id/notes', component: NotesPage },
      { path: 'teasers', component: TeaserBrowse, canActivate: [teaserGuard], data: { view: 'home' } },
      { path: 'teasers/topics', component: TeaserBrowse, canActivate: [teaserGuard], data: { view: 'topics' } },
      { path: 'teasers/companies', component: TeaserBrowse, canActivate: [teaserGuard], data: { view: 'companies' } },
      { path: 'teasers/company/:firm', component: TeaserBrowse, canActivate: [teaserGuard], data: { view: 'company' } },
      { path: 'teasers/:section', component: TeaserBrowse, canActivate: [teaserGuard] },
      { path: 'teasers/:section/:category', component: TeaserBrowse, canActivate: [teaserGuard] },
      { path: 'teaser/:slug', component: TeaserPage, canActivate: [teaserGuard] },
      { path: 'coding', component: CodingHome, canActivate: [teaserGuard] },
      { path: 'coding/:firm', component: CodingFirm, canActivate: [teaserGuard] },
      { path: 'puzzles-locked', component: TeaserLock },
    ],
  },
  { path: '**', redirectTo: '' },
];
