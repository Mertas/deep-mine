import Database from 'better-sqlite3';
import { EpisodeResult } from './dqn/trainer';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface TrainingStateRow {
  episode: number;
  epsilon: number;
  wins: number;
  losses: number;
  field_rows: number;
  field_cols: number;
  mines: number;
  train_step: number;
}

export interface EpisodeRow {
  id: number;
  win: number;
  steps: number;
  duration_ms: number;
  field_rows: number;
  field_cols: number;
  mines: number;
  created_at: string;
}

export interface WeightRow {
  layer_name: string;
  weights_blob: Buffer;
}

export class GameDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS training_state (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        episode       INTEGER NOT NULL DEFAULT 0,
        epsilon       REAL    NOT NULL DEFAULT 1.0,
        wins          INTEGER NOT NULL DEFAULT 0,
        losses        INTEGER NOT NULL DEFAULT 0,
        field_rows    INTEGER NOT NULL DEFAULT 5,
        field_cols    INTEGER NOT NULL DEFAULT 5,
        mines         INTEGER NOT NULL DEFAULT 3,
        train_step    INTEGER NOT NULL DEFAULT 0,
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      INSERT OR IGNORE INTO training_state (id) VALUES (1);

      CREATE TABLE IF NOT EXISTS episodes (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        win           INTEGER NOT NULL,
        steps         INTEGER NOT NULL,
        duration_ms   INTEGER NOT NULL,
        field_rows    INTEGER NOT NULL,
        field_cols    INTEGER NOT NULL,
        mines         INTEGER NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_episodes_created ON episodes(created_at);

      CREATE TABLE IF NOT EXISTS model_weights (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        weights_blob  BLOB NOT NULL,
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  getState(): TrainingStateRow {
    const row = this.db.prepare('SELECT * FROM training_state WHERE id = 1').get() as any;
    return {
      episode: row.episode,
      epsilon: row.epsilon,
      wins: row.wins,
      losses: row.losses,
      field_rows: row.field_rows,
      field_cols: row.field_cols,
      mines: row.mines,
      train_step: row.train_step,
    };
  }

  saveState(state: {
    episode: number;
    epsilon: number;
    wins: number;
    losses: number;
    fieldRows: number;
    fieldCols: number;
    mines: number;
    trainStep: number;
  }): void {
    this.db.prepare(`
      UPDATE training_state SET
        episode = ?, epsilon = ?, wins = ?, losses = ?,
        field_rows = ?, field_cols = ?, mines = ?,
        train_step = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(
      state.episode, state.epsilon, state.wins, state.losses,
      state.fieldRows, state.fieldCols, state.mines,
      state.trainStep
    );
  }

  saveEpisode(result: EpisodeResult): void {
    this.db.prepare(`
      INSERT INTO episodes (win, steps, duration_ms, field_rows, field_cols, mines)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      result.win ? 1 : 0,
      result.steps,
      result.durationMs,
      result.fieldRows,
      result.fieldCols,
      result.mines
    );
  }

  getRecentEpisodes(limit: number): EpisodeRow[] {
    return this.db.prepare(
      'SELECT * FROM episodes ORDER BY id DESC LIMIT ?'
    ).all(limit) as EpisodeRow[];
  }

  getWinCount(sinceEpisode: number): { wins: number; total: number } {
    const rows = this.db.prepare(`
      SELECT win FROM episodes WHERE id > ? ORDER BY id DESC
    `).all(sinceEpisode) as { win: number }[];

    const wins = rows.filter(r => r.win === 1).length;
    return { wins, total: rows.length };
  }

  saveWeights(weightsBuffer: ArrayBuffer): void {
    const buffer = Buffer.from(weightsBuffer);
    this.db.prepare('DELETE FROM model_weights').run();
    this.db.prepare(`
      INSERT INTO model_weights (weights_blob) VALUES (?)
    `).run(buffer);
  }

  loadWeights(): ArrayBuffer | null {
    const row = this.db.prepare(
      'SELECT weights_blob FROM model_weights ORDER BY id DESC LIMIT 1'
    ).get() as { weights_blob: Buffer } | undefined;

    if (!row) return null;

    return row.weights_blob.buffer.slice(
      row.weights_blob.byteOffset,
      row.weights_blob.byteOffset + row.weights_blob.byteLength
    ) as ArrayBuffer;
  }

  reset(): void {
    this.db.exec(`
      DELETE FROM training_state;
      INSERT INTO training_state (id) VALUES (1);
      DELETE FROM episodes;
      DELETE FROM model_weights;
    `);
  }

  close(): void {
    this.db.close();
  }
}
