export interface CellData {
  row: number;
  col: number;
  adjacentMines: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
}

export interface GridState {
  grid: CellData[][];
  rows: number;
  cols: number;
  totalMines: number;
  revealedCount: number;
  flaggedCount: number;
  status: 'playing' | 'won' | 'lost' | 'waiting';
  steps: number;
}

export interface InitData {
  grid: CellData[][];
  rows: number;
  cols: number;
  totalMines: number;
  status: string;
  episode: number;
  epsilon: number;
  winRate: number;
  winRateHistory: { episode: number; winRate: number }[];
  lossHistory: { step: number; loss: number }[];
  fieldSize: string;
  training: boolean;
  userCount: number;
}

export interface MoveData {
  row: number;
  col: number;
  revealed: CellData[];
  status: string;
  revealedCount: number;
  flaggedCount: number;
}

export interface EpisodeEndData {
  win: boolean;
  episode: number;
  winRate: number;
  loss: number;
  fieldSize: string;
}

export interface TrainStepData {
  loss: number;
  step: number;
}

export interface FieldUpgradeData {
  rows: number;
  cols: number;
  mines: number;
}

export interface StatsData {
  episode: number;
  epsilon: number;
  winRate: number;
}

export type ServerMessage =
  | { type: 'init'; data: InitData }
  | { type: 'move'; data: MoveData }
  | { type: 'episode_end'; data: EpisodeEndData }
  | { type: 'train_step'; data: TrainStepData }
  | { type: 'field_upgrade'; data: FieldUpgradeData }
  | { type: 'stats'; data: StatsData }
  | { type: 'user_count'; data: { count: number } }
  | { type: 'training_started' }
  | { type: 'training_stopped' }
  | { type: 'training_paused' }
  | { type: 'training_resumed' };

export type ClientMessage =
  | { type: 'start_training' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'set_speed'; data: { speed: number } }
  | { type: 'get_init' }
  | { type: 'reset' };
