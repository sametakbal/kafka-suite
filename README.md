<p align="center">
  <img src="https://img.shields.io/badge/Kafka-Suite-4287f5?style=for-the-badge&logo=apachekafka&logoColor=white" alt="Kafka Suite" />
</p>

<h1 align="center">Kafka Suite</h1>

<p align="center">
  A modern, open-source desktop application for managing and monitoring Apache Kafka clusters.<br/>
  Built with Electron, React, and TypeScript.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/electron-40-47848F?style=flat-square&logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/typescript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/tailwindcss-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
</p>

---

## ✨ Features

- **Multi-Cluster Management** — Connect to and manage multiple Kafka clusters simultaneously
- **Topic Explorer** — Browse topics with partition count, replication factor, and message count at a glance
- **Real-time Message Streaming** — Live tail consumer with auto-scroll and partition color indicators
- **Message Producer** — Produce messages to topics with key, headers, and partition selection
- **Topic Creation** — Create topics with custom partition count, replication factor, and advanced configs
- **Message Viewer** — Inspect messages with JSON syntax highlighting and pretty-print
- **Connection Testing** — Test broker connectivity before saving with detailed error feedback
- **Secure Storage** — Connection credentials stored locally with encryption via electron-store
- **Dark Theme** — Clean, modern dark UI designed for extended use

## 📸 Screenshots

<!-- Add your screenshots here -->
<!-- ![Dashboard](screenshots/dashboard.png) -->
<!-- ![Topic Detail](screenshots/topic-detail.png) -->
<!-- ![Live Tail](screenshots/live-tail.png) -->

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later
- A running Apache Kafka cluster to connect to

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/kafka-suite.git
cd kafka-suite

# Install dependencies
npm install
```

### Development

```bash
# Start both renderer (Vite) and main process in watch mode
npm run dev

# In a separate terminal, start Electron
npm start
```

Or use the all-in-one dev command:

```bash
npm run electron:dev
```

### Build

```bash
# Build renderer and main process for production
npm run build

# Run the production build
npm start
```

### Package for Windows

```bash
# Create NSIS installer + portable executable
npm run dist

# Create portable executable only
npm run dist:portable
```

Output files will be in the `release/` directory.

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Electron 40](https://www.electronjs.org/) |
| Frontend | [React 19](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| Bundler | [Vite 7](https://vite.dev/) |
| Kafka Client | [KafkaJS](https://kafka.js.org/) |
| State Management | [TanStack Query 5](https://tanstack.com/query) |
| Local Storage | [electron-store](https://github.com/sindresorhus/electron-store) |
| Icons | [Lucide React](https://lucide.dev/) |
| Packaging | [electron-builder](https://www.electron.build/) |

## 📁 Project Structure

```
kafka-suite/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # Window creation & app lifecycle
│   │   ├── preload.ts         # Context bridge (IPC API)
│   │   ├── kafka.ts           # KafkaJS integration & IPC handlers
│   │   └── store.ts           # Encrypted local storage for connections
│   └── renderer/              # React frontend
│       ├── main.tsx           # React entry point
│       ├── App.tsx            # Root component & connection state
│       ├── types.ts           # Shared TypeScript interfaces
│       ├── lib/utils.ts       # Utility functions
│       └── components/
│           ├── Sidebar.tsx            # Cluster list & navigation
│           ├── Dashboard.tsx          # Topic explorer & stats
│           ├── TopicDetail.tsx        # Message viewer & live tail
│           ├── AddClusterModal.tsx    # Connection form with test
│           ├── CreateTopicModal.tsx   # Topic creation form
│           └── ProduceMessageModal.tsx # Message producer
├── design/                    # HTML design mockups
├── tsconfig.json              # Renderer TypeScript config
├── tsconfig.main.json         # Main process TypeScript config
├── vite.config.ts             # Vite configuration
└── package.json               # Dependencies & build config
```

## ⚙️ How It Works

Kafka Suite uses Electron's **context isolation** pattern for security:

1. **Main Process** (`src/main/`) — Runs Node.js with full system access. Manages Kafka connections via KafkaJS, handles encrypted storage, and exposes functionality through IPC handlers.

2. **Preload Script** (`src/main/preload.ts`) — Bridges main and renderer using `contextBridge.exposeInMainWorld()`. Only whitelisted APIs are exposed.

3. **Renderer Process** (`src/renderer/`) — A sandboxed React app that communicates with Kafka exclusively through the preload bridge. No direct access to Node.js APIs.

```
┌─────────────┐     IPC Bridge      ┌──────────────┐     KafkaJS     ┌─────────────┐
│   React UI  │ ◄──────────────────► │ Main Process │ ◄─────────────► │   Kafka     │
│  (Renderer) │   contextBridge     │  (Node.js)   │                │  Brokers    │
└─────────────┘                      └──────────────┘                └─────────────┘
                                           │
                                     electron-store
                                     (encrypted)
```

## 🔧 Supported Connection Types

- **Plaintext** — Direct broker connection without encryption
- **SSL** — TLS-encrypted connections
- **SASL/Plain** — Username/password authentication
- **SASL/SCRAM-SHA-256** — SCRAM authentication
- **SASL/SCRAM-SHA-512** — SCRAM authentication

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Tips

- Run `npm run dev` to start Vite dev server with hot reload for the renderer
- Run `npm run dev:main` in a separate terminal for main process watch mode
- After changing main process code, restart Electron with `npm start`
- Use `npm run build` to verify production builds before submitting PRs

## 📋 Roadmap

- [ ] Consumer group management & monitoring
- [ ] Schema Registry integration (Avro, Protobuf, JSON Schema)
- [ ] Message deserialization plugins
- [ ] Broker & partition metrics dashboard
- [ ] Export/import connection profiles
- [ ] macOS and Linux packaging
- [ ] Custom themes
- [ ] ACL management
- [ ] Multi-language support

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ☕ and ❤️ for the Kafka community
</p>
