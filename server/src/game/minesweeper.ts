import { Cell, GameState, GameConfig } from './types';

export class Minesweeper {
  private rows: number;
  private cols: number;
  private totalMines: number;
  private grid: Cell[][] = [];
  private minesPlaced = false;
  private revealedCount = 0;
  private flaggedCount = 0;
  private status: 'playing' | 'won' | 'lost' = 'playing';
  private steps = 0;
  private revealedThisTurn: Cell[] = [];

  constructor(config: GameConfig) {
    this.rows = config.rows;
    this.cols = config.cols;
    this.totalMines = Math.min(config.mines, this.rows * this.cols - 1);
    this.initGrid();
  }

  private initGrid(): void {
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < this.cols; c++) {
        row.push({
          row: r,
          col: c,
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          adjacentMines: 0,
        });
      }
      this.grid.push(row);
    }
  }

  placeMines(excludeRow: number, excludeCol: number): void {
    if (this.minesPlaced) return;

    const excludeSet = new Set<string>();
    excludeSet.add(`${excludeRow},${excludeCol}`);
    for (const n of this.getNeighbors(excludeRow, excludeCol)) {
      excludeSet.add(`${n.row},${n.col}`);
    }

    const candidates: { row: number; col: number }[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!excludeSet.has(`${r},${c}`)) {
          candidates.push({ row: r, col: c });
        }
      }
    }

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (let i = 0; i < this.totalMines && i < candidates.length; i++) {
      const { row, col } = candidates[i];
      this.grid[row][col].isMine = true;
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.grid[r][c].isMine) {
          this.grid[r][c].adjacentMines = this.countAdjacentMines(r, c);
        }
      }
    }

    this.minesPlaced = true;
  }

  private countAdjacentMines(row: number, col: number): number {
    let count = 0;
    for (const n of this.getNeighbors(row, col)) {
      if (this.grid[n.row][n.col].isMine) count++;
    }
    return count;
  }

  getNeighbors(row: number, col: number): { row: number; col: number }[] {
    const neighbors: { row: number; col: number }[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          neighbors.push({ row: nr, col: nc });
        }
      }
    }
    return neighbors;
  }

  reveal(row: number, col: number): Cell[] {
    this.revealedThisTurn = [];
    this.steps++;

    if (!this.minesPlaced) {
      this.placeMines(row, col);
    }

    const cell = this.grid[row][col];
    if (cell.isRevealed || cell.isFlagged) return [];

    cell.isRevealed = true;
    this.revealedThisTurn.push(cell);
    this.revealedCount++;

    if (cell.isMine) {
      this.status = 'lost';
      this.revealAllMines();
      return this.revealedThisTurn;
    }

    if (cell.adjacentMines === 0) {
      for (const n of this.getNeighbors(row, col)) {
        if (!this.grid[n.row][n.col].isRevealed && !this.grid[n.row][n.col].isFlagged) {
          this.reveal(n.row, n.col);
        }
      }
    }

    if (this.revealedCount === this.rows * this.cols - this.totalMines) {
      this.status = 'won';
    }

    return this.revealedThisTurn;
  }

  private revealAllMines(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c].isMine) {
          this.grid[r][c].isRevealed = true;
        }
      }
    }
  }

  toggleFlag(row: number, col: number): void {
    const cell = this.grid[row][col];
    if (cell.isRevealed) return;
    cell.isFlagged = !cell.isFlagged;
    this.flaggedCount += cell.isFlagged ? 1 : -1;
  }

  getObservableState(): number[][] {
    const state: number[][] = [];
    for (let r = 0; r < this.rows; r++) {
      const rowState: number[] = [];
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.isFlagged) {
          rowState.push(9);
        } else if (!cell.isRevealed) {
          rowState.push(0);
        } else if (cell.isMine) {
          rowState.push(0);
        } else {
          rowState.push(Math.min(cell.adjacentMines, 8) + 1);
        }
      }
      state.push(rowState);
    }
    return state;
  }

  getOneHotState(): number[] {
    const result: number[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        const encoding: number[] = new Array(10).fill(0);
        let value: number;
        if (cell.isFlagged) {
          value = 9;
        } else if (!cell.isRevealed) {
          value = 0;
        } else if (cell.isMine) {
          value = 0;
        } else {
          value = Math.min(cell.adjacentMines, 8) + 1;
        }
        encoding[value] = 1;
        result.push(...encoding);
      }
    }
    return result;
  }

  getValidActions(): number[] {
    const actions: number[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.grid[r][c].isRevealed && !this.grid[r][c].isFlagged) {
          actions.push(r * this.cols + c);
        }
      }
    }
    return actions;
  }

  getFlatState(): number[] {
    const result: number[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.isFlagged) {
          result.push(-1);
        } else if (!cell.isRevealed) {
          result.push(-2);
        } else if (cell.isMine) {
          result.push(-3);
        } else {
          result.push(cell.adjacentMines);
        }
      }
    }
    return result;
  }

  getFullState(): GameState {
    return {
      grid: this.grid,
      rows: this.rows,
      cols: this.cols,
      totalMines: this.totalMines,
      revealedCount: this.revealedCount,
      flaggedCount: this.flaggedCount,
      status: this.status,
      steps: this.steps,
    };
  }

  getCell(row: number, col: number): Cell {
    return this.grid[row][col];
  }

  getStatus(): 'playing' | 'won' | 'lost' {
    return this.status;
  }

  getRows(): number {
    return this.rows;
  }

  getCols(): number {
    return this.cols;
  }

  getTotalMines(): number {
    return this.totalMines;
  }

  getSteps(): number {
    return this.steps;
  }

  getRevealedThisTurn(): Cell[] {
    return this.revealedThisTurn;
  }

  isMinesPlaced(): boolean {
    return this.minesPlaced;
  }
}
