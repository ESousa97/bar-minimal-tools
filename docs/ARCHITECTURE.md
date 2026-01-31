# Architecture

## Overview

Bar Minimal Tools is a **desktop application** built with:

- **Frontend:** React + TypeScript + Vite
- **Backend:** Rust + Tauri

The frontend renders the taskbar UI and widgets. The backend provides native system data and OS integration, exposing it via Tauri commands.

---

## Frontend Structure

```
src/
├── App.tsx            # Application root
├── components/        # Widgets, popups, and UI structure
├── styles/            # Design tokens + base styles
├── utils/             # Shared logic and helpers
└── types/             # Shared data contracts
```

### Key Concepts

- **Widget definitions** live in `src/utils/widgets.ts`
- **Default config** is centralized in `src/config/defaultConfig.ts`
- **Design tokens** are centralized in `src/styles/tokens.css`

---

## Backend Structure (Rust)

```
src-tauri/
├── src/main.rs        # Tauri app entry
├── src/lib.rs         # App wiring and state
├── commands/          # Tauri commands (frontend invokes)
└── services/          # System and OS integrations
```

### Key Services

- `services/cpu.rs`, `ram.rs`, `gpu.rs`, `storage.rs`
- `services/audio.rs`, `media.rs`, `network.rs`
- `services/windows.rs` for Win32 API integration

---

## Data Flow

1. React UI requests data using `invoke()` from `@tauri-apps/api`.
2. Tauri commands call Rust services for system data.
3. Results are serialized and returned to the frontend.
4. UI widgets render data and update at configured intervals.

---

## Design System

- Tokens in `src/styles/tokens.css`
- Base styles in `src/styles/base.css`
- Component styles centralized via CSS imports

---

## Security

- `npm audit` and `cargo audit` are enforced in CI
- Security policy in [SECURITY.md](../SECURITY.md)
