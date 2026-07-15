# Quant Horizon Front

Independent React + Vite frontend for the Quant Horizon API. The application displays upcoming market signals, session-by-session analyses, quantitative backtests, and simulated buy/sell acceptances. It does not send brokerage orders.

## Project structure

```text
quant_horizon_front/
├── public/
├── src/
│   ├── lib/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── vite-env.d.ts
├── .gitignore
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
npm install
```

## Environment configuration

The frontend reads the API address from:

```text
VITE_API_URL
```

For local development, create a `.env` file in the project root:

```env
VITE_API_URL=http://127.0.0.1:8000
```

The `.env` file is ignored by Git and is not required on Railway.

For Railway, add this variable in the frontend service settings:

```env
VITE_API_URL=https://quanthorizon-production.up.railway.app
```

Vite injects variables prefixed with `VITE_` during the build. Redeploy the frontend after changing the API address.

## Run locally

```bash
npm run dev
```

The application is normally available at:

```text
http://localhost:5173
```

## Type checking

```bash
npm run typecheck
```

## Production build

```bash
npm run build
```

The build command first validates the TypeScript code and then writes the production application to `dist/`.

To preview the production build locally:

```bash
npm run preview
```

## Railway deployment

Create a Railway project connected to the `quant_horizon_front` GitHub repository.

Use these commands if Railway does not detect them automatically:

```text
Build Command: npm run build
Start Command: npm run start
```

Add this Railway variable to the frontend project:

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
