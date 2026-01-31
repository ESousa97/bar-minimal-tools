# Bar Minimal Tools

Minimalist Windows taskbar with real-time hardware monitoring, built with **Tauri + React + TypeScript + Rust**.

[![CI](https://img.shields.io/github/actions/workflow/status/ESousa97/bar-minimal-tools/ci.yml?style=flat)](https://github.com/ESousa97/bar-minimal-tools/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/ESousa97/bar-minimal-tools/security.yml?style=flat)](https://github.com/ESousa97/bar-minimal-tools/actions/workflows/security.yml)
[![CodeFactor](https://www.codefactor.io/repository/github/esousa97/bar-minimal-tools/badge?style=flat)](https://www.codefactor.io/repository/github/esousa97/bar-minimal-tools)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)

---

## ✨ Features

- **Real-time hardware monitoring** (CPU, RAM, GPU, Storage, Network)
- **Media controls** and **audio device management**
- **Weather**, **notes**, **clock**, and **headset status** widgets
- Native desktop performance with **Tauri**
- Fully configurable widget layout and theme

---

## 🧱 Architecture Overview

- **Frontend (React + Vite):** UI rendering, widget composition, user interactions
- **Backend (Rust + Tauri):** system data collection, OS integration, native APIs

See full details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🚀 Getting Started

### Requirements

- **Node.js 20+**
- **Rust (stable)**
- **Windows 10/11** for full Tauri execution

### Install

```bash
npm install
```

### Run (Frontend Only)

```bash
npm run dev
```

### Run Full App (Tauri)

```bash
npm run tauri dev
```

---

## 🧪 Testing & Quality

```bash
# Unit tests
npm test

# Coverage
npm run test:coverage

# Lint
npm run lint

# Type check
npm run type-check
```

---

## 📦 Build

```bash
# Frontend build
npm run build

# Full Tauri build
npm run tauri build
```

---

## 🛡️ Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

---

## 🗺️ Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

---

## 📄 License

MIT License. See [LICENSE](LICENSE).
