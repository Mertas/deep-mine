export const config = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    staticDir: 'dist/client',
  },

  game: {
    initialRows: 5,
    initialCols: 5,
    initialMines: 3,
    fieldProgression: [
      { rows: 5,  cols: 5,  mines: 3,  winRateThreshold: 1.00 },
      { rows: 7,  cols: 7,  mines: 5,  winRateThreshold: 0.70 },
      { rows: 9,  cols: 9,  mines: 10, winRateThreshold: 0.60 },
      { rows: 11, cols: 11, mines: 15, winRateThreshold: 0.50 },
      { rows: 13, cols: 13, mines: 25, winRateThreshold: 0.40 },
      { rows: 16, cols: 16, mines: 40, winRateThreshold: 0.30 },
    ],
    winRateWindow: 100,
  },

  dqn: {
    hiddenLayers: [256, 256, 128],
    learningRate: 0.001,
    gamma: 0.99,
    epsilonStart: 1.0,
    epsilonMin: 0.01,
    epsilonDecay: 0.998,
    batchSize: 64,
    replayCapacity: 10000,
    targetUpdateTau: 0.001,
    trainEveryNSteps: 4,
    minReplaySize: 500,
  },

  db: {
    path: './data/deepmine.db',
  },

  ws: {
    heartbeatInterval: 30000,
    throttleInterval: 50,
  },
};
