import { Component, OnDestroy, computed, signal } from '@angular/core';
import { SESSIONS, Session } from './agenda-data';

const HIDDEN_KEY = 'agenda-hidden-courses';
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The timetable is in Paris time whatever the device's timezone says.
const PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface Now {
  date: string; // YYYY-MM-DD
  min: number; // minutes since midnight, fractional
}

function parisNow(): Now {
  const p: Record<string, string> = {};
  for (const part of PARIS.formatToParts(new Date())) p[part.type] = part.value;
  return { date: `${p['year']}-${p['month']}-${p['day']}`, min: +p['hour'] * 60 + +p['minute'] + +p['second'] / 60 };
}

const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
const dayNum = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const isoOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
const weekday = (iso: string) => (new Date(dayNum(iso) * 86400000).getUTCDay() + 6) % 7; // 0 = Monday
// TD sessions share the lecture's filter toggle.
export const subject = (s: Session) => s.course.replace(/TD$/, '');

interface Placed extends Session {
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

@Component({
  selector: 'app-agenda',
  templateUrl: './agenda.html',
  styleUrls: ['../teasers/teasers.css', './agenda.css'],
})
export class Agenda implements OnDestroy {
  readonly GRID_START = 8 * 60;
  readonly PX_PER_MIN = 0.9;

  now = signal(parisNow());
  private timer = setInterval(() => this.now.set(parisNow()), 1000);

  hidden = signal<Set<string>>(this.loadHidden());
  weekOffset = signal(0);
  showFilters = signal(false);

  subjects = (() => {
    const seen = new Map<string, string>();
    for (const s of SESSIONS) if (s.kind === 'class' && !seen.has(subject(s))) seen.set(subject(s), s.title.replace(/ — TD$/, ''));
    return [...seen].map(([key, title]) => ({ key, title }));
  })();

  sessions = computed(() => SESSIONS.filter((s) => !this.hidden().has(subject(s))));

  current = computed(() => {
    const n = this.now();
    return this.sessions().filter((s) => s.date === n.date && toMin(s.start) <= n.min && n.min < toMin(s.end));
  });

  next = computed(() => {
    const n = this.now();
    return this.sessions().find((s) => s.date > n.date || (s.date === n.date && toMin(s.start) > n.min)) ?? null;
  });

  today = computed(() => this.sessions().filter((s) => s.date === this.now().date));

  upcomingExams = computed(() => {
    const d = this.now().date;
    return this.sessions()
      .filter((s) => s.kind === 'exam' && s.date >= d)
      .slice(0, 6);
  });

  // Monday of the displayed week; at the weekend "this week" means the coming one.
  weekStart = computed(() => {
    const d = this.now().date;
    const wd = weekday(d);
    const base = dayNum(d) - wd + (wd >= 5 ? 7 : 0);
    return base + 7 * this.weekOffset();
  });

  weekLabel = computed(() => {
    const a = isoOf(this.weekStart());
    const b = isoOf(this.weekStart() + 4);
    return `${this.shortDate(a)} – ${this.shortDate(b)} ${b.slice(0, 4)}`;
  });

  gridEnd = computed(() => {
    const ends = this.weekDays().flatMap((d) => d.sessions.map((s) => toMin(s.end)));
    return Math.max(18 * 60, ...ends.map((e) => Math.ceil(e / 60) * 60));
  });

  hours = computed(() => {
    const out: number[] = [];
    for (let m = this.GRID_START; m <= this.gridEnd(); m += 60) out.push(m);
    return out;
  });

  weekDays = computed(() => {
    const start = this.weekStart();
    const all = this.sessions();
    return [0, 1, 2, 3, 4].map((i) => {
      const date = isoOf(start + i);
      return { date, name: DAY_NAMES[i], sessions: this.layout(all.filter((s) => s.date === date)) };
    });
  });

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  // Overlapping sessions (parallel electives) sit side by side in lanes.
  private layout(day: Session[]): Placed[] {
    const placed: Placed[] = [];
    let cluster: Placed[] = [];
    let clusterEnd = -1;
    const flush = () => {
      const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
      cluster.forEach((p) => (p.lanes = lanes));
      cluster = [];
    };
    for (const s of [...day].sort((a, b) => a.start.localeCompare(b.start))) {
      const a = toMin(s.start);
      const b = toMin(s.end);
      if (a >= clusterEnd) flush();
      const busy = new Set(cluster.filter((p) => toMin(p.end) > a).map((p) => p.lane));
      let lane = 0;
      while (busy.has(lane)) lane++;
      const p: Placed = { ...s, top: (a - this.GRID_START) * this.PX_PER_MIN, height: (b - a) * this.PX_PER_MIN, lane, lanes: 1 };
      cluster.push(p);
      placed.push(p);
      clusterEnd = Math.max(clusterEnd, b);
    }
    flush();
    return placed;
  }

  nowLineTop(): number | null {
    const m = this.now().min;
    if (m < this.GRID_START || m > this.gridEnd()) return null;
    return (m - this.GRID_START) * this.PX_PER_MIN;
  }

  progress(s: Session): number {
    const a = toMin(s.start);
    const b = toMin(s.end);
    return Math.min(100, Math.max(0, (100 * (this.now().min - a)) / (b - a)));
  }

  remaining(s: Session): string {
    return this.fmtDuration((toMin(s.end) - this.now().min) * 60);
  }

  untilNext(s: Session): string {
    const n = this.now();
    const mins = (dayNum(s.date) - dayNum(n.date)) * 1440 + toMin(s.start) - n.min;
    return this.fmtDuration(mins * 60);
  }

  status(s: Session): 'past' | 'live' | 'future' {
    const n = this.now();
    if (s.date !== n.date) return s.date < n.date ? 'past' : 'future';
    if (n.min >= toMin(s.end)) return 'past';
    return n.min >= toMin(s.start) ? 'live' : 'future';
  }

  private fmtDuration(totalSec: number): string {
    const sec = Math.max(0, Math.floor(totalSec));
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }

  clock(): string {
    const m = this.now().min;
    const h = Math.floor(m / 60);
    const mm = Math.floor(m % 60);
    const ss = Math.floor((m * 60) % 60);
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  longDate(iso: string): string {
    return `${DAY_NAMES[weekday(iso)]} ${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
  }

  shortDate(iso: string): string {
    return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
  }

  dayLabel(iso: string): string {
    const diff = dayNum(iso) - dayNum(this.now().date);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return this.longDate(iso);
  }

  isToday(iso: string): boolean {
    return iso === this.now().date;
  }

  tone(s: Session): string {
    return s.kind === 'class' ? 'c-' + subject(s).toLowerCase() : 'c-exam';
  }

  toggle(key: string) {
    const next = new Set(this.hidden());
    next.has(key) ? next.delete(key) : next.add(key);
    this.hidden.set(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    } catch {}
  }

  private loadHidden(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }
}
