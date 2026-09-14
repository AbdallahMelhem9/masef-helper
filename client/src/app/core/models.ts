export interface Course {
  id: number;
  title: string;
  description: string;
  teacher: string;
  position: number;
  created_at: string;
  lessonCount?: number;
  lessons?: Lesson[];
}

export interface Lesson {
  id: number;
  course_id: number;
  title: string;
  description: string;
  position: number;
  pdfCount?: number;
  course?: Course;
  pdfs?: Pdf[];
}

export interface Pdf {
  id: number;
  lesson_id: number;
  title: string;
  teacher: string;
  position: number;
  status: 'ready' | 'processing' | 'failed';
  aiEnabled?: boolean;
  created_at: string;
  lesson?: Lesson;
  course?: Course;
  sections?: Section[];
}

export type BlockKind =
  | 'definition'
  | 'proposition'
  | 'theorem'
  | 'lemma'
  | 'corollary'
  | 'example'
  | 'exercise'
  | 'remark'
  | 'heading'
  | 'text'
  | 'tutor_note';

export interface Section {
  id: number;
  pdf_id: number;
  title: string;
  kind: BlockKind;
  page_start: number | null;
  page_end: number | null;
  content_text?: string;
  ai_explanation: string | null;
  proof: string | null;
  importance: 'imp' | 'half imp' | 'not imp' | null;
  tutor_note: string | null;
  extra_explanation: string | null;
  extra_example: string | null;
  highlight: number;
  position: number;
  messageCount?: number;
}

export interface ChatMessage {
  id: number;
  section_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface LoginResponse {
  token: string;
  email: string;
  name: string;
  created: boolean;
}
