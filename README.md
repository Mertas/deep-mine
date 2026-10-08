# Deep Mine

Idle-автокликер, в котором нейросеть учится играть в «Сапёр»: DQN-агент (TensorFlow.js) исследует поле, набивает скилл — и кликает за игрока.

## Запуск

```bash
npm install
npm run dev     # клиент (esbuild, watch) + сервер (tsx/nodemon)
```

`npm run build` — прод-сборка, `npm start` — запуск сервера. Состояние — SQLite в `data/` (в репозиторий не входит).

## Стек

- **Клиент** — сборка esbuild
- **Сервер** — Node.js, Express, WebSocket
- **RL** — `@tensorflow/tfjs` (DQN)
- План развития — [PLAN.md](PLAN.md)

## Лицензия

MIT — см. [LICENSE](LICENSE).
