import { DQNNetwork } from './network';
import { ReplayBuffer, Experience } from './replay';

export interface DQNConfig {
  inputSize: number;
  outputSize: number;
  hiddenLayers: number[];
  learningRate: number;
  gamma: number;
  epsilon: number;
  epsilonMin: number;
  epsilonDecay: number;
  batchSize: number;
  replayCapacity: number;
  targetUpdateTau: number;
}

export class DQNAgent {
  private network: DQNNetwork;
  private replay: ReplayBuffer;
  public config: DQNConfig;

  constructor(config: DQNConfig) {
    this.config = config;
    this.network = new DQNNetwork(config.inputSize, config.outputSize, config.hiddenLayers);
    this.replay = new ReplayBuffer(config.replayCapacity);
  }

  selectAction(state: number[], validActions: number[]): number {
    if (validActions.length === 0) return -1;

    if (Math.random() < this.config.epsilon) {
      const idx = Math.floor(Math.random() * validActions.length);
      return validActions[idx];
    }

    const qValues = this.network.predict(state, false);

    let bestAction = validActions[0];
    let bestValue = -Infinity;

    for (const action of validActions) {
      if (qValues[action] > bestValue) {
        bestValue = qValues[action];
        bestAction = action;
      }
    }

    return bestAction;
  }

  remember(exp: Experience): void {
    this.replay.add(exp);
  }

  async replayStep(): Promise<number> {
    if (this.replay.size() < this.config.batchSize) return 0;

    const batch = this.replay.sample(this.config.batchSize);
    const states: number[][] = [];
    const targets: number[][] = [];

    for (const exp of batch) {
      const qValues = this.network.predict(exp.state, false);

      if (exp.done) {
        qValues[exp.action] = exp.reward;
      } else {
        const nextQValues = this.network.predict(exp.nextState, true);
        const maxNextQ = Math.max(...nextQValues);
        qValues[exp.action] = exp.reward + this.config.gamma * maxNextQ;
      }

      states.push(exp.state);
      targets.push(Array.from(qValues));
    }

    const loss = await this.network.train(states, targets);
    return loss;
  }

  updateTargetNetwork(): void {
    this.network.softUpdateTarget(this.config.targetUpdateTau);
  }

  decayEpsilon(): void {
    this.config.epsilon = Math.max(
      this.config.epsilonMin,
      this.config.epsilon * this.config.epsilonDecay
    );
  }

  getWeights(): Promise<ArrayBuffer> {
    return this.network.getWeights();
  }

  setWeights(buffer: ArrayBuffer): void {
    this.network.setWeights(buffer);
  }

  getReplaySize(): number {
    return this.replay.size();
  }

  dispose(): void {
    this.network.dispose();
  }
}
