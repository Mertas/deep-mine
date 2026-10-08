import * as tf from '@tensorflow/tfjs';

export class DQNNetwork {
  private onlineModel: tf.Sequential;
  private targetModel: tf.Sequential;
  private inputSize: number;
  private outputSize: number;

  constructor(inputSize: number, outputSize: number, hiddenLayers: number[] = [256, 256, 128]) {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    this.onlineModel = this.createModel(hiddenLayers);
    this.targetModel = this.createModel(hiddenLayers);
    this.updateTarget();
  }

  private createModel(hiddenLayers: number[]): tf.Sequential {
    const model = tf.sequential();

    model.add(tf.layers.dense({
      inputShape: [this.inputSize],
      units: hiddenLayers[0],
      activation: 'relu',
      kernelInitializer: 'heNormal',
    }));

    for (let i = 1; i < hiddenLayers.length; i++) {
      model.add(tf.layers.dense({
        units: hiddenLayers[i],
        activation: 'relu',
        kernelInitializer: 'heNormal',
      }));
    }

    model.add(tf.layers.dense({
      units: this.outputSize,
      activation: 'linear',
      kernelInitializer: 'glorotNormal',
    }));

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
    });

    return model;
  }

  predict(state: number[], useTarget = false): Float32Array {
    return tf.tidy(() => {
      const input = tf.tensor2d([state], [1, this.inputSize]);
      const model = useTarget ? this.targetModel : this.onlineModel;
      const output = model.predict(input) as tf.Tensor;
      return output.dataSync() as Float32Array;
    });
  }

  async train(states: number[][], targets: number[][]): Promise<number> {
    const xs = tf.tensor2d(states);
    const ys = tf.tensor2d(targets);
    const result = await this.onlineModel.trainOnBatch(xs, ys);
    const loss = Array.isArray(result) ? result[0] : result;
    tf.dispose([xs, ys]);
    return loss as number;
  }

  updateTarget(): void {
    tf.tidy(() => {
      const onlineWeights = this.onlineModel.getWeights();
      const targetWeights: tf.Tensor[] = [];
      for (const w of onlineWeights) {
        targetWeights.push(w.clone());
      }
      this.targetModel.setWeights(targetWeights);
    });
  }

  softUpdateTarget(tau: number): void {
    tf.tidy(() => {
      const onlineWeights = this.onlineModel.getWeights();
      const targetWeights = this.targetModel.getWeights();
      const newWeights: tf.Tensor[] = [];
      for (let i = 0; i < onlineWeights.length; i++) {
        const w = tf.tidy(() =>
          targetWeights[i].mul(1 - tau).add(onlineWeights[i].mul(tau))
        );
        newWeights.push(w);
      }
      this.targetModel.setWeights(newWeights);
    });
  }

  getWeights(): ArrayBuffer {
    return tf.tidy(() => {
      const weights = this.onlineModel.getWeights();
      const weightData = weights.map(w => w.dataSync());
      const shapes = weights.map(w => w.shape);

      const metadata = { shapes };
      const metaJson = JSON.stringify(metadata);
      const metaBytes = new TextEncoder().encode(metaJson);

      const totalDataSize = weightData.reduce((sum, d) => sum + d.byteLength, 0);
      const headerSize = 4 + metaBytes.length;
      const buffer = new ArrayBuffer(headerSize + totalDataSize);

      const view = new DataView(buffer);
      view.setUint32(0, metaBytes.length, true);
      new Uint8Array(buffer, 4, metaBytes.length).set(metaBytes);

      let offset = headerSize;
      for (const data of weightData) {
        new Uint8Array(buffer, offset, data.byteLength).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        offset += data.byteLength;
      }

      return buffer;
    });
  }

  setWeights(buffer: ArrayBuffer): void {
    tf.tidy(() => {
      const view = new DataView(buffer);
      const metaLen = view.getUint32(0, true);

      const metaBytes = new Uint8Array(buffer, 4, metaLen);
      const metaJson = new TextDecoder().decode(metaBytes);
      const { shapes } = JSON.parse(metaJson);

      const tensors: tf.Tensor[] = [];
      let offset = 4 + metaLen;

      for (const shape of shapes) {
        const size = shape.reduce((a: number, b: number) => a * b, 1);
        const data = new Float32Array(buffer, offset, size);
        tensors.push(tf.tensor(data, shape));
        offset += size * 4;
      }

      this.onlineModel.setWeights(tensors);
      this.updateTarget();
    });
  }

  dispose(): void {
    this.onlineModel.dispose();
    this.targetModel.dispose();
  }
}
