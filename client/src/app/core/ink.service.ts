import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// A handwritten stroke. Points are stored relative to an anchor element
// (a lesson block, or the paper itself) so that the ink follows its block
// when the page reflows on another screen width: x is a fraction of the
// anchor's width, y is in CSS pixels from the anchor's top.
export interface Stroke {
  t: 'pen' | 'hl'; // tool: pen or highlighter
  c: string; // colour
  w: number; // base width (px)
  a: string; // anchor: a section id, or 'doc' for the sheet itself
  s?: 1; // pressure simulated from speed (mouse / finger input)
  p: number[][]; // [x, y, pressure]
}

export interface InkDoc {
  v: 1;
  strokes: Stroke[];
  text?: string; // typed notes (notebook page)
  height?: number; // notebook paper height (px)
}

export type InkKind = 'page' | 'notes';

export function emptyInk(): InkDoc {
  return { v: 1, strokes: [] };
}

interface Stored {
  data: InkDoc;
  updated_at: string;
}

// ---- Local copy: IndexedDB (falls back to localStorage) ----
// The browser keeps its own copy so ink survives even when the hosted
// server's disk is wiped (Render's free instances restart from the seed).
const DB_NAME = 'masef-ink';
const STORE = 'ink';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function localGet(key: string): Promise<Stored | null> {
  const db = await openDb();
  if (!db) {
    try {
      const raw = localStorage.getItem(`ink:${key}`);
      return raw ? (JSON.parse(raw) as Stored) : null;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Stored) || null);
    req.onerror = () => resolve(null);
  });
}

async function localPut(key: string, value: Stored): Promise<void> {
  const db = await openDb();
  if (!db) {
    try {
      localStorage.setItem(`ink:${key}`, JSON.stringify(value));
    } catch {
      /* quota — the server copy still exists */
    }
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

@Injectable({ providedIn: 'root' })
export class InkService {
  private http = inject(HttpClient);

  private key(pdfId: number, kind: InkKind) {
    return `${pdfId}:${kind}`;
  }

  // Loads the newest of the browser copy and the server copy, and brings the
  // older side up to date.
  async load(pdfId: number, kind: InkKind): Promise<InkDoc> {
    const [local, remote] = await Promise.all([
      localGet(this.key(pdfId, kind)),
      firstValueFrom(this.http.get<{ data: InkDoc | null; updated_at: string | null }>(`/api/pdfs/${pdfId}/ink/${kind}`)).catch(
        () => null
      ),
    ]);
    const remoteStored: Stored | null = remote?.data ? { data: remote.data, updated_at: remote.updated_at || '' } : null;
    let best: Stored | null = null;
    if (local && remoteStored) best = local.updated_at >= remoteStored.updated_at ? local : remoteStored;
    else best = local || remoteStored;
    if (!best) return emptyInk();
    if (best === local && (!remoteStored || remoteStored.updated_at < local!.updated_at)) {
      this.remotePut(pdfId, kind, local!).catch(() => {});
    } else if (best === remoteStored && (!local || local.updated_at < remoteStored!.updated_at)) {
      localPut(this.key(pdfId, kind), remoteStored!);
    }
    const data = best.data as Partial<InkDoc>;
    return { ...data, v: 1, strokes: data.strokes ?? [] };
  }

  // Resolves to true when the server copy was written too; the browser copy
  // is always written first.
  async save(pdfId: number, kind: InkKind, doc: InkDoc): Promise<boolean> {
    const stored: Stored = { data: doc, updated_at: new Date().toISOString() };
    await localPut(this.key(pdfId, kind), stored);
    try {
      await this.remotePut(pdfId, kind, stored);
      return true;
    } catch {
      return false;
    }
  }

  private remotePut(pdfId: number, kind: InkKind, stored: Stored) {
    return firstValueFrom(this.http.put(`/api/pdfs/${pdfId}/ink/${kind}`, stored));
  }
}
