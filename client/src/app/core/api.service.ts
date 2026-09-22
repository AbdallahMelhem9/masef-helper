import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ChatMessage, Course, Lesson, Pdf, Section } from './models';

// How long the tutor's chat answer should be; 'auto' lets it read the wanted
// length off the question itself.
export type AnswerLength = 'auto' | 'short' | 'mid' | 'expanded';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  getCourses(): Promise<Course[]> {
    return firstValueFrom(this.http.get<Course[]>('/api/courses'));
  }

  createCourse(data: { title: string; description?: string; teacher?: string }): Promise<Course> {
    return firstValueFrom(this.http.post<Course>('/api/courses', data));
  }

  getCourse(id: number): Promise<Course> {
    return firstValueFrom(this.http.get<Course>(`/api/courses/${id}`));
  }

  createLesson(courseId: number, data: { title: string; description?: string }): Promise<Lesson> {
    return firstValueFrom(this.http.post<Lesson>(`/api/courses/${courseId}/lessons`, data));
  }

  getLesson(id: number): Promise<Lesson> {
    return firstValueFrom(this.http.get<Lesson>(`/api/lessons/${id}`));
  }

  uploadPdf(lessonId: number, file: File, title: string, teacher: string): Promise<Pdf> {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    if (teacher) form.append('teacher', teacher);
    return firstValueFrom(this.http.post<Pdf>(`/api/lessons/${lessonId}/pdfs`, form));
  }

  getPdf(id: number): Promise<Pdf> {
    return firstValueFrom(this.http.get<Pdf>(`/api/pdfs/${id}`));
  }

  explainSection(id: number, force = false, instructions = ''): Promise<{ ai_explanation: string; cached: boolean }> {
    return firstValueFrom(
      this.http.post<{ ai_explanation: string; cached: boolean }>(`/api/sections/${id}/explain`, { force, instructions })
    );
  }

  setHighlight(sectionId: number, highlight: boolean): Promise<{ ok: boolean; highlight: number }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; highlight: number }>(`/api/sections/${sectionId}/highlight`, { highlight })
    );
  }

  getMessages(sectionId: number): Promise<ChatMessage[]> {
    return firstValueFrom(this.http.get<ChatMessage[]>(`/api/sections/${sectionId}/messages`));
  }

  sendMessage(sectionId: number, content: string, length: AnswerLength = 'auto'): Promise<{ user: ChatMessage; assistant: ChatMessage }> {
    return firstValueFrom(
      this.http.post<{ user: ChatMessage; assistant: ChatMessage }>(`/api/sections/${sectionId}/messages`, { content, length })
    );
  }
}
