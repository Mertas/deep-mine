export class Dashboard {
  private episodeEl: HTMLElement;
  private winRateEl: HTMLElement;
  private epsilonEl: HTMLElement;
  private fieldSizeEl: HTMLElement;

  constructor() {
    this.episodeEl = document.getElementById('episode-counter')!;
    this.winRateEl = document.getElementById('win-rate')!;
    this.epsilonEl = document.getElementById('epsilon-value')!;
    this.fieldSizeEl = document.getElementById('field-size')!;
  }

  updateEpisode(episode: number): void {
    const prev = this.episodeEl.textContent;
    this.episodeEl.textContent = String(episode);
    if (prev !== String(episode)) {
      this.episodeEl.classList.remove('flash');
      void this.episodeEl.offsetWidth;
      this.episodeEl.classList.add('flash');
    }
  }

  updateWinRate(rate: number): void {
    const pct = Math.round(rate * 100);
    const prev = this.winRateEl.textContent;
    this.winRateEl.textContent = `${pct}%`;
    this.winRateEl.dataset.rate = String(pct);

    this.winRateEl.classList.remove('rate-good', 'rate-ok', 'rate-bad');
    if (rate >= 0.6) this.winRateEl.classList.add('rate-good');
    else if (rate >= 0.3) this.winRateEl.classList.add('rate-ok');
    else this.winRateEl.classList.add('rate-bad');

    if (prev !== `${pct}%`) {
      this.winRateEl.classList.remove('flash');
      void this.winRateEl.offsetWidth;
      this.winRateEl.classList.add('flash');
    }
  }

  updateEpsilon(epsilon: number): void {
    this.epsilonEl.textContent = epsilon.toFixed(3);
  }

  updateFieldSize(size: string): void {
    this.fieldSizeEl.textContent = size;
  }

  updateLoss(loss: number): void {
    const el = document.getElementById('info-loss');
    if (el) el.textContent = loss.toFixed(4);
  }

  updateTrainStep(step: number): void {
    const el = document.getElementById('info-train-step');
    if (el) el.textContent = String(step);
  }
}
