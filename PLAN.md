# Deep Mine — План разработки

## 1. Концепция

**Deep Mine** — idle-автокликер, в котором нейросеть (Deep Q-Network) учится играть в сапёра. Игрок только наблюдает: AI автоматически проходит эпизод за эпизодом, постепенно повышая процент побед. С ростом винрейта увеличивается размер поля и сложность. Весь процесс визуализируется в реальном времени через WebSocket.

### Жанр
Автокликер / idle game с элементами визуализации машинного обучения.

### Целевая аудитория
Разработчики, гики, любители ML и необычных idle-игр.

---

## 2. Технический стек

| Слой | Технология | Обоснование |
|---|---|---|
| **Фронтенд** | HTML5, TypeScript, CSS3 | Нативные Web API, без фреймворков. Сложные CSS-анимации (grid, transform, transition, keyframes) |
| **Бэкенд** | Node.js + TypeScript + Express | Единый язык (TS) на клиенте и сервере |
| **AI** | TensorFlow.js for Node (`@tensorflow/tfjs-node`) | DQN с GPU-ускорением через CUDA на сервере |
| **Реальное время** | `ws` (WebSocket) | Стриминг каждого хода AI клиенту |
| **База данных** | `better-sqlite3` | Синхронный SQLite, быстро, без зависимостей |
| **Сборка** | `esbuild` | Быстрая сборка TS для клиента и сервера |
| **Dev-сервер** | `tsx` + `nodemon` для сервера, `esbuild --serve` для клиента | Hot-reload при разработке |

---

## 3. Структура проекта

```
deep-mine/
├── client/
│   ├── index.html                  # Точка входа, подключение скриптов и стилей
│   ├── public/
│   │   └── favicon.ico
│   └── src/
│       ├── main.ts                 # Инициализация приложения
│       ├── app.ts                  # Главный класс приложения, диспетчер событий
│       ├── components/
│       │   ├── board.ts            # Отрисовка поля сапёра, анимация ходов
│       │   ├── dashboard.ts        # Верхняя панель: эпизоды, винрейт, epsilon
│       │   ├── charts.ts           # Графики (Canvas 2D): винрейт, loss
│       │   ├── settings.ts         # Нижняя панель: скорость, пауза, сброс
│       │   └── qvalue-overlay.ts   # Подсветка Q-значений на поле
│       ├── core/
│       │   ├── websocket.ts        # WebSocket клиент (connect, reconnect, message handler)
│       │   ├── renderer.ts         # Базовые утилиты рендеринга (создание DOM-элементов)
│       │   └── types.ts            # Общие типы (сообщения WS, состояние игры)
│       └── styles/
│           ├── main.css            # Глобальные стили, CSS-переменные, тёмная тема
│           ├── board.css           # Стили поля сапёра
│           ├── dashboard.css       # Стили панелей
│           ├── charts.css          # Стили canvas-графиков
│           └── animations.css      # Ключевые кадры анимаций
├── server/
│   └── src/
│       ├── index.ts                # Точка входа: запуск Express + WebSocket
│       ├── server.ts               # Конфигурация Express, статика, CORS, WebSocket upgrade
│       ├── ws.ts                   # WebSocket менеджер: подключения, broadcast, heartbeat
│       ├── game/
│       │   ├── minesweeper.ts      # Движок сапёра
│       │   └── types.ts            # Типы: Cell, State, Action, Reward
│       ├── dqn/
│       │   ├── agent.ts            # DQN агент: выбор действия (epsilon-greedy)
│       │   ├── network.ts          # Нейросеть: создание, predict, train, save/load
│       │   ├── replay.ts           # Experience Replay Buffer (deque фиксированного размера)
│       │   └── trainer.ts          # Цикл обучения: эпизоды, сбор опыта, train step
│       ├── orchestrator.ts         # Оркестратор: связывает trainer, WS, DB
│       ├── db.ts                   # SQLite: инициализация, CRUD для state и episodes
│       └── config.ts               # Конфигурация: размеры полей, гиперпараметры DQN
├── package.json                    # Зависимости и скрипты
├── tsconfig.json                   # Базовый конфиг TypeScript
├── tsconfig.client.json            # Конфиг для клиента (ES modules, DOM lib)
├── tsconfig.server.json            # Конфиг для сервера (CommonJS, Node lib)
├── build.mjs                       # Скрипт сборки на esbuild
├── PLAN.md                         # Этот файл
└── README.md                       # Описание проекта, как запустить
```

---

## 4. Архитектура данных

### 4.1. Типы данных (общие для сервера и клиента)

```typescript
// Состояние клетки сапёра
interface Cell {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number; // 0-8
}

// Состояние игры
interface GameState {
  grid: Cell[][];
  rows: number;
  cols: number;
  totalMines: number;
  revealedCount: number;
  flaggedCount: number;
  status: 'playing' | 'won' | 'lost';
  steps: number;
}

// Сообщения WebSocket (сервер → клиент)
type ServerMessage =
  | { type: 'init'; data: { state: GameState; episode: number; epsilon: number; winRate: number; loss: number[]; winRateHistory: number[] } }
  | { type: 'move'; data: { row: number; col: number; cell: Cell; state: GameState } }
  | { type: 'episode_end'; data: { win: boolean; episode: number; winRate: number; loss: number; fieldSize: string } }
  | { type: 'train_step'; data: { loss: number; step: number } }
  | { type: 'field_upgrade'; data: { rows: number; cols: number; mines: number } }
  | { type: 'stats'; data: { episode: number; epsilon: number; winRate: number } };

// Сообщения WebSocket (клиент → сервер)
type ClientMessage =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'set_speed'; data: { speed: number } } // 1x, 2x, 5x, 10x, max
  | { type: 'reset' };
```

### 4.2. Схема SQLite

```sql
CREATE TABLE IF NOT EXISTS training_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),  -- только одна строка
  episode       INTEGER NOT NULL DEFAULT 0,
  epsilon       REAL    NOT NULL DEFAULT 1.0,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  field_rows    INTEGER NOT NULL DEFAULT 5,
  field_cols    INTEGER NOT NULL DEFAULT 5,
  mines         INTEGER NOT NULL DEFAULT 3,
  train_step    INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS episodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  win           INTEGER NOT NULL,           -- 0 или 1
  steps         INTEGER NOT NULL,
  duration_ms   INTEGER NOT NULL,
  field_rows    INTEGER NOT NULL,
  field_cols    INTEGER NOT NULL,
  mines         INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_weights (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  layer_name    TEXT    NOT NULL,
  weights_blob  BLOB    NOT NULL,           -- бинарные данные весов TF.js
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_episodes_created ON episodes(created_at);
```

---

## 5. Компоненты сервера (детально)

### 5.1. Движок сапёра (`minesweeper.ts`)

```typescript
class Minesweeper {
  constructor(rows: number, cols: number, mines: number);
  
  // Генерация поля. Мины расставляются случайно, но не в первой открытой клетке
  generate(firstRow: number, firstCol: number): void;
  
  // Открыть клетку. Возвращает список всех открытых клеток (автооткрытие пустых соседей)
  reveal(row: number, col: number): Cell[];
  
  // Поставить/снять флаг
  toggleFlag(row: number, col: number): void;
  
  // Текущее состояние для передачи агенту (только видимая информация)
  getObservableState(): number[][];
  
  // Полное состояние для отображения на клиенте
  getFullState(): GameState;
  
  // Проверка завершения игры
  getStatus(): 'playing' | 'won' | 'lost';
}
```

**Правила:**
- Мины расставляются после первого хода (гарантия, что первый ход безопасен)
- При открытии клетки с `adjacentMines === 0` автоматически открываются все соседние (flood fill)
- Победа: открыты все клетки без мин
- Поражение: открыта клетка с миной

### 5.2. DQN нейросеть (`network.ts`)

**Архитектура:**
```
Input:  [rows * cols * 10] — one-hot представление каждой клетки:
        (0) неоткрытая, (1) 0 мин рядом, (2) 1 мина, ..., (9) флаг
        + rows, cols, mines как дополнительные признаки

Скрытые слои: Dense(256) → ReLU → Dense(256) → ReLU → Dense(128) → ReLU

Output: [rows * cols] — Q-значение для каждого возможного действия (открыть клетку)

Loss: Huber loss (устойчив к выбросам)
Optimizer: Adam, learning rate = 0.001
```

**Методы:**
```typescript
class DQNNetwork {
  createModel(inputDim: number, outputDim: number): tf.Sequential;
  predict(state: number[]): Float32Array;       // Q-значения для всех действий
  train(batch: Experience[]): number;            // Один шаг обучения, возвращает loss
  getWeights(): Promise<ArrayBuffer>;            // Сериализация весов для сохранения в БД
  setWeights(buffer: ArrayBuffer): Promise<void>;// Загрузка весов из БД
  dispose(): void;
}
```

### 5.3. Experience Replay (`replay.ts`)

```typescript
interface Experience {
  state: number[];
  action: number;         // индекс действия (row * cols + col)
  reward: number;
  nextState: number[];
  done: boolean;          // игра завершена?
}

class ReplayBuffer {
  constructor(capacity: number);  // 10000 опытов
  add(exp: Experience): void;
  sample(batchSize: number): Experience[];  // 64
  size(): number;
}
```

### 5.4. DQN Агент (`agent.ts`)

```typescript
class DQNAgent {
  constructor(stateSize: number, actionSize: number);
  
  // Выбор действия: epsilon-greedy
  selectAction(state: number[], validActions: number[], epsilon: number): number;
  
  // Запомнить опыт
  remember(exp: Experience): void;
  
  // Обучить на батче из replay buffer
  replay(batchSize: number): number;
  
  // Обновить целевую сеть (soft update, τ = 0.001)
  updateTargetNetwork(): void;
}
```

**Структура:** Double DQN с двумя сетями (online и target).
- Online-сеть обновляется каждый шаг
- Target-сеть обновляется мягко: `θ_target = τ * θ_online + (1-τ) * θ_target`
- При выборе действия online-сеть выбирает действие, target-сеть оценивает его Q-значение

### 5.5. Тренер (`trainer.ts`)

```typescript
class Trainer {
  constructor(rows: number, cols: number, mines: number, agent: DQNAgent);
  
  // Пройти один эпизод, возвращает результат
  async runEpisode(speedMultiplier: number): Promise<EpisodeResult>;
  
  // Немедленно остановить текущий эпизод
  stop(): void;
  
  // Текущий эпизод
  get currentEpisode(): number;
}
```

**Алгоритм одного эпизода:**
1. Сгенерировать поле (первая клетка выбирается агентом случайно)
2. Пока игра не завершена:
   - Получить состояние (observable)
   - Агент выбирает действие (epsilon-greedy)
   - Выполнить ход в сапёре
   - Если safe: reward = +1 (или +прибавка за каждую открытую клетку)
   - Если mine: reward = -1
   - Если won: reward = +10
   - Сохранить опыт в replay buffer
   - Каждые N шагов: train step
3. Обновить epsilon по расписанию
4. Обновить целевую сеть
5. Вернуть результат

**Награды (Reward shaping):**
| Событие | Награда |
|---|---|
| Открытие безопасной клетки | +1 |
| Открытие мины (поражение) | -1 |
| Победа | +10 |
| Каждая клетка при автооткрытии (flood fill) | +0.1 |

**Epsilon decay:**
- Начальный ε = 1.0 (полный рандом)
- Минимальный ε = 0.01
- Decay: экспоненциальный, ε = max(ε_min, ε * decay_rate)
- decay_rate подбирается так, чтобы за ~2000 эпизодов ε снизился до ~0.01

**Увеличение поля:**
- 5×5 (3 мины): стартовое поле
- При винрейте >70% за последние 100 эпизодов → повышение до 7×7 (5 мин)
- При винрейте >60% за последние 100 эпизодов → повышение до 9×9 (10 мин)
- При винрейте >50% → 11×11 (15 мин)
- При винрейте >40% → 13×13 (25 мин)
- При винрейте >30% → 16×16 (40 мин)
- В будущем: кастомные поля

### 5.6. Оркестратор (`orchestrator.ts`)

Мост между тренером, WebSocket-сервером и базой данных.

```typescript
class Orchestrator {
  constructor(wsManager: WSManager, db: Database);
  
  // Запустить обучение
  start(): void;
  
  // Приостановить
  pause(): void;
  
  // Продолжить
  resume(): void;
  
  // Установить скорость
  setSpeed(multiplier: number): void; // 1, 2, 5, 10, Infinity
  
  // Полный сброс
  reset(): void;
  
  // Сохранить состояние в БД
  saveState(): void;
  
  // Загрузить состояние из БД
  loadState(): Promise<void>;
}
```

**Цикл работы (event loop):**
```
while (running) {
  result = await trainer.runEpisode(speedMultiplier);
  
  broadcast({ type: 'episode_end', data: result });
  db.saveEpisode(result);
  
  checkFieldUpgrade();  // проверить, не пора ли увеличить поле
  saveState();           // периодически сохранять состояние
}
```

### 5.7. WebSocket менеджер (`ws.ts`)

```typescript
interface WSClient {
  id: string;
  socket: WebSocket;
  connectedAt: number;
}

class WSManager {
  // Принять новое подключение
  addClient(socket: WebSocket): void;
  
  // Отправить сообщение всем клиентам
  broadcast(message: ServerMessage): void;
  
  // Отправить сообщение конкретному клиенту (для init)
  send(clientId: string, message: ServerMessage): void;
  
  // Обработка входящих сообщений
  onMessage(clientId: string, message: ClientMessage): void;
  
  // Heartbeat: проверка живых соединений
  heartbeat(): void;
}
```

### 5.8. База данных (`db.ts`)

```typescript
class Database {
  constructor(dbPath: string);
  
  // Инициализация: создать таблицы, если нет
  init(): void;
  
  // Сохранить/загрузить training_state
  getState(): TrainingState;
  saveState(state: TrainingState): void;
  
  // Сохранить эпизод
  saveEpisode(result: EpisodeResult): void;
  
  // Получить историю эпизодов (для графиков)
  getRecentEpisodes(limit: number): Episode[];
  
  // Сохранить/загрузить веса модели
  saveWeights(weights: ArrayBuffer): void;
  loadWeights(): ArrayBuffer | null;
  
  // Полный сброс
  reset(): void;
}
```

---

## 6. Компоненты клиента (детально)

### 6.1. Точка входа (`main.ts`)

```typescript
// Создаём WebSocket соединение
// Создаём экземпляр App
// При init-сообщении от сервера рендерим всё
```

### 6.2. Главное приложение (`app.ts`)

```typescript
class App {
  private board: Board;
  private dashboard: Dashboard;
  private charts: Charts;
  private settings: Settings;
  private ws: WSClient;
  
  constructor();
  
  // Обработчики сообщений от сервера
  onInit(data): void;
  onMove(data): void;
  onEpisodeEnd(data): void;
  onTrainStep(data): void;
  onFieldUpgrade(data): void;
  onStats(data): void;
}
```

### 6.3. Поле сапёра (`board.ts`)

**Визуализация:**
- CSS Grid: `grid-template-columns: repeat(cols, 1fr)`
- Каждая клетка — `<div>` с классами: `.cell`, `.hidden`, `.revealed`, `.mine`, `.flagged`
- Число мин рядом — через `data-adjacent` и CSS `::after { content: attr(data-adjacent) }`
- Цифры раскрашены: 1=синий, 2=зелёный, 3=красный, 4=тёмно-синий, и т.д.

**Анимации открытия клетки:**
```css
.cell.revealed {
  animation: flipIn 0.3s ease-out;
}

@keyframes flipIn {
  0%   { transform: rotateY(90deg); background: #333; }
  100% { transform: rotateY(0deg); background: #1a1a1a; }
}
```

**Подсветка хода AI:**
- Последний ход подсвечивается пульсирующей рамкой
- Q-значения (опционально) отображаются через цветовую температуру: красный = высокое Q, синий = низкое

**Анимация победы:**
- Все мины раскрываются с анимацией `popIn`
- Запускается салют из частиц (CSS particles)

**Анимация поражения:**
- Мина взрывается: красная вспышка, затемнённые клетки
- Поле слегка трясётся (CSS `transform: translateX`)

### 6.4. Верхняя панель (`dashboard.ts`)

Отображает:
- **Эпизод:** моноширинный счётчик, быстро обновляется
- **Побед (%):** большой шрифт, цвет меняется от красного (<30%) к жёлтому (30-60%) к зелёному (>60%)
- **Epsilon (ε):** маленький индикатор, показывает текущий exploration rate
- **Размер поля:** например "9×9 · 10 мин"

Стиль: flexbox, тёмный фон, моноширинный шрифт, минималистичный.

### 6.5. Графики (`charts.ts`)

Два Canvas-графика:

**График винрейта (справа вверху):**
- Ось X: номер эпизода
- Ось Y: скользящее среднее винрейта (окно 100)
- Заливка под графиком с градиентом
- Обновляется после каждого эпизода

**График Loss (справа внизу):**
- Ось X: шаг обучения
- Ось Y: значение loss (логарифмическая шкала)
- Плавно обновляется
- Скользящее среднее

Оба графика реализованы на чистом Canvas 2D без библиотек (экономия зависимостей).

### 6.6. Нижняя панель управления (`settings.ts`)

- **Скорость:** слайдер или кнопки 1x | 2x | 5x | 10x | MAX
- **Пауза / Продолжить:** кнопка-переключатель
- **Сброс:** кнопка с подтверждением (модальное окно)

---

## 7. Стиль и дизайн

### Цветовая схема (тёмная тема)
```
--bg-primary:    #0a0a0f;    -- глубокий тёмный
--bg-secondary:  #14141f;    -- панели
--bg-cell:       #1a1a2e;    -- неоткрытая клетка
--bg-cell-open:  #0f0f1a;    -- открытая клетка
--text-primary:  #e0e0e0;    -- основной текст
--text-secondary:#8888aa;    -- второстепенный
--accent-blue:   #4a9eff;    -- цифра 1, акценты
--accent-green:  #4aff8b;    -- цифра 2, победа
--accent-red:    #ff4a6a;    -- цифра 3, поражение, мины
--accent-purple: #b44aff;    -- цифра 4
--accent-yellow: #ffd700;    -- epsilon, предупреждения
--accent-cyan:   #4affff;    -- подсветка хода AI
--border:        #2a2a3a;    -- границы
```

### Типографика
- Основной шрифт: `'JetBrains Mono', 'Fira Code', monospace`
- Альтернативный: `'Inter', system-ui, sans-serif`
- Размеры: 12px/14px/16px/24px/48px

### CSS-анимации
- `@keyframes pulse` — пульсация клетки при ходе
- `@keyframes flipIn` — переворот клетки при открытии
- `@keyframes shake` — тряска поля при поражении
- `@keyframes glowPulse` — свечение рамки активной клетки
- `@keyframes fadeInUp` — появление обновлений статистики
- `@keyframes confetti` — частицы при победе (несколько вариаций)
- `transition` для плавных изменений цвета, размера, прозрачности

---

## 8. План реализации (порядок шагов)

### Шаг 1: Инициализация проекта
- [ ] `package.json` с зависимостями и скриптами
- [ ] `tsconfig.json`, `tsconfig.client.json`, `tsconfig.server.json`
- [ ] `build.mjs` для сборки esbuild
- [ ] Базовая структура директорий
- [ ] `.gitignore`

**Зависимости:**
```json
{
  "dependencies": {
    "@tensorflow/tfjs-node": "^4.x",
    "better-sqlite3": "^11.x",
    "express": "^4.x",
    "ws": "^8.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "esbuild": "^0.24.x",
    "tsx": "^4.x",
    "nodemon": "^3.x",
    "@types/better-sqlite3": "^7.x",
    "@types/express": "^5.x",
    "@types/ws": "^8.x"
  }
}
```

**Скрипты:**
```json
{
  "scripts": {
    "build": "node build.mjs",
    "build:client": "node build.mjs client",
    "build:server": "node build.mjs server",
    "dev": "npm run dev:client & npm run dev:server",
    "dev:client": "node build.mjs client --watch",
    "dev:server": "nodemon --watch server/src --ext ts --exec \"node build.mjs server && node dist/server/index.js\"",
    "start": "node dist/server/index.js"
  }
}
```

### Шаг 2: Движок сапёра (`server/src/game/minesweeper.ts`)
- [ ] Класс `Cell`, типы
- [ ] Генерация поля с отсрочкой расстановки мин
- [ ] Метод `reveal()` с flood fill
- [ ] Методы `getObservableState()`, `getFullState()`
- [ ] Проверка победы/поражения
- [ ] Юнит-тесты (ручная проверка)

### Шаг 3: DQN на TensorFlow.js

#### 3a. Нейросеть (`server/src/dqn/network.ts`)
- [ ] Создание модели (Sequential)
- [ ] `predict(state)` → Q-значения
- [ ] `train(batch)` → loss
- [ ] `getWeights()` / `setWeights()` — сериализация
- [ ] `dispose()` — очистка памяти

#### 3b. Replay Buffer (`server/src/dqn/replay.ts`)
- [ ] Кольцевой буфер фиксированного размера
- [ ] `add()`, `sample()`, `size()`

#### 3c. Агент (`server/src/dqn/agent.ts`)
- [ ] Double DQN: online + target сети
- [ ] `selectAction()` — epsilon-greedy, маскировка невалидных действий
- [ ] `remember()`, `replay()`
- [ ] `updateTargetNetwork()` — soft update

#### 3d. Тренер (`server/src/dqn/trainer.ts`)
- [ ] Цикл эпизода: состояния, действия, награды
- [ ] Epsilon decay
- [ ] Сохранение опыта, периодическое обучение
- [ ] Callback'и для оповещения о ходе, шаге, конце эпизода

### Шаг 4: SQLite база данных (`server/src/db.ts`)
- [ ] Инициализация таблиц
- [ ] CRUD для `training_state`
- [ ] Сохранение эпизодов
- [ ] Сохранение/загрузка весов модели (BLOB)
- [ ] Метод `reset()`

### Шаг 5: WebSocket и Express сервер

#### 5a. Express сервер (`server/src/server.ts`)
- [ ] Раздача статики из `dist/client/`
- [ ] WebSocket upgrade на том же порту
- [ ] CORS для разработки

#### 5b. WebSocket менеджер (`server/src/ws.ts`)
- [ ] Управление подключениями
- [ ] Broadcast сообщений
- [ ] Парсинг входящих команд
- [ ] Heartbeat (ping/pong каждые 30 сек)

### Шаг 6: Оркестратор (`server/src/orchestrator.ts`)
- [ ] Главный цикл: эпизод за эпизодом
- [ ] Интеграция с WS (отправка move, episode_end, train_step)
- [ ] Интеграция с DB (сохранение состояния каждые 10 эпизодов)
- [ ] Обработка команд от клиента (pause, resume, speed, reset)
- [ ] Логика увеличения поля (проверка винрейта)
- [ ] Отправка `init` новым клиентам (текущее состояние)

### Шаг 7: Точка входа сервера (`server/src/index.ts`)
- [ ] Создание Express + WS
- [ ] Инициализация БД
- [ ] Загрузка сохранённого состояния (если есть)
- [ ] Запуск оркестратора

### Шаг 8: Клиент — HTML и CSS

#### 8a. `index.html`
- [ ] Структура: контейнеры для поля, панелей, графиков
- [ ] Подключение скриптов и стилей

#### 8b. `main.css`
- [ ] CSS custom properties (цветовая схема)
- [ ] Базовые сбросы и типографика
- [ ] Импорт Google Fonts (JetBrains Mono)

#### 8c. `board.css`
- [ ] CSS Grid для поля
- [ ] Стили клеток (hidden, revealed, flagged, mine)
- [ ] Цвета цифр
- [ ] Анимации flipIn, shake, pulse

#### 8d. `dashboard.css`
- [ ] Верхняя панель: flexbox, метрики
- [ ] Анимации обновления чисел

#### 8e. `charts.css`
- [ ] Контейнеры для canvas
- [ ] Легенда и оси (если нужны)

#### 8f. `animations.css`
- [ ] Все @keyframes
- [ ] Утилитные классы анимаций

### Шаг 9: Клиент — TypeScript

#### 9a. WebSocket клиент (`client/src/core/websocket.ts`)
- [ ] Соединение, авто-переподключение
- [ ] Парсинг JSON-сообщений
- [ ] Колбэки на типы сообщений
- [ ] Отправка команд

#### 9b. Типы (`client/src/core/types.ts`)
- [ ] Общие типы (сообщения WS, GameState, Cell)
- [ ] Реэкспорт совместимых с сервером типов

#### 9c. Поле сапёра (`client/src/components/board.ts`)
- [ ] Рендер пустого поля (Grid)
- [ ] Обновление клеток при `move`
- [ ] Анимация открытия (добавление/удаление CSS-классов)
- [ ] Анимация победы/поражения
- [ ] Подсветка последнего хода
- [ ] Перестройка поля при `field_upgrade` (изменение размера)

#### 9d. Верхняя панель (`client/src/components/dashboard.ts`)
- [ ] Обновление значений (эпизод, винрейт, epsilon, размер поля)
- [ ] Плавная анимация смены чисел
- [ ] Цветовое кодирование винрейта

#### 9e. Графики (`client/src/components/charts.ts`)
- [ ] Canvas 2D отрисовка
- [ ] График винрейта (линия + заливка, скользящее среднее)
- [ ] График loss (линия, логарифмическая шкала)
- [ ] Буферизация данных (хранить последние N точек)
- [ ] Перерисовка при изменении размера (ResizeObserver)

#### 9f. Панель управления (`client/src/components/settings.ts`)
- [ ] Кнопки скорости
- [ ] Пауза/продолжить
- [ ] Кнопка сброса + модальное окно подтверждения

#### 9g. Главный файл (`client/src/app.ts`)
- [ ] Инициализация всех компонентов
- [ ] Подписка на сообщения WebSocket
- [ ] Диспетчеризация событий компонентам

#### 9h. Точка входа (`client/src/main.ts`)
- [ ] Создание App
- [ ] Подключение к WebSocket

---

## 9. Сборка и dev-окружение

### `build.mjs`
```javascript
// Собирает клиент и/или сервер через esbuild
// client → dist/client/ (ESM, browser target)
// server → dist/server/ (CJS, node target)
// Поддержка --watch для dev-режима
```

### Dev-процесс:
1. `npm run dev` запускает параллельно:
   - `esbuild --watch` для клиента (пересборка при изменениях)
   - `nodemon` для сервера (перезапуск при изменениях)
2. Express раздаёт `dist/client/` как статику
3. WebSocket на том же порту

### Продакшн:
1. `npm run build` — полная сборка
2. `npm start` — запуск сервера

---

## 10. Конфигурация (`server/src/config.ts`)

```typescript
export const config = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    staticDir: '../dist/client',
  },
  
  game: {
    initialRows: 5,
    initialCols: 5,
    initialMines: 3,
    fieldProgression: [
      { rows: 5,  cols: 5,  mines: 3,  winRateThreshold: 1.00 }, // стартовое
      { rows: 7,  cols: 7,  mines: 5,  winRateThreshold: 0.70 },
      { rows: 9,  cols: 9,  mines: 10, winRateThreshold: 0.60 },
      { rows: 11, cols: 11, mines: 15, winRateThreshold: 0.50 },
      { rows: 13, cols: 13, mines: 25, winRateThreshold: 0.40 },
      { rows: 16, cols: 16, mines: 40, winRateThreshold: 0.30 },
    ],
    winRateWindow: 100, // последние N эпизодов для оценки винрейта
  },
  
  dqn: {
    hiddenLayers: [256, 256, 128],
    learningRate: 0.001,
    gamma: 0.99,           // discount factor
    epsilonStart: 1.0,
    epsilonMin: 0.01,
    epsilonDecay: 0.998,   // за эпизод
    batchSize: 64,
    replayCapacity: 10000,
    targetUpdateTau: 0.001,
    trainEveryNSteps: 4,   // обучаться каждые N ходов
    minReplaySize: 500,    // минимальный размер буфера до начала обучения
  },
  
  db: {
    path: './data/deepmine.db',
  },
};
```

---

## 11. Особые моменты и риски

### 11.1. Производительность DQN на Node.js
- TensorFlow.js для Node использует нативные биндинги (C++), поэтому производительность приемлемая
- Но на CPU обучение будет медленным для полей > 9×9
- **Решение:** ограничить скорость эпизодов, добавить задержку между ходами для визуализации
- В будущем: GPU-ускорение через `@tensorflow/tfjs-node-gpu`

### 11.2. Управление памятью TF.js
- Тензоры нужно явно освобождать (`tf.dispose()` / `tf.tidy()`)
- Утечка памяти приведёт к падению сервера через несколько тысяч эпизодов
- **Решение:** строгое использование `tf.tidy()` в predict и train

### 11.3. Размер состояния для больших полей
- 16×16 поле с one-hot кодировкой (10 каналов) = 2560 входных нейронов
- Сеть с 3 скрытыми слоями по 256 нейронов — приемлемо
- **Решение:** при переходе на новое поле пересоздавать модель с новыми размерами входа/выхода

### 11.4. WebSocket нагрузка
- При максимальной скорости эпизодов возможна большая нагрузка на WS
- **Решение:** throttle — отправлять не каждый ход, а каждые N мс (например, каждые 50мс)
- На максимальной скорости можно слать только `episode_end` и `stats`

---

## 12. Будущие улучшения (v2)

- [ ] GPU-ускорение DQN
- [ ] Несколько параллельных экземпляров обучения
- [ ] Аутентификация и сохранение прогресса в облаке
- [ ] Таблицы лидеров
- [ ] Экспорт/импорт модели
- [ ] Визуализация весов сети (t-SNE, heatmap)
- [ ] Ручной режим: игрок может сам играть в сапёра
- [ ] Сравнение с другими агентами (Random, Q-Table)
- [ ] График распределения Q-значений по клеткам (heatmap поверх поля)
- [ ] Звуки и музыка (Web Audio API)
- [ ] Мобильная адаптация (responsive CSS)

---

## 13. Примечания по реализации

### TensorFlow.js для Node: установка
```bash
npm install @tensorflow/tfjs-node
```
Автоматически скачивает и компилирует нативные биндинги. Требует Python и C++ build tools.
На Windows: `npm install --build-from-source @tensorflow/tfjs-node` (нужны Visual Studio Build Tools).

### better-sqlite3: установка
```bash
npm install better-sqlite3
```
Требует нативные модули. На Windows нужны те же build tools.

### Структура пакета
Используем один `package.json` в корне. Клиент и сервер — часть одного проекта.
Сборка через esbuild (быстро, поддержка TS из коробки).

---

**План готов. Можно начинать реализацию по шагам.**
