import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Lesson } from '../../core/models';

@Component({
  selector: 'app-lesson-detail',
  imports: [FormsModule, RouterLink],
  templateUrl: './lesson-detail.html',
  styleUrl: './lesson-detail.css',
})
export class LessonDetail implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  lesson = signal<Lesson | null>(null);
  showForm = signal(false);
  uploading = signal(false);
  error = signal('');

  pdfTitle = '';
  pdfTeacher = '';
  file: File | null = null;

  private get lessonId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      const lesson = await this.api.getLesson(this.lessonId);
      this.lesson.set(lesson);
      if (!this.pdfTeacher && lesson.course?.teacher) this.pdfTeacher = lesson.course.teacher;
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Could not load the lesson');
    }
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
    if (this.file && !this.pdfTitle) {
      this.pdfTitle = this.file.name.replace(/\.pdf$/i, '');
    }
  }

  async upload() {
    if (!this.file) return;
    this.uploading.set(true);
    this.error.set('');
    try {
      await this.api.uploadPdf(this.lessonId, this.file, this.pdfTitle.trim(), this.pdfTeacher.trim());
      this.file = null;
      this.pdfTitle = '';
      this.showForm.set(false);
      await this.reload();
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Upload failed');
    } finally {
      this.uploading.set(false);
    }
  }
}
