import { WSClient } from '../core/websocket';

export class Settings {
  private ws: WSClient;
  private speedBtns: NodeListOf<HTMLElement>;
  private pauseBtn: HTMLElement;
  private resetBtn: HTMLElement;
  private resetModal: HTMLElement;
  private resetConfirmBtn: HTMLElement;
  private resetCancelBtn: HTMLElement;
  private paused = false;

  constructor(ws: WSClient) {
    this.ws = ws;

    this.speedBtns = document.querySelectorAll('.speed-btn');
    this.pauseBtn = document.getElementById('btn-pause')!;
    this.resetBtn = document.getElementById('btn-reset')!;
    this.resetModal = document.getElementById('reset-modal')!;
    this.resetConfirmBtn = document.getElementById('btn-reset-confirm')!;
    this.resetCancelBtn = document.getElementById('btn-reset-cancel')!;

    this.speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed!);
        this.setSpeed(speed);
      });
    });

    this.pauseBtn.addEventListener('click', () => {
      this.togglePause();
    });

    this.resetBtn.addEventListener('click', () => {
      this.resetModal.classList.remove('hidden');
    });

    this.resetConfirmBtn.addEventListener('click', () => {
      this.ws.send({ type: 'reset' });
      this.resetModal.classList.add('hidden');
    });

    this.resetCancelBtn.addEventListener('click', () => {
      this.resetModal.classList.add('hidden');
    });
  }

  private setSpeed(speed: number): void {
    this.ws.send({ type: 'set_speed', data: { speed } });

    this.speedBtns.forEach(btn => {
      const btnSpeed = parseFloat(btn.dataset.speed!);
      btn.classList.toggle('active', btnSpeed === speed);
    });
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.ws.send({ type: 'pause' });
      this.pauseBtn.textContent = 'RESUME';
      this.pauseBtn.classList.add('paused');
    } else {
      this.ws.send({ type: 'resume' });
      this.pauseBtn.textContent = 'PAUSE';
      this.pauseBtn.classList.remove('paused');
    }
  }

  setPaused(state: boolean): void {
    this.paused = state;
    if (state) {
      this.pauseBtn.textContent = 'RESUME';
      this.pauseBtn.classList.add('paused');
    } else {
      this.pauseBtn.textContent = 'PAUSE';
      this.pauseBtn.classList.remove('paused');
    }
  }
}
