import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Run {
  id: number;
  game: string;
  level: string;
  score: number;
  stats: any;
  created_at: string;
}

export interface History {
  name: string;
  shownAs: string;
  runs: Run[];
}

export interface SaveResult {
  id: number;
  best: number;
  personalBest: boolean;
  rank: number;
  players: number;
}

export interface BoardRow {
  rank: number;
  name: string;
  best: number;
  plays: number;
  me: boolean;
}

export interface Board {
  top: BoardRow[];
  me: BoardRow | null;
  players: number;
}

// Scores of the trading games and maths drills (server: src/games.js).
@Injectable({ providedIn: 'root' })
export class PrepApi {
  private http = inject(HttpClient);

  save(game: string, level: string, score: number, stats: unknown): Promise<SaveResult> {
    return firstValueFrom(this.http.post<SaveResult>('/api/games/scores', { game, level, score, stats }));
  }

  history(): Promise<History> {
    return firstValueFrom(this.http.get<History>('/api/games/me'));
  }

  board(game: string, level: string): Promise<Board> {
    return firstValueFrom(this.http.get<Board>(`/api/games/leaderboard/${game}/${level}`));
  }

  setName(name: string): Promise<{ name: string; shownAs: string }> {
    return firstValueFrom(this.http.put<{ name: string; shownAs: string }>('/api/games/name', { name }));
  }
}
