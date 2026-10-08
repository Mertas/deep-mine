import { WSClient } from './core/websocket';
import { Board } from './components/board';
import { Dashboard } from './components/dashboard';
import { Charts } from './components/charts';
import { Settings } from './components/settings';
import type { ServerMessage, InitData, MoveData, EpisodeEndData, TrainStepData, FieldUpgradeData, StatsData } from './core/types';

export class App {
  private ws: WSClient;
  private board: Board;
  private dashboard: Dashboard;
  private charts: Charts;
  private settings: Settings;
  private startScreen: HTMLElement;
  private startBtn: HTMLElement;
  private training = false;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WSClient(wsUrl);
    this.board = new Board();
    this.dashboard = new Dashboard();
    this.charts = new Charts();
    this.settings = new Settings(this.ws);

    this.startScreen = document.getElementById('start-screen')!;
    this.startBtn = document.getElementById('btn-start-training')!;

    this.startBtn.addEventListener('click', () => {
      this.startTraining();
    });

    this.setupHandlers();
    this.ws.connect();
  }

  private setupHandlers(): void {
    this.ws.on('init', (msg) => this.handleInit(msg as { type: 'init'; data: InitData }));
    this.ws.on('move', (msg) => this.handleMove(msg as { type: 'move'; data: MoveData }));
    this.ws.on('episode_end', (msg) => this.handleEpisodeEnd(msg as { type: 'episode_end'; data: EpisodeEndData }));
    this.ws.on('train_step', (msg) => this.handleTrainStep(msg as { type: 'train_step'; data: TrainStepData }));
    this.ws.on('field_upgrade', (msg) => this.handleFieldUpgrade(msg as { type: 'field_upgrade'; data: FieldUpgradeData }));
    this.ws.on('stats', (msg) => this.handleStats(msg as { type: 'stats'; data: StatsData }));
    this.ws.on('user_count', (msg) => this.handleUserCount(msg as any));
    this.ws.on('training_started', () => this.handleTrainingStarted());
    this.ws.on('training_stopped', () => this.handleTrainingStopped());
    this.ws.on('training_paused', () => this.handleTrainingPaused());
    this.ws.on('training_resumed', () => this.handleTrainingResumed());
  }

  private startTraining(): void {
    this.ws.send({ type: 'start_training' });
    this.startBtn.textContent = 'STARTING...';
    this.startBtn.setAttribute('disabled', 'true');
  }

  private handleTrainingStarted(): void {
    this.training = true;
    this.startScreen.classList.add('hidden');
    const bottomEl = document.getElementById('status-message');
    if (bottomEl) bottomEl.textContent = 'AI learning in progress...';
  }

  private handleTrainingStopped(): void {
    this.training = false;
    this.startScreen.classList.remove('hidden');
    this.startBtn.textContent = 'START TRAINING';
    this.startBtn.removeAttribute('disabled');
    const bottomEl = document.getElementById('status-message');
    if (bottomEl) bottomEl.textContent = 'Training stopped. Press START to begin.';
  }

  private handleTrainingPaused(): void {
    this.settings.setPaused(true);
    const bottomEl = document.getElementById('status-message');
    if (bottomEl) bottomEl.textContent = 'Training paused';
  }

  private handleTrainingResumed(): void {
    this.settings.setPaused(false);
    const bottomEl = document.getElementById('status-message');
    if (bottomEl) bottomEl.textContent = 'AI learning in progress...';
  }

  private handleInit(msg: { type: 'init'; data: InitData }): void {
    const { data } = msg;
    this.board.init({ rows: data.rows, cols: data.cols, totalMines: data.totalMines, grid: data.grid });
    this.dashboard.updateEpisode(data.episode);
    this.dashboard.updateWinRate(data.winRate);
    this.dashboard.updateEpsilon(data.epsilon);
    this.dashboard.updateFieldSize(data.fieldSize);

    if (data.winRateHistory.length > 0) {
      this.charts.setWinRateHistory(data.winRateHistory);
    }
    if (data.lossHistory.length > 0) {
      this.charts.setLossHistory(data.lossHistory);
    }

    this.updateClientCount(data.userCount);

    if (data.training) {
      this.training = true;
      this.startScreen.classList.add('hidden');
      const bottomEl = document.getElementById('status-message');
      if (bottomEl) bottomEl.textContent = 'AI learning in progress...';
    } else {
      const bottomEl = document.getElementById('status-message');
      if (bottomEl) bottomEl.textContent = 'Connected. Press START TRAINING to begin.';
    }
  }

  private handleMove(msg: { type: 'move'; data: MoveData }): void {
    this.board.applyMove(msg.data);
    this.board.updateInfo({
      revealed: msg.data.revealedCount,
      total: 0,
      flags: msg.data.flaggedCount,
      totalMines: 0,
      steps: 0,
    });
  }

  private handleEpisodeEnd(msg: { type: 'episode_end'; data: EpisodeEndData }): void {
    const { data } = msg;
    this.dashboard.updateEpisode(data.episode);
    this.dashboard.updateWinRate(data.winRate);
    this.dashboard.updateLoss(data.loss);
    if (data.fieldSize) {
      this.dashboard.updateFieldSize(data.fieldSize);
    }
    this.charts.addWinRatePoint(data.episode, data.winRate);
  }

  private handleTrainStep(msg: { type: 'train_step'; data: TrainStepData }): void {
    const { data } = msg;
    this.dashboard.updateTrainStep(data.step);
    this.charts.addLossPoint(data.step, data.loss);
  }

  private handleFieldUpgrade(msg: { type: 'field_upgrade'; data: FieldUpgradeData }): void {
    this.board.handleFieldUpgrade(msg.data);
    this.dashboard.updateFieldSize(`${msg.data.rows}x${msg.data.cols}·${msg.data.mines}`);
  }

  private handleStats(msg: { type: 'stats'; data: StatsData }): void {
    const { data } = msg;
    this.dashboard.updateEpisode(data.episode);
    this.dashboard.updateWinRate(data.winRate);
    this.dashboard.updateEpsilon(data.epsilon);
  }

  private handleUserCount(msg: { data: { count: number } }): void {
    this.updateClientCount(msg.data.count);
  }

  private updateClientCount(count: number): void {
    const el = document.getElementById('info-clients');
    if (el) el.textContent = String(count);
  }
}
