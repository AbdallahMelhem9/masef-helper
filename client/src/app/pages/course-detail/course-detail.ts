import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Course } from '../../core/models';

@Component({
  selector: 'app-course-detail',
  imports: [FormsModule, RouterLink],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.css',
})
export class CourseDetail implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  course = signal<Course | null>(null);
  showForm = signal(false);
  saving = signal(false);
  error = signal('');

  lessonTitle = '';

  private get courseId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.course.set(await this.api.getCourse(this.courseId));
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Could not load the course');
    }
  }

  async addLesson() {
    if (!this.lessonTitle.trim()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.createLesson(this.courseId, { title: this.lessonTitle.trim() });
      this.lessonTitle = '';
      this.showForm.set(false);
      await this.reload();
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Could not add the lesson');
    } finally {
      this.saving.set(false);
    }
  }
}
