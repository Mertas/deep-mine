import { Minesweeper } from '../game/minesweeper';
import { DQNAgent, DQNConfig } from './agent';
import { Experience } from './replay';
import { GameConfig } from '../game/types';

export interface EpisodeResult {
  episode: number;
  win: boolean;
  steps: number;
  durationMs: number;
  fieldRows: number;
  fieldCols: number;
  mines: number;
  epsilon: number;
}

export interface TrainerCallbacks {
  onMove?: (row: number, col: number, game: Minesweeper) => void;
  onEpisodeEnd?: (result: EpisodeResult) => void;
  onTrainStep?: (loss: number, step: number) => void;
}

export class Trainer {
  private gameConfig: GameConfig;
  private agent: DQNAgent;
  private episode = 0;
  private trainStepCount = 0;
  private stopped = false;
  private callbacks: TrainerCallbacks = {};
  private trainEveryNSteps: number;

  constructor(gameConfig: GameConfig, dqnConfig: DQNConfig, trainEveryNSteps = 4) {
    this.gameConfig = gameConfig;
    this.trainEveryNSteps = trainEveryNSteps;

    const inputSize = gameConfig.rows * gameConfig.cols;
    const outputSize = gameConfig.rows * gameConfig.cols;

    this.agent = new DQNAgent({
      ...dqnConfig,
      inputSize,
      outputSize,
    });
  }

  setCallbacks(callbacks: TrainerCallbacks): void {
    this.callbacks = callbacks;
  }

  async runEpisode(speedMultiplier = 1): Promise<EpisodeResult> {
    const startTime = Date.now();
    const game = new Minesweeper(this.gameConfig);
    let totalReward = 0;

    const firstRow = Math.floor(Math.random() * game.getRows());
    const firstCol = Math.floor(Math.random() * game.getCols());
    const firstAction = firstRow * game.getCols() + firstCol;
    let firstRevealed = game.reveal(firstRow, firstCol);

    for (const cell of firstRevealed) {
      if (this.callbacks.onMove) {
        this.callbacks.onMove(cell.row, cell.col, game);
      }
    }

    let previousRevealed = game.getFullState().revealedCount;
    let state = game.getFlatState();

    while (game.getStatus() === 'playing' && !this.stopped) {
      const validActions = game.getValidActions();
      if (validActions.length === 0) break;

      const action = this.agent.selectAction(state, validActions);
      if (action < 0) break;

      const row = Math.floor(action / game.getCols());
      const col = action % game.getCols();

      const revealed = game.reveal(row, col);

      if (this.callbacks.onMove) {
        for (const cell of revealed) {
          this.callbacks.onMove(cell.row, cell.col, game);
        }
      }

      const nextState = game.getFlatState();
      const newRevealed = game.getFullState().revealedCount;
      const revealedDelta = newRevealed - previousRevealed;

      let reward: number;
      const status = game.getStatus();

      if (status === 'lost') {
        reward = -1;
      } else if (status === 'won') {
        reward = 10;
      } else {
        reward = 1 + 0.1 * Math.max(0, revealedDelta - 1);
      }

      totalReward += reward;

      const exp: Experience = {
        state: state.slice(),
        action,
        reward,
        nextState: nextState.slice(),
        done: status !== 'playing',
      };

      this.agent.remember(exp);

      state = nextState;
      previousRevealed = newRevealed;

      if (this.trainStepCount > 0 && this.trainStepCount % this.trainEveryNSteps === 0) {
        const loss = await this.agent.replayStep();
        if (loss > 0 && this.callbacks.onTrainStep) {
          this.callbacks.onTrainStep(loss, this.trainStepCount);
        }
      }

      this.trainStepCount++;

      if (status !== 'playing') break;
    }

    const win = game.getStatus() === 'won';
    const durationMs = Date.now() - startTime;

    this.agent.decayEpsilon();
    this.agent.updateTargetNetwork();
    this.episode++;

    const result: EpisodeResult = {
      episode: this.episode,
      win,
      steps: game.getSteps(),
      durationMs,
      fieldRows: game.getRows(),
      fieldCols: game.getCols(),
      mines: game.getTotalMines(),
      epsilon: this.agent.config.epsilon,
    };

    if (this.callbacks.onEpisodeEnd) {
      this.callbacks.onEpisodeEnd(result);
    }

    return result;
  }

  stop(): void {
    this.stopped = true;
  }

  getAgent(): DQNAgent {
    return this.agent;
  }

  getEpisode(): number {
    return this.episode;
  }

  setEpisode(episode: number): void {
    this.episode = episode;
  }

  getTrainStepCount(): number {
    return this.trainStepCount;
  }

  dispose(): void {
    this.agent.dispose();
  }
}
