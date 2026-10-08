import { CellData, GridState, MoveData, FieldUpgradeData } from '../core/types';

export class Board {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private gridState: GridState | null = null;
  private cellElements: HTMLElement[][] = [];
  private lastRevealedCell: HTMLElement | null = null;

  constructor() {
    this.container = document.getElementById('board')!;
    this.overlay = document.getElementById('board-overlay')!;
  }

  init(data: { rows: number; cols: number; totalMines: number; grid?: CellData[][] }): void {
    this.gridState = {
      grid: data.grid || [],
      rows: data.rows,
      cols: data.cols,
      totalMines: data.totalMines,
      revealedCount: 0,
      flaggedCount: 0,
      status: 'waiting',
      steps: 0,
    };

    this.buildGrid();
  }

  private buildGrid(): void {
    this.container.innerHTML = '';
    this.cellElements = [];

    if (!this.gridState) return;

    const { rows, cols } = this.gridState;
    const size = Math.max(24, Math.min(44, Math.floor(400 / Math.max(rows, cols))));

    this.container.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
    this.container.style.gridTemplateRows = `repeat(${rows}, ${size}px)`;

    for (let r = 0; r < rows; r++) {
      const rowEls: HTMLElement[] = [];
      for (let c = 0; c < cols; c++) {
        const cellEl = document.createElement('div');
        cellEl.classList.add('cell', 'hidden');
        cellEl.style.width = `${size}px`;
        cellEl.style.height = `${size}px`;
        cellEl.style.fontSize = `${Math.max(10, size * 0.5)}px`;
        cellEl.dataset.row = String(r);
        cellEl.dataset.col = String(c);
        this.container.appendChild(cellEl);
        rowEls.push(cellEl);
      }
      this.cellElements.push(rowEls);
    }
  }

  applyMove(move: MoveData): void {
    const { revealed, status, revealedCount, flaggedCount } = move;

    const revealedSet = new Set<string>();
    for (const cell of revealed) {
      revealedSet.add(`${cell.row},${cell.col}`);
      this.updateCell(cell.row, cell.col, cell);
    }

    if (this.lastRevealedCell) {
      this.lastRevealedCell.classList.remove('highlighted');
    }

    if (revealed.length > 0) {
      const last = revealed[revealed.length - 1];
      const el = this.cellElements[last.row]?.[last.col];
      if (el) {
        el.classList.add('highlighted', 'last-revealed');
        this.lastRevealedCell = el;
      }
    }

    for (const cell of revealed) {
      const el = this.cellElements[cell.row]?.[cell.col];
      if (el) {
        el.classList.add('new-reveal');
        el.addEventListener('animationend', () => {
          el.classList.remove('new-reveal', 'last-revealed');
        }, { once: true });
      }
    }

    if (this.gridState) {
      this.gridState.revealedCount = revealedCount;
      this.gridState.flaggedCount = flaggedCount;
      this.gridState.status = status as GridState['status'];
    }

    if (status === 'won') {
      this.showOverlay('AI WINS!', 'win');
      this.spawnConfetti();
    } else if (status === 'lost') {
      this.showOverlay('MINE HIT!', 'lose');
      this.shakeBoard();
    }
  }

  private updateCell(row: number, col: number, data: CellData): void {
    const el = this.cellElements[row]?.[col];
    if (!el) return;

    el.className = 'cell';

    if (data.isRevealed) {
      el.classList.add('revealed');
      if (data.isMine) {
        el.classList.add('mine');
      } else if (data.adjacentMines > 0) {
        el.dataset.adjacent = String(data.adjacentMines);
      }
    } else if (data.isFlagged) {
      el.classList.add('hidden', 'flagged');
    } else {
      el.classList.add('hidden');
    }
  }

  private showOverlay(text: string, className: string): void {
    this.overlay.textContent = text;
    this.overlay.className = className;
    this.overlay.classList.add('animate-fade-in');

    setTimeout(() => {
      this.overlay.classList.add('hidden');
      this.overlay.classList.remove('animate-fade-in');
    }, 1500);
  }

  private shakeBoard(): void {
    this.container.style.animation = 'shakeCell 0.4s ease-out';
    this.container.addEventListener('animationend', () => {
      this.container.style.animation = '';
    }, { once: true });
  }

  private spawnConfetti(): void {
    const colors = ['#4dff8b', '#4d9eff', '#ff4d6a', '#ffd74d', '#b44dff', '#4dffd7'];
    const rect = this.container.getBoundingClientRect();

    for (let i = 0; i < 30; i++) {
      const particle = document.createElement('div');
      particle.className = 'confetti-particle';
      particle.style.left = `${rect.left + Math.random() * rect.width}px`;
      particle.style.top = `${rect.top + Math.random() * rect.height}px`;
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.animation = `confetti ${0.6 + Math.random() * 0.8}s ease-out forwards`;
      particle.style.animationDelay = `${Math.random() * 0.3}s`;
      document.body.appendChild(particle);

      particle.addEventListener('animationend', () => {
        particle.remove();
      }, { once: true });
    }
  }

  handleFieldUpgrade(data: FieldUpgradeData): void {
    this.init({ rows: data.rows, cols: data.cols, totalMines: data.mines });
  }

  updateInfo(info: { revealed: number; total: number; flags: number; totalMines: number; steps: number }): void {
    const revEl = document.getElementById('info-revealed');
    const flagEl = document.getElementById('info-flags');
    const stepsEl = document.getElementById('info-steps');

    if (revEl) revEl.textContent = `${info.revealed}/${info.total}`;
    if (flagEl) flagEl.textContent = `${info.flags}/${info.totalMines}`;
    if (stepsEl) stepsEl.textContent = String(info.steps);
  }
}
