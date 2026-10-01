import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Course, CourseTrack, Lesson } from '../../core/models';

@Component({
  selector: 'app-course-detail',
  imports: [FormsModule, RouterLink],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.css',
})
export class CourseDetail implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  course = signal<Course | null>(null);
  showForm = signal(false);
  saving = signal(false);
  error = signal('');

  lessonTitle = '';

  /** Sources of a multi-track course (the page asks which one to open). */
  tracks = computed<CourseTrack[]>(() => {
    const raw = this.course()?.tracks;
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  });
  trackKey = signal<string | null>(null);
  activeTrack = computed(() => this.tracks().find((t) => t.key === this.trackKey()) || null);
  /** True while a multi-track course waits for the reader to pick a track. */
  choosing = computed(() => this.tracks().length > 1 && !this.activeTrack());
  visibleLessons = computed<Lesson[]>(() => {
    const lessons = this.course()?.lessons || [];
    const t = this.activeTrack();
    return t ? lessons.filter((l) => l.track === t.key) : lessons;
  });

  lessonCountFor(key: string): number {
    return (this.course()?.lessons || []).filter((l) => l.track === key).length;
  }

  chooseTrack(key: string | null) {
    this.trackKey.set(key);
    this.router.navigate([], { relativeTo: this.route, queryParams: { track: key }, replaceUrl: true });
  }

  private get courseId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  async ngOnInit() {
    this.trackKey.set(this.route.snapshot.queryParamMap.get('track'));
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
