# Quant Horizon Front

Independent React + Vite frontend for the Quant Horizon API. The application displays upcoming market signals, session-by-session analyses, quantitative backtests, and simulated buy/sell acceptances. It does not send brokerage orders.

## Features

- English and Brazilian Portuguese interface
- Automatic browser-language detection
- Manual `EN` / `PT` language selector
- Language preference persisted in `localStorage`
- Locale-aware dates, percentages, and currencies
- Upcoming forecasts, daily analyses, and financial backtests
- Simulated buy and sell acceptances
- Docker and Caddy configuration for Railway

## Project structure

```text
quant_horizon_front/
├── public/
├── src/
│   ├── components/
│   │   └── LanguageSwitcher.tsx
│   ├── i18n/
│   │   └── index.ts
│   ├── lib/
│   ├── locales/
│   │   ├── en/
│   │   │   └── translation.json
│   │   └── pt-BR/
│   │       └── translation.json
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── vite-env.d.ts
├── .dockerignore
├── .gitignore
├── .npmrc
├── Caddyfile
├── Dockerfile
├── index.html
├── package-lock.json
├── package.json
├── tsconfig.json
├── vite.config.js
└── README.md
```

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- Quant Horizon API 2.0.0

## Install

```bash
npm ci
```

## Environment configuration

The frontend reads the public API base address from:

```text
VITE_API_URL
```

For local development, create a local `.env` file:

```env
VITE_API_URL=http://127.0.0.1:8000
```

The `.env` file is ignored by Git. On Railway, configure the variable in the frontend service instead:

```env
VITE_API_URL=https://quanthorizon-production.up.railway.app
```

Vite injects `VITE_*` variables during the build. Redeploy the frontend after changing this value.

## Run locally

```bash
npm run dev
```

The application is normally available at:

```text
http://localhost:5173
```

## Validation and production build

```bash
npm run typecheck
npm run build
```

The production files are written to `dist/`.

To preview the build locally:

```bash
npm run preview
```

## Internationalization

Translation resources are stored in:

```text
src/locales/en/translation.json
src/locales/pt-BR/translation.json
```

The application uses `i18next`, `react-i18next`, and `i18next-browser-languagedetector`. The selected language is stored under:

```text
quant-horizon-language
```

in the browser's `localStorage`.

Texts returned directly by the backend, such as forecast descriptions and validation details, remain in the language produced by the API. For fully localized backend descriptions, the API should return stable message codes and parameters instead of complete sentences.

## Railway deployment

The repository includes a multi-stage `Dockerfile`:

1. Node.js builds the Vite application.
2. Caddy serves the generated static files.

Railway settings:

```text
Root Directory: /
Dockerfile Path: /Dockerfile
Build Command: empty
Start Command: empty
Healthcheck Path: /health
Public Domain Target Port: 8080
```

Required Railway variable:

```env
VITE_API_URL=https://quanthorizon-production.up.railway.app
```

## API endpoints

The frontend consumes:

- `POST /v1/forecasts/daily`
- `POST /v1/analyses/daily`
- `POST /v1/backtests/period`
- `GET /v1/positions/{ticker}`
- `POST /v1/positions/{ticker}/acceptances`
- `DELETE /v1/positions/{ticker}/acceptances`
