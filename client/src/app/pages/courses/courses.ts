import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Course } from '../../core/models';
import { BrownianPath } from '../../shared/brownian';

@Component({
  selector: 'app-courses',
  imports: [FormsModule, RouterLink, BrownianPath],
  templateUrl: './courses.html',
  styleUrl: './courses.css',
})
export class Courses implements OnInit {
  private api = inject(ApiService);

  courses = signal<Course[] | null>(null);
  showForm = signal(false);
  saving = signal(false);
  error = signal('');

  title = '';
  teacher = '';
  description = '';

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.courses.set(await this.api.getCourses());
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Could not load courses');
      this.courses.set([]);
    }
  }

  async create() {
    if (!this.title.trim()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.createCourse({
        title: this.title.trim(),
        teacher: this.teacher.trim(),
        description: this.description.trim(),
      });
      this.title = this.teacher = this.description = '';
      this.showForm.set(false);
      await this.reload();
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Could not create the course');
    } finally {
      this.saving.set(false);
    }
  }
}
