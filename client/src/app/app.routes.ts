import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { Shell } from './shell/shell';
import { Login } from './pages/login/login';
import { Courses } from './pages/courses/courses';
import { CourseDetail } from './pages/course-detail/course-detail';
import { LessonDetail } from './pages/lesson-detail/lesson-detail';
import { PdfViewer } from './pages/pdf-viewer/pdf-viewer';
import { NotesPage } from './pages/notes/notes';

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
    ],
  },
  { path: '**', redirectTo: '' },
];
