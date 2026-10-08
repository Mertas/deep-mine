export interface Cell {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
}

export interface GameState {
  grid: Cell[][];
  rows: number;
  cols: number;
  totalMines: number;
  revealedCount: number;
  flaggedCount: number;
  status: 'playing' | 'won' | 'lost';
  steps: number;
}

export interface GameConfig {
  rows: number;
  cols: number;
  mines: number;
}
