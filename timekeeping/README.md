# Timekeeping (MVP)

A mobile-first planning + run-mode timer that feels great on iPhone Safari. The app is built with **React + TypeScript + Vite** and stores data in `localStorage`.

## Run locally

```bash
cd timekeeping
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Open `http://localhost:5173`.

## Build for production

```bash
cd timekeeping
npm install
npm run build
npm run preview -- --host 0.0.0.0 --port 5173
```

The build output lands in `timekeeping/dist`.

## iPhone Safari considerations

- Safe-area insets: padding uses `env(safe-area-inset-*)` for the notch.
- Run mode disables page scrolling and uses large touch targets.
- Timer uses real `Date.now()` deltas, so backgrounding stays accurate.
- Wake Lock API is requested during active runs with graceful fallback.
- PWA: a minimal `manifest.webmanifest` and `sw.js` are included.
