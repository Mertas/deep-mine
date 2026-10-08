interface ChartPoint {
  x: number;
  y: number;
}

export class Charts {
  private winRateCanvas: HTMLCanvasElement;
  private lossCanvas: HTMLCanvasElement;
  private winRateCtx: CanvasRenderingContext2D;
  private lossCtx: CanvasRenderingContext2D;
  private winRateData: ChartPoint[] = [];
  private lossData: ChartPoint[] = [];
  private maxWinRatePoints = 300;
  private maxLossPoints = 400;

  constructor() {
    this.winRateCanvas = document.getElementById('chart-winrate') as HTMLCanvasElement;
    this.lossCanvas = document.getElementById('chart-loss') as HTMLCanvasElement;
    this.winRateCtx = this.winRateCanvas.getContext('2d')!;
    this.lossCtx = this.lossCanvas.getContext('2d')!;

    this.setupCanvas(this.winRateCanvas, this.winRateCtx);
    this.setupCanvas(this.lossCanvas, this.lossCtx);

    const ro = new ResizeObserver(() => {
      this.setupCanvas(this.winRateCanvas, this.winRateCtx);
      this.setupCanvas(this.lossCanvas, this.lossCtx);
      this.drawWinRate();
      this.drawLoss();
    });
    ro.observe(this.winRateCanvas.parentElement!);
    ro.observe(this.lossCanvas.parentElement!);
  }

  private setupCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    const parent = canvas.parentElement!;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  addWinRatePoint(episode: number, winRate: number): void {
    this.winRateData.push({ x: episode, y: winRate });
    if (this.winRateData.length > this.maxWinRatePoints) {
      this.winRateData = this.winRateData.slice(-this.maxWinRatePoints);
    }
    this.drawWinRate();
  }

  setWinRateHistory(data: { episode: number; winRate: number }[]): void {
    this.winRateData = data.map(d => ({ x: d.episode, y: d.winRate }));
    this.drawWinRate();
  }

  addLossPoint(step: number, loss: number): void {
    this.lossData.push({ x: step, y: loss });
    if (this.lossData.length > this.maxLossPoints) {
      this.lossData = this.lossData.slice(-this.maxLossPoints);
    }
    this.drawLoss();
  }

  setLossHistory(data: { step: number; loss: number }[]): void {
    this.lossData = data.map(d => ({ x: d.step, y: d.loss }));
    this.drawLoss();
  }

  private drawWinRate(): void {
    const ctx = this.winRateCtx;
    const canvas = this.winRateCanvas;
    const parent = canvas.parentElement!;
    const rect = parent.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const pad = { top: 16, right: 8, bottom: 20, left: 32 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    if (pw <= 0 || ph <= 0) return;

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let p = 0; p <= 1; p += 0.25) {
      const y = pad.top + (1 - p) * ph;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      ctx.fillStyle = '#4a4a66';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(p * 100)}%`, pad.left - 6, y + 3);
    }

    if (this.winRateData.length < 2) {
      ctx.fillStyle = '#4a4a66';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO DATA', w / 2, h / 2);
      return;
    }

    const xMin = this.winRateData[0].x;
    const xMax = this.winRateData[this.winRateData.length - 1].x;
    const xRange = xMax - xMin || 1;

    const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradient.addColorStop(0, 'rgba(77, 255, 139, 0.25)');
    gradient.addColorStop(1, 'rgba(77, 255, 139, 0.02)');

    ctx.beginPath();
    ctx.moveTo(pad.left, h - pad.bottom);

    for (const point of this.winRateData) {
      const x = pad.left + ((point.x - xMin) / xRange) * pw;
      const y = pad.top + (1 - point.y) * ph;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(pad.left + ((this.winRateData[this.winRateData.length - 1].x - xMin) / xRange) * pw, h - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#4dff8b';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < this.winRateData.length; i++) {
      const point = this.winRateData[i];
      const x = pad.left + ((point.x - xMin) / xRange) * pw;
      const y = pad.top + (1 - point.y) * ph;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0)';
    for (let p = 0; p <= 1; p += 0.25) {
      const y = pad.top + (1 - p) * ph;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }
  }

  private drawLoss(): void {
    const ctx = this.lossCtx;
    const canvas = this.lossCanvas;
    const parent = canvas.parentElement!;
    const rect = parent.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const pad = { top: 16, right: 8, bottom: 20, left: 32 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    if (pw <= 0 || ph <= 0) return;

    if (this.lossData.length < 2) {
      ctx.fillStyle = '#4a4a66';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO DATA', w / 2, h / 2);
      return;
    }

    const losses = this.lossData.map(d => d.y);
    const yMax = Math.max(...losses) || 1;
    const yMin = Math.min(...losses);
    const yRange = yMax - yMin || 1;

    const xMin = this.lossData[0].x;
    const xMax = this.lossData[this.lossData.length - 1].x;
    const xRange = xMax - xMin || 1;

    const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradient.addColorStop(0, 'rgba(255, 77, 106, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 77, 106, 0.02)');

    ctx.beginPath();
    ctx.moveTo(pad.left, h - pad.bottom);

    for (const point of this.lossData) {
      const x = pad.left + ((point.x - xMin) / xRange) * pw;
      const y = pad.top + (1 - (point.y - yMin) / yRange) * ph;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(pad.left + ((this.lossData[this.lossData.length - 1].x - xMin) / xRange) * pw, h - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#ff4d6a';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < this.lossData.length; i++) {
      const point = this.lossData[i];
      const x = pad.left + ((point.x - xMin) / xRange) * pw;
      const y = pad.top + (1 - (point.y - yMin) / yRange) * ph;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
