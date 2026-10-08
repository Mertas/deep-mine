import { Trainer, EpisodeResult } from './dqn/trainer';
import { DQNConfig, DQNAgent } from './dqn/agent';
import { GameDatabase } from './db';
import { WSManager, ServerMessage } from './ws';
import { config } from './config';
import { Minesweeper } from './game/minesweeper';
import { GameConfig } from './game/types';

interface WinRatePoint {
  episode: number;
  winRate: number;
}

interface LossPoint {
  step: number;
  loss: number;
}

export class Orchestrator {
  private trainer: Trainer;
  private db: GameDatabase;
  private ws: WSManager;
  private running = false;
  private paused = false;
  private speedMultiplier = 1;
  private winHistory: boolean[] = [];
  private winRateHistory: WinRatePoint[] = [];
  private lossHistory: LossPoint[] = [];
  private currentLoss = 0;
  private currentGame: Minesweeper | null = null;
  private currentFieldIndex = 0;
  private lastThrottleTime = 0;
  private stateSaveInterval: NodeJS.Timeout | null = null;
  private resetting = false;

  constructor(db: GameDatabase, ws: WSManager) {
    this.db = db;
    this.ws = ws;

    const state = db.getState();
    const gameConfig: GameConfig = {
      rows: state.field_rows,
      cols: state.field_cols,
      mines: state.mines,
    };

    this.currentFieldIndex = config.game.fieldProgression.findIndex(
      f => f.rows === state.field_rows && f.cols === state.field_cols
    );
    if (this.currentFieldIndex < 0) this.currentFieldIndex = 0;

    const dqnConfig: DQNConfig = {
      inputSize: gameConfig.rows * gameConfig.cols,
      outputSize: gameConfig.rows * gameConfig.cols,
      hiddenLayers: config.dqn.hiddenLayers,
      learningRate: config.dqn.learningRate,
      gamma: config.dqn.gamma,
      epsilon: state.epsilon,
      epsilonMin: config.dqn.epsilonMin,
      epsilonDecay: config.dqn.epsilonDecay,
      batchSize: config.dqn.batchSize,
      replayCapacity: config.dqn.replayCapacity,
      targetUpdateTau: config.dqn.targetUpdateTau,
    };

    this.trainer = new Trainer(gameConfig, dqnConfig, config.dqn.trainEveryNSteps);
    this.trainer.setEpisode(state.episode);

    const weightsBuf = db.loadWeights();
    if (weightsBuf) {
      this.trainer.getAgent().setWeights(weightsBuf);
      console.log('[Orchestrator] Loaded saved model weights');
    }

    this.trainer.setCallbacks({
      onMove: (row, col, game) => {
        this.currentGame = game;
        this.broadcastMove(row, col, game);
      },
      onEpisodeEnd: (result) => {
        this.handleEpisodeEnd(result);
      },
      onTrainStep: (loss, step) => {
        this.currentLoss = loss;
        this.lossHistory.push({ step, loss });
        if (this.lossHistory.length > 500) {
          this.lossHistory = this.lossHistory.slice(-500);
        }
        this.ws.broadcast({ type: 'train_step', data: { loss, step } });
      },
    });

    this.ws.onMessage((clientId, msg) => {
      this.handleClientMessage(clientId, msg);
    });

    this.ws.onConnect((clientId) => {
      this.broadcastUserCount();
    });

    this.ws.onDisconnect((clientId) => {
      this.broadcastUserCount();
    });

    console.log('[Orchestrator] Ready — waiting for user to start training');
  }

  private broadcastMove(row: number, col: number, game: Minesweeper): void {
    if (!this.currentGame) return;

    const fieldState = game.getFullState();
    const revealedCells = game.getRevealedThisTurn().map(c => ({
      row: c.row,
      col: c.col,
      adjacentMines: c.adjacentMines,
      isMine: c.isMine,
      isRevealed: c.isRevealed,
      isFlagged: c.isFlagged,
    }));

    const now = Date.now();
    if (now - this.lastThrottleTime >= config.ws.throttleInterval || fieldState.status !== 'playing') {
      this.lastThrottleTime = now;
      this.ws.broadcast({
        type: 'move',
        data: {
          row,
          col,
          revealed: revealedCells,
          status: fieldState.status,
          revealedCount: fieldState.revealedCount,
          flaggedCount: fieldState.flaggedCount,
        },
      });
    }
  }

  private handleEpisodeEnd(result: EpisodeResult): void {
    if (this.resetting) return;

    this.winHistory.push(result.win);
    if (this.winHistory.length > config.game.winRateWindow) {
      this.winHistory = this.winHistory.slice(-config.game.winRateWindow);
    }

    const winRate = this.getWinRate();
    this.winRateHistory.push({ episode: result.episode, winRate });

    if (this.winRateHistory.length > 500) {
      this.winRateHistory = this.winRateHistory.slice(-500);
    }

    this.db.saveEpisode(result);

    this.ws.broadcast({
      type: 'episode_end',
      data: {
        win: result.win,
        episode: result.episode,
        winRate,
        loss: this.currentLoss,
        fieldSize: `${result.fieldRows}x${result.fieldCols}·${result.mines}`,
      },
    });

    this.updateStats();

    this.checkFieldUpgrade();
  }

  private updateStats(): void {
    this.ws.broadcast({
      type: 'stats',
      data: {
        episode: this.trainer.getEpisode(),
        epsilon: this.trainer.getAgent().config.epsilon,
        winRate: this.getWinRate(),
      },
    });
  }

  private getWinRate(): number {
    if (this.winHistory.length === 0) return 0;
    const wins = this.winHistory.filter(Boolean).length;
    return wins / this.winHistory.length;
  }

  private checkFieldUpgrade(): void {
    const winRate = this.getWinRate();

    if (this.winHistory.length < config.game.winRateWindow) return;

    const progression = config.game.fieldProgression;
    const nextIndex = this.currentFieldIndex + 1;

    if (nextIndex >= progression.length) return;

    const nextField = progression[nextIndex];
    if (winRate >= nextField.winRateThreshold) {
      this.currentFieldIndex = nextIndex;
      console.log(`[Orchestrator] Field upgrade! ${nextField.rows}x${nextField.cols} with ${nextField.mines} mines`);

      const state = this.db.getState();
      state.field_rows = nextField.rows;
      state.field_cols = nextField.cols;
      state.mines = nextField.mines;

      this.trainer.dispose();
      this.winHistory = [];

      const dqnConfig: DQNConfig = {
        inputSize: nextField.rows * nextField.cols,
        outputSize: nextField.rows * nextField.cols,
        hiddenLayers: config.dqn.hiddenLayers,
        learningRate: config.dqn.learningRate,
        gamma: config.dqn.gamma,
        epsilon: config.dqn.epsilonStart,
        epsilonMin: config.dqn.epsilonMin,
        epsilonDecay: config.dqn.epsilonDecay,
        batchSize: config.dqn.batchSize,
        replayCapacity: config.dqn.replayCapacity,
        targetUpdateTau: config.dqn.targetUpdateTau,
      };

      this.trainer = new Trainer(
        { rows: nextField.rows, cols: nextField.cols, mines: nextField.mines },
        dqnConfig,
        config.dqn.trainEveryNSteps
      );

      this.trainer.setCallbacks({
        onMove: (row, col, game) => {
          this.currentGame = game;
          this.broadcastMove(row, col, game);
        },
        onEpisodeEnd: (result) => {
          this.handleEpisodeEnd(result);
        },
        onTrainStep: (loss, step) => {
          this.currentLoss = loss;
          this.lossHistory.push({ step, loss });
          if (this.lossHistory.length > 500) {
            this.lossHistory = this.lossHistory.slice(-500);
          }
          this.ws.broadcast({ type: 'train_step', data: { loss, step } });
        },
      });

      this.ws.broadcast({
        type: 'field_upgrade',
        data: { rows: nextField.rows, cols: nextField.cols, mines: nextField.mines },
      });

      this.updateStats();
    }
  }

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    console.log('[Orchestrator] Training started by user');

    this.ws.broadcast({ type: 'training_started' });

    this.stateSaveInterval = setInterval(() => {
      this.saveState();
    }, 10000);

    this.runLoop();
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      if (this.paused) {
        await this.sleep(100);
        continue;
      }

      try {
        await this.trainer.runEpisode(this.speedMultiplier);
      } catch (err) {
        if (this.running) {
          console.error('[Orchestrator] Episode error:', err);
        }
      }

      await this.yieldToEventLoop();
    }
  }

  private doReset(): void {
    this.running = false;
    this.paused = false;
    this.resetting = true;

    if (this.stateSaveInterval) {
      clearInterval(this.stateSaveInterval);
      this.stateSaveInterval = null;
    }

    setTimeout(() => {
      this.trainer.dispose();
      this.winHistory = [];
      this.winRateHistory = [];
      this.lossHistory = [];
      this.currentLoss = 0;
      this.currentGame = null;
      this.currentFieldIndex = 0;
      this.db.reset();

      const initialProgression = config.game.fieldProgression[0];
      const dqnConfig: DQNConfig = {
        inputSize: initialProgression.rows * initialProgression.cols,
        outputSize: initialProgression.rows * initialProgression.cols,
        hiddenLayers: config.dqn.hiddenLayers,
        learningRate: config.dqn.learningRate,
        gamma: config.dqn.gamma,
        epsilon: config.dqn.epsilonStart,
        epsilonMin: config.dqn.epsilonMin,
        epsilonDecay: config.dqn.epsilonDecay,
        batchSize: config.dqn.batchSize,
        replayCapacity: config.dqn.replayCapacity,
        targetUpdateTau: config.dqn.targetUpdateTau,
      };

      this.trainer = new Trainer(
        { rows: initialProgression.rows, cols: initialProgression.cols, mines: initialProgression.mines },
        dqnConfig,
        config.dqn.trainEveryNSteps
      );

      this.trainer.setCallbacks({
        onMove: (row, col, game) => {
          this.currentGame = game;
          this.broadcastMove(row, col, game);
        },
        onEpisodeEnd: (result) => {
          this.handleEpisodeEnd(result);
        },
        onTrainStep: (loss, step) => {
          this.currentLoss = loss;
          this.lossHistory.push({ step, loss });
          if (this.lossHistory.length > 500) {
            this.lossHistory = this.lossHistory.slice(-500);
          }
          this.ws.broadcast({ type: 'train_step', data: { loss, step } });
        },
      });

      this.ws.broadcast({ type: 'training_stopped' });

      this.ws.broadcast({
        type: 'field_upgrade',
        data: {
          rows: initialProgression.rows,
          cols: initialProgression.cols,
          mines: initialProgression.mines,
        },
      });

      this.updateStats();
      this.resetting = false;
      console.log('[Orchestrator] Reset complete');
    }, 200);
  }

  pause(): void {
    if (!this.running) return;
    this.paused = true;
    this.ws.broadcast({ type: 'training_paused' } as any);
    this.saveState();
    console.log('[Orchestrator] Training paused');
  }

  resume(): void {
    if (!this.running) return;
    this.paused = false;
    this.ws.broadcast({ type: 'training_resumed' } as any);
    console.log('[Orchestrator] Training resumed');
  }

  stop(): void {
    this.running = false;
    this.saveState();
    this.trainer.dispose();
    this.ws.broadcast({ type: 'training_stopped' });
    if (this.stateSaveInterval) {
      clearInterval(this.stateSaveInterval);
    }
  }

  setSpeed(speed: number): void {
    this.speedMultiplier = Math.max(0.1, speed);
  }

  private saveState(): void {
    const agent = this.trainer.getAgent();
    const buf = agent.getWeights();
    if (buf) {
      this.db.saveWeights(buf);
    }

    const gameState = this.currentGame?.getFullState();
    if (!gameState) return;

    this.db.saveState({
      episode: this.trainer.getEpisode(),
      epsilon: agent.config.epsilon,
      wins: this.winHistory.filter(Boolean).length,
      losses: this.winHistory.filter(w => !w).length,
      fieldRows: this.currentFieldIndex < config.game.fieldProgression.length
        ? config.game.fieldProgression[this.currentFieldIndex].rows
        : gameState.rows,
      fieldCols: this.currentFieldIndex < config.game.fieldProgression.length
        ? config.game.fieldProgression[this.currentFieldIndex].cols
        : gameState.cols,
      mines: this.currentFieldIndex < config.game.fieldProgression.length
        ? config.game.fieldProgression[this.currentFieldIndex].mines
        : gameState.totalMines,
      trainStep: this.trainer.getTrainStepCount(),
    });
  }

  private handleClientMessage(clientId: string, msg: { type: string; data?: any }): void {
    switch (msg.type) {
      case 'get_init':
        this.sendInit(clientId);
        break;
      case 'set_speed':
        if (msg.data && typeof msg.data.speed === 'number') {
          this.setSpeed(msg.data.speed);
        }
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'start_training':
        if (!this.running) {
          this.startLoop();
        }
        break;
      case 'reset':
        this.doReset();
        break;
    }
  }

  private broadcastUserCount(): void {
    this.ws.broadcast({
      type: 'user_count',
      data: { count: this.ws.getClientCount() },
    });
  }

  private sendInit(clientId: string): void {
    const state = this.db.getState();
    const fieldConfig = config.game.fieldProgression[this.currentFieldIndex];

    const baseData = {
      rows: this.currentGame ? this.currentGame.getRows() : fieldConfig.rows,
      cols: this.currentGame ? this.currentGame.getCols() : fieldConfig.cols,
      totalMines: this.currentGame ? this.currentGame.getTotalMines() : fieldConfig.mines,
      episode: state.episode,
      epsilon: state.epsilon,
      winRate: this.getWinRate(),
      winRateHistory: this.winRateHistory.slice(-200),
      lossHistory: this.lossHistory.slice(-300),
      fieldSize: `${fieldConfig.rows}x${fieldConfig.cols}·${fieldConfig.mines}`,
      training: this.running,
      userCount: this.ws.getClientCount(),
    };

    if (this.currentGame) {
      const gameState = this.currentGame.getFullState();
      this.ws.send(clientId, {
        type: 'init',
        data: {
          ...baseData,
          grid: gameState.grid,
          rows: gameState.rows,
          cols: gameState.cols,
          totalMines: gameState.totalMines,
          status: gameState.status,
          fieldSize: `${gameState.rows}x${gameState.cols}·${gameState.totalMines}`,
        },
      });
    } else {
      this.ws.send(clientId, {
        type: 'init',
        data: {
          ...baseData,
          grid: [],
          status: 'waiting',
        },
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
  }
}
