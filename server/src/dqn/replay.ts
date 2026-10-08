export interface Experience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
}

export class ReplayBuffer {
  private buffer: Experience[];
  private capacity: number;
  private position = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = [];
  }

  add(exp: Experience): void {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(exp);
    } else {
      this.buffer[this.position] = exp;
    }
    this.position = (this.position + 1) % this.capacity;
  }

  sample(batchSize: number): Experience[] {
    const size = Math.min(batchSize, this.buffer.length);
    const batch: Experience[] = [];
    const seen = new Set<number>();

    while (batch.length < size) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      if (!seen.has(idx)) {
        seen.add(idx);
        batch.push(this.buffer[idx]);
      }
    }

    return batch;
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
    this.position = 0;
  }
}
