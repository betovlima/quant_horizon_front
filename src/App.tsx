import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createBacktestPayload } from "./lib/backtest";
import { createDailyAnalysisPayload } from "./lib/daily-analysis";
import {
  modelDescription,
  isInvestmentModel,
  INVESTMENT_MODELS,
  modelName,
  type InvestmentModel,
} from "./lib/models";
import {
  actionClass,
  localIsoDate,
  formatDate,
  formatShortDate,
  formatMoney,
  formatClassName,
  formatPercentage,
} from "./lib/presentation";

type QueryMode = "signals" | "analysis" | "backtest";
type PositionStatus = "NO_POSITION" | "LONG";
type DailyAction = "BUY" | "WAIT" | "HOLD" | "SELL" | "WAITING_FOR_DATA";

type Trade = {
  id: number;
  ticker: string;
  trade_type: "BUY" | "SELL";
  acceptance_date: string;
  acceptance_price: number | null;
  created_at: string;
};

type PositionState = {
  ticker: string;
  status: PositionStatus;
  purchase_date: string | null;
  purchase_price: number | null;
  last_trade: Trade | null;
  trades: Trade[];
};

type DailyForecastItem = {
  target_date: string;
  base_close_date: string;
  status: "AVAILABLE" | "WAITING_FOR_CLOSE" | "NO_QUOTE";
  position_before: PositionStatus;
  suggested_action: DailyAction;
  forecast_type?: "UPDATED" | "PRELIMINARY" | null;
  horizon_used?: number | null;
  expected_update_date?: string | null;
  probability_down: number | null;
  probability_neutral: number | null;
  probability_up: number | null;
  threshold: number | null;
  reference_price: number | null;
  description: string;
  registered_acceptance: Trade | null;
};

type DailyForecastResponse = {
  api_version?: string;
  ticker: string;
  model_used: InvestmentModel;
  currency: string;
  market_calendar: string;
  start_date: string;
  end_date: string;
  latest_available_close: string;
  current_position: PositionStatus;
  total_trading_days: number;
  total_available: number;
  total_preliminary?: number;
  total_pending: number;
  forecasts: DailyForecastItem[];
};

type DailyAnalysisItem = {
  reference_date: string;
  base_date: string;
  forecast_type: "HISTORICAL" | "PRELIMINARY";
  result_status: "EVALUATED" | "PENDING";
  horizon_used: number;
  reference_price: number;
  probability_down: number;
  probability_neutral: number;
  probability_up: number;
  threshold: number;
  action: "BUY" | "SELL" | "WAIT";
  predicted_class: number;
  predicted_class_name: string;
  entry_date: string | null;
  entry_price: number | null;
  exit_date: string | null;
  exit_price: number | null;
  observed_return: number | null;
  actual_class: number | null;
  actual_class_name: string | null;
  is_correct: boolean | null;
  training_samples: number;
  description: string;
};

type DailyAnalysisResponse = {
  api_version: string;
  ticker: string;
  model_used: InvestmentModel;
  currency: string;
  market_calendar: string;
  start_date: string;
  end_date: string;
  latest_available_close: string;
  historical_horizon_trading_days: number;
  retraining_frequency_trading_days: number;
  ignored_non_trading_days: number;
  total_trading_days: number;
  total_historical: number;
  total_preliminary: number;
  total_evaluated: number;
  total_pending: number;
  total_correct: number;
  accuracy_rate: number | null;
  total_retrainings: number;
  analyses: DailyAnalysisItem[];
};

type BacktestTrade = {
  signal_date: string;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  probability_down: number;
  probability_neutral: number;
  probability_up: number;
  threshold: number;
  action: string;
  position: number;
  asset_return: number;
  strategy_return: number;
  strategy_capital: number;
  buy_hold_capital: number;
};

type BacktestMetrics = {
  final_strategy_capital: number;
  final_buy_hold_capital: number;
  total_strategy_return: number;
  total_buy_hold_return: number;
  strategy_cagr: number;
  buy_hold_cagr: number;
  approximate_sharpe: number | null;
  approximate_sortino: number | null;
  max_close_drawdown: number;
  exposure_ratio: number;
  executed_trades: number;
  trade_win_rate: number | null;
};

type PeriodBacktestResponse = {
  api_version: string;
  ticker: string;
  model_used: InvestmentModel;
  currency: string;
  start_date: string;
  end_date: string;
  first_signal: string;
  last_exit: string;
  initial_capital: number;
  horizon_trading_days: number;
  position_mode: string;
  metrics: BacktestMetrics;
  total_retrainings: number;
  total_events: number;
  trades: BacktestTrade[];
};

const ENV_API_URL = import.meta.env.VITE_API_URL?.trim();
const DEFAULT_API_URL = ENV_API_URL || "http://127.0.0.1:8000";

function errorMessage(data: unknown, status: number) {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const message = "msg" in item && typeof item.msg === "string" ? item.msg : null;
          const location = "loc" in item && Array.isArray(item.loc)
            ? item.loc.filter((part: unknown) => part !== "body").join(".")
            : "";
          if (location === "model" && message?.toLowerCase().includes("extra")) {
            return "Your local API does not accept model selection. Update to backend 2.0.0 and restart Uvicorn.";
          }
          return message ? `${location ? `${location}: ` : ""}${message}` : null;
        })
        .filter(Boolean);
      if (messages.length > 0) return messages.join(" ");
    }
  }
  return `The API responded with status ${status}.`;
}

function requestHeaders(key: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key.trim()) headers["X-API-Key"] = key.trim();
  return headers;
}

export default function Home() {
  const [ticker, setTicker] = useState("AAPL");
  const [model, setModel] = useState<InvestmentModel>("lightgbm");
  const [queryMode, setQueryMode] = useState<QueryMode>("signals");
  const [startDate, setStartDate] = useState(() => localIsoDate(1));
  const [endDate, setEndDate] = useState(() => localIsoDate(7));
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [apiKey, setApiKey] = useState("");
  const [dailyForecasts, setDailyForecasts] = useState<DailyForecastResponse | null>(null);
  const [dailyAnalysis, setDailyAnalysis] = useState<DailyAnalysisResponse | null>(null);
  const [backtestResult, setBacktestResult] = useState<PeriodBacktestResponse | null>(null);
  const [analysisHorizon, setAnalysisHorizon] = useState("5");
  const [initialCapital, setInitialCapital] = useState("100");
  const [backtestHorizon, setBacktestHorizon] = useState("5");
  const [positionState, setPositionState] = useState<PositionState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [acceptanceInProgress, setAcceptanceInProgress] = useState<string | null>(null);
  const [isResettingAcceptances, setIsResettingAcceptances] = useState(false);
  const [error, setError] = useState("");
  const initialQueryCompleted = useRef(false);
  const hasMultiHorizonForecasts = dailyForecasts?.forecasts.every(
    (item) =>
      typeof item.horizon_used === "number" &&
      (item.forecast_type === "UPDATED" || item.forecast_type === "PRELIMINARY"),
  ) ?? true;
  const displayedModel = dailyForecasts?.model_used
    ?? dailyAnalysis?.model_used
    ?? backtestResult?.model_used
    ?? model;

  const fetchPosition = useCallback(async (
    providedTicker: string,
    providedUrl: string,
    providedKey: string,
  ) => {
    const baseUrl = providedUrl.trim().replace(/\/$/, "");
    const normalizedTicker = providedTicker.trim().toUpperCase();
    const response = await fetch(`${baseUrl}/v1/positions/${encodeURIComponent(normalizedTicker)}`, {
      headers: requestHeaders(providedKey),
    });
    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) throw new Error(errorMessage(data, response.status));
    const state = data as PositionState;
    setPositionState(state);
    return state;
  }, []);

  const fetchDailyForecasts = useCallback(async (
    providedTicker: string,
    start: string,
    end: string,
    providedUrl: string,
    providedKey: string,
    providedModel: InvestmentModel,
  ) => {
    const normalizedTicker = providedTicker.trim().toUpperCase();
    const baseUrl = providedUrl.trim().replace(/\/$/, "");
    if (!normalizedTicker || !start || !end) throw new Error("Enter a ticker and date range.");
    if (!/^https?:\/\//i.test(baseUrl)) throw new Error("The API address must start with http:// or https://.");

    setIsLoading(true);
    setError("");
    setDailyForecasts(null);
    setDailyAnalysis(null);
    setBacktestResult(null);
    setTicker(normalizedTicker);
    window.localStorage.setItem("quant-horizon-api-url", baseUrl);
    window.localStorage.setItem("quant-horizon-model", providedModel);

    try {
      const response = await fetch(`${baseUrl}/v1/forecasts/daily`, {
        method: "POST",
        headers: requestHeaders(providedKey),
        body: JSON.stringify({
          ticker: normalizedTicker,
          model: providedModel,
          start_date: start,
          end_date: end,
        }),
      });
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(errorMessage(data, response.status));
      setDailyForecasts(data as DailyForecastResponse);
      await fetchPosition(normalizedTicker, baseUrl, providedKey);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to generate daily signals.");
    } finally {
      setIsLoading(false);
    }
  }, [fetchPosition]);

  useEffect(() => {
    if (initialQueryCompleted.current) return;
    initialQueryCompleted.current = true;
    const savedUrl = ENV_API_URL
      || window.localStorage.getItem("quant-horizon-api-url")
      || DEFAULT_API_URL;
    const savedModel = window.localStorage.getItem("quant-horizon-model");
    const initialModel = isInvestmentModel(savedModel) ? savedModel : "lightgbm";
    setApiUrl(savedUrl);
    setModel(initialModel);
    void fetchDailyForecasts("AAPL", startDate, endDate, savedUrl, "", initialModel);
  }, [fetchDailyForecasts, endDate, startDate]);

  async function submitQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (queryMode === "signals") {
      await fetchDailyForecasts(ticker, startDate, endDate, apiUrl, apiKey, model);
      return;
    }

    const normalizedTicker = ticker.trim().toUpperCase();
    const baseUrl = apiUrl.trim().replace(/\/$/, "");
    if (!normalizedTicker || !startDate || !endDate) {
      setError("Enter a ticker and date range.");
      return;
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      setError("The API address must start with http:// or https://.");
      return;
    }

    if (queryMode === "analysis") {
      if (!Number.isInteger(Number(analysisHorizon)) || Number(analysisHorizon) < 1) {
        setError("The horizon must be a whole number of trading sessions.");
        return;
      }
      setIsLoading(true);
      setError("");
      setDailyForecasts(null);
      setDailyAnalysis(null);
      setBacktestResult(null);
      window.localStorage.setItem("quant-horizon-api-url", baseUrl);
      window.localStorage.setItem("quant-horizon-model", model);
      try {
        const response = await fetch(`${baseUrl}/v1/analyses/daily`, {
          method: "POST",
          headers: requestHeaders(apiKey),
          body: JSON.stringify(createDailyAnalysisPayload(
            normalizedTicker,
            model,
            startDate,
            endDate,
            analysisHorizon,
          )),
        });
        const data = (await response.json().catch(() => null)) as unknown;
        if (response.status === 404) {
          throw new Error("Your local API does not provide session-by-session analysis. Update to backend 2.0.0 and restart Uvicorn.");
        }
        if (!response.ok) throw new Error(errorMessage(data, response.status));
        setDailyAnalysis(data as DailyAnalysisResponse);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Unable to run the daily analysis.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!Number.isFinite(Number(initialCapital)) || Number(initialCapital) <= 0) {
      setError("Enter an initial capital greater than zero.");
      return;
    }
    if (!Number.isInteger(Number(backtestHorizon)) || Number(backtestHorizon) < 1) {
      setError("The horizon must be a whole number of trading sessions.");
      return;
    }

    setIsLoading(true);
    setError("");
    setDailyForecasts(null);
    setDailyAnalysis(null);
    setBacktestResult(null);
    window.localStorage.setItem("quant-horizon-api-url", baseUrl);
    window.localStorage.setItem("quant-horizon-model", model);
    try {
      const response = await fetch(`${baseUrl}/v1/backtests/period`, {
        method: "POST",
        headers: requestHeaders(apiKey),
        body: JSON.stringify(createBacktestPayload(
          normalizedTicker,
          startDate,
          endDate,
          initialCapital,
          backtestHorizon,
          model,
        )),
      });
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(errorMessage(data, response.status));
      setBacktestResult(data as PeriodBacktestResponse);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to run the backtest.");
    } finally {
      setIsLoading(false);
    }
  }

  async function registerAcceptance(item: DailyForecastItem) {
    const normalizedTicker = ticker.trim().toUpperCase();
    const baseUrl = apiUrl.trim().replace(/\/$/, "");
    const tradeType = item.position_before === "LONG" ? "SELL" : "BUY";
    setAcceptanceInProgress(item.target_date);
    setError("");
    try {
      const response = await fetch(
        `${baseUrl}/v1/positions/${encodeURIComponent(normalizedTicker)}/acceptances`,
        {
          method: "POST",
          headers: requestHeaders(apiKey),
          body: JSON.stringify({
            trade_type: tradeType,
            acceptance_date: item.target_date,
            acceptance_price: item.reference_price,
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(errorMessage(data, response.status));
      setPositionState(data as PositionState);
      await fetchDailyForecasts(normalizedTicker, startDate, endDate, baseUrl, apiKey, model);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to record the acceptance.");
    } finally {
      setAcceptanceInProgress(null);
    }
  }

  async function resetAcceptances() {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!window.confirm(`Delete all simulated buys and sells for ${normalizedTicker}?`)) return;

    const baseUrl = apiUrl.trim().replace(/\/$/, "");
    setIsResettingAcceptances(true);
    setError("");
    try {
      const response = await fetch(
        `${baseUrl}/v1/positions/${encodeURIComponent(normalizedTicker)}/acceptances`,
        { method: "DELETE", headers: requestHeaders(apiKey) },
      );
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(errorMessage(data, response.status));
      setPositionState(data as PositionState);
      await fetchDailyForecasts(normalizedTicker, startDate, endDate, baseUrl, apiKey, model);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to reset acceptances.");
    } finally {
      setIsResettingAcceptances(false);
    }
  }

  function changeMode(newMode: QueryMode) {
    setQueryMode(newMode);
    setDailyForecasts(null);
    setDailyAnalysis(null);
    setBacktestResult(null);
    setError("");
    if (newMode === "backtest") {
      setStartDate(localIsoDate(-365));
      setEndDate(localIsoDate(0));
    } else if (newMode === "analysis") {
      setStartDate(localIsoDate(-14));
      setEndDate(localIsoDate(7));
    } else {
      setStartDate(localIsoDate(1));
      setEndDate(localIsoDate(7));
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true" />
        <span className="brand">QUANT HORIZON</span>
        <span className="topbar-title">Market forecasts and backtests</span>
        <span className="read-only">No orders are sent</span>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div>
            <p className="eyebrow">Asset research</p>
            <h1>{queryMode === "signals"
              ? "Plan each session"
              : queryMode === "analysis"
                ? "Review day by day"
                : "Measure the strategy"}</h1>
            <p className="sidebar-copy">
              {queryMode === "signals"
                ? "One forecast per day, always based on the previous close."
                : queryMode === "analysis"
                  ? "Compare the past and project the future without skipping sessions."
                  : "Simulate capital and trades without using future information."}
            </p>
          </div>

          <form onSubmit={submitQuery} className="form">
            <label>What do you want to analyze?</label>
            <div className="mode-selector" role="group" aria-label="Analysis type">
              <button
                type="button"
                className={queryMode === "signals" ? "mode-option active" : "mode-option"}
                aria-pressed={queryMode === "signals"}
                onClick={() => changeMode("signals")}
              >
                Upcoming signals
              </button>
              <button
                type="button"
                className={queryMode === "analysis" ? "mode-option active" : "mode-option"}
                aria-pressed={queryMode === "analysis"}
                onClick={() => changeMode("analysis")}
              >
                Session analysis
              </button>
              <button
                type="button"
                className={queryMode === "backtest" ? "mode-option active" : "mode-option"}
                aria-pressed={queryMode === "backtest"}
                onClick={() => changeMode("backtest")}
              >
                Financial backtest
              </button>
            </div>

            <label htmlFor="ticker">Asset (ticker)</label>
            <div className="ticker-field">
              <span aria-hidden="true">⌕</span>
              <input id="ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" autoComplete="off" />
            </div>

            <div className="model-field">
              <label htmlFor="model">Analysis model</label>
              <select
                id="model"
                value={model}
                onChange={(event) => setModel(event.target.value as InvestmentModel)}
              >
                {INVESTMENT_MODELS.map((option) => (
                  <option value={option.value} key={option.value}>{option.name}</option>
                ))}
              </select>
              <p className="model-help">{modelDescription(model)}</p>
            </div>

            <div className="period-grid">
              <div className="field-group">
                <label htmlFor="start-date">Start date</label>
                <input id="start-date" type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="field-group">
                <label htmlFor="end-date">End date</label>
                <input id="end-date" type="date" value={endDate} min={startDate} max={queryMode === "backtest" ? localIsoDate(0) : undefined} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            {queryMode === "analysis" && (
              <div className="analysis-parameters">
                <div className="field-group">
                  <label htmlFor="analysis-horizon">Result after how many sessions?</label>
                  <input id="analysis-horizon" type="number" min="1" max="60" step="1" value={analysisHorizon} onChange={(e) => setAnalysisHorizon(e.target.value)} />
                </div>
              </div>
            )}
            {queryMode === "backtest" && (
              <div className="period-grid backtest-parameters">
                <div className="field-group">
                  <label htmlFor="initial-capital">Initial capital</label>
                  <input id="initial-capital" type="number" min="1" step="0.01" value={initialCapital} onChange={(e) => setInitialCapital(e.target.value)} />
                </div>
                <div className="field-group">
                  <label htmlFor="backtest-horizon">Horizon (trading sessions)</label>
                  <input id="backtest-horizon" type="number" min="1" max="60" step="1" value={backtestHorizon} onChange={(e) => setBacktestHorizon(e.target.value)} />
                </div>
              </div>
            )}
            <p className="field-help period-help">
              {queryMode === "signals"
                ? "Future sessions receive preliminary forecasts and are recalculated after each new close."
                : queryMode === "analysis"
                  ? "The past shows one signal per session. The future uses the latest available close and remains pending."
                  : "The model is retrained periodically and reinvests all capital after each non-overlapping trade."}
            </p>

            <details className="connection">
              <summary>API connection</summary>
              <div className="connection-fields">
                <label htmlFor="api-url">API address</label>
                <input id="api-url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} inputMode="url" />
                <label htmlFor="api-key">API key (optional)</label>
                <input id="api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" autoComplete="off" />
              </div>
            </details>

            <button type="submit" disabled={isLoading}>
              {isLoading
                ? <><span className="spinner" aria-hidden="true" />Analyzing…</>
                : <>{queryMode === "signals"
                  ? "Generate upcoming signals"
                  : queryMode === "analysis"
                    ? "Analyze every session"
                    : "Run backtest"} <span aria-hidden="true">→</span></>}
            </button>
          </form>

          <p className="disclaimer">Acceptances are simulated records. No order is sent to a broker.</p>
        </aside>

        <section className="content" aria-live="polite">
          <div className="content-heading">
            <div>
              <p className="eyebrow">{modelName(displayedModel)} model · no future training data</p>
              <h2>{queryMode === "backtest"
                ? "Backtest results"
                : queryMode === "analysis"
                  ? "Daily range analysis"
                  : "Daily signal schedule"}</h2>
            </div>
            {(dailyForecasts || dailyAnalysis || backtestResult) && (
              <div className="heading-chips">
                <span className="model-chip">{modelName(displayedModel)}</span>
                <span className="ticker-chip">{(dailyForecasts || dailyAnalysis || backtestResult)?.ticker}</span>
              </div>
            )}
          </div>

          {error && <div className="error-card" role="alert"><span>!</span><div><strong>Unable to complete</strong><p>{error}</p></div></div>}

          {isLoading && <div className="empty-state loading-state"><div className="pulse" /><h3>Calculating signals</h3><p>The model uses only the information known at each close.</p></div>}

          {!isLoading && queryMode === "signals" && positionState && (
            <section className="position-card">
              <div className="position-copy">
                <span>Simulated position</span>
                <strong className={positionState.status === "LONG" ? "position-open" : "position-flat"}>
                  {positionState.status === "LONG" ? "LONG" : "NO POSITION"}
                </strong>
                <small>
                  {positionState.status === "LONG" && positionState.purchase_date
                    ? `Acceptance recorded on ${formatDate(positionState.purchase_date)}${positionState.purchase_price !== null ? ` · ${formatMoney(positionState.purchase_price, dailyForecasts?.currency ?? "")}` : ""}`
                    : "Record an acceptance only after you decide to act on a signal."}
                </small>
              </div>
              <div className="position-guidance">
                <strong>How to record it</strong>
                <span>Use the button inside the selected session card. Its date and reference price are applied automatically.</span>
                {positionState.trades.length > 0 && (
                  <button
                    type="button"
                    className="reset-operations-button"
                    onClick={() => void resetAcceptances()}
                    disabled={isResettingAcceptances || acceptanceInProgress !== null}
                  >
                    {isResettingAcceptances ? "Resetting…" : "Reset buys and sells"}
                  </button>
                )}
              </div>
            </section>
          )}

          {!isLoading && dailyForecasts && (
            <section className="daily-results">
              {!hasMultiHorizonForecasts && (
                <div className="compatibility-alert" role="alert">
                  <strong>Outdated local API</strong>
                  <span>
                    The response does not contain multi-horizon forecasts. Update
                    <code>api.py</code> to backend 2.0.0 and restart Uvicorn.
                  </span>
                </div>
              )}
              <div className="agenda-summary">
                <div><span>Sessions in range</span><strong>{dailyForecasts.total_trading_days}</strong></div>
                <div><span>Available signals</span><strong>{dailyForecasts.total_available}</strong></div>
                <div><span>Preliminary forecasts</span><strong>{dailyForecasts.total_preliminary ?? "—"}</strong></div>
                <div><span>API / calendar</span><strong>{dailyForecasts.api_version ? `v${dailyForecasts.api_version} · ` : ""}{dailyForecasts.market_calendar}</strong></div>
              </div>

              <nav className="interval-strip" aria-label="Forecast sessions in range">
                <div>
                  <span>Range forecasts</span>
                  <strong>{dailyForecasts.forecasts.length} {dailyForecasts.forecasts.length === 1 ? "session" : "sessions"}</strong>
                </div>
                <div className="interval-days">
                  {dailyForecasts.forecasts.map((item) => (
                    <a href={`#session-${item.target_date}`} className={actionClass(item.suggested_action)} key={item.target_date}>
                      <span>{formatShortDate(item.target_date)}</span>
                      <strong>{item.suggested_action.replaceAll("_", " ")}</strong>
                    </a>
                  ))}
                </div>
              </nav>

              <div className="daily-list">
                {dailyForecasts.forecasts.map((item) => (
                  <article id={`session-${item.target_date}`} className={`daily-card ${item.status.toLowerCase()}`} key={item.target_date}>
                    <header>
                      <div><span>Analyzed session</span><h3>{formatDate(item.target_date)}</h3></div>
                      <div className="daily-badges">
                        {item.forecast_type && <span className={`projection-badge ${item.forecast_type.toLowerCase()}`}>{item.forecast_type}</span>}
                        <span className={`daily-action ${actionClass(item.suggested_action)}`}>{item.suggested_action.replaceAll("_", " ")}</span>
                      </div>
                    </header>
                    <div className="daily-meta">
                      <div>
                        <span>Analysis basis</span>
                        <strong>Close on {formatDate(item.base_close_date)}</strong>
                        {typeof item.horizon_used === "number" && <small>{item.horizon_used}-{item.horizon_used === 1 ? "session" : "session"} projection</small>}
                      </div>
                      <div><span>Position before signal</span><strong>{item.position_before === "LONG" ? "Long" : "No position"}</strong></div>
                      <div><span>Reference price</span><strong>{item.reference_price !== null ? formatMoney(item.reference_price, dailyForecasts.currency) : "Pending"}</strong></div>
                    </div>
                    {item.status === "AVAILABLE" && item.probability_down !== null && item.probability_neutral !== null && item.probability_up !== null && (
                      <div className="daily-probabilities">
                        <span>Down <strong>{formatPercentage(item.probability_down)}</strong></span>
                        <span>Neutral <strong>{formatPercentage(item.probability_neutral)}</strong></span>
                        <span>Up <strong>{formatPercentage(item.probability_up)}</strong></span>
                        <span>Threshold <strong>{item.threshold !== null ? formatPercentage(item.threshold) : "—"}</strong></span>
                      </div>
                    )}
                    <p className="daily-description">{item.description}</p>
                    {item.registered_acceptance && <p className="daily-accepted">Recorded acceptance: {item.registered_acceptance.trade_type} on {formatDate(item.registered_acceptance.acceptance_date)}.</p>}
                    {!item.registered_acceptance && item.status === "AVAILABLE" && (
                      <div className="daily-card-actions">
                        <span>
                          {formatDate(item.target_date)} and its reference price will be saved to the local database.
                        </span>
                        <button
                          type="button"
                          className={item.position_before === "LONG" ? "accept-button sell" : "accept-button buy"}
                          onClick={() => void registerAcceptance(item)}
                          disabled={acceptanceInProgress !== null}
                        >
                          {acceptanceInProgress === item.target_date
                            ? "Saving…"
                            : item.position_before === "LONG"
                              ? "I accepted the sell on this date"
                              : "I accepted the buy on this date"}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {!isLoading && dailyAnalysis && (
            <section className="analysis-results">
              <div className="analysis-summary">
                <div><span>Analyzed sessions</span><strong>{dailyAnalysis.total_trading_days}</strong></div>
                <div><span>Evaluated results</span><strong>{dailyAnalysis.total_evaluated}</strong></div>
                <div><span>Future forecasts</span><strong>{dailyAnalysis.total_preliminary}</strong></div>
                <div><span>Accuracy rate</span><strong>{dailyAnalysis.accuracy_rate === null ? "Pending" : formatPercentage(dailyAnalysis.accuracy_rate)}</strong></div>
              </div>
              <div className="market-days-note">
                <strong>{dailyAnalysis.market_calendar}</strong>
                <span>
                  {dailyAnalysis.ignored_non_trading_days} non-trading days were removed. Each valid session in the range has a card.
                </span>
              </div>
              <p className="analysis-period-note">
                Latest close: {formatDate(dailyAnalysis.latest_available_close)} · historical outcomes after {dailyAnalysis.historical_horizon_trading_days} sessions · retraining every {dailyAnalysis.retraining_frequency_trading_days} sessions · API v{dailyAnalysis.api_version}.
              </p>
              <div className="analysis-list">
                {dailyAnalysis.analyses.map((item) => {
                  const resultState = item.is_correct === true ? "correct" : item.is_correct === false ? "error" : "pending";
                  const resultLabel = item.is_correct === true ? "CORRECT" : item.is_correct === false ? "DIVERGENCE" : "PENDING";
                  return (
                    <article className={`analysis-card ${item.forecast_type.toLowerCase()}`} key={`${item.reference_date}-${item.forecast_type}`}>
                      <header>
                        <div>
                          <span>{item.forecast_type === "HISTORICAL" ? "Replayed close" : "Projected session"}</span>
                          <h3>{formatDate(item.reference_date)}</h3>
                        </div>
                        <div className="analysis-badges">
                          <span className={`projection-badge ${item.forecast_type.toLowerCase()}`}>{item.forecast_type}</span>
                          <span className={`daily-action ${actionClass(item.action)}`}>{item.action}</span>
                          <span className={`result-badge ${resultState}`}>{resultLabel}</span>
                        </div>
                      </header>
                      <div className="analysis-meta">
                        <div><span>Analysis basis</span><strong>{formatDate(item.base_date)}</strong><small>{item.forecast_type === "PRELIMINARY" ? "Latest known close" : "Data available on that date"}</small></div>
                        <div><span>Reference price</span><strong>{formatMoney(item.reference_price, dailyAnalysis.currency)}</strong></div>
                        <div><span>Horizon used</span><strong>{item.horizon_used} {item.horizon_used === 1 ? "session" : "sessions"}</strong><small>{item.training_samples} training samples</small></div>
                      </div>
                      <div className="daily-probabilities">
                        <span>Down <strong>{formatPercentage(item.probability_down)}</strong></span>
                        <span>Neutral <strong>{formatPercentage(item.probability_neutral)}</strong></span>
                        <span>Up <strong>{formatPercentage(item.probability_up)}</strong></span>
                        <span>Threshold <strong>{formatPercentage(item.threshold)}</strong></span>
                      </div>
                      <div className="analysis-outcome">
                        <div><span>Predicted class</span><strong>{formatClassName(item.predicted_class_name)}</strong></div>
                        <div><span>Observed result</span><strong>{formatClassName(item.actual_class_name)}</strong></div>
                        <div>
                          <span>Entry → exit</span>
                          <strong>{item.entry_date ? formatDate(item.entry_date) : "Pending"} → {item.exit_date ? formatDate(item.exit_date) : "Pending"}</strong>
                          <small>{item.entry_price !== null ? formatMoney(item.entry_price, dailyAnalysis.currency) : "Pending price"} → {item.exit_price !== null ? formatMoney(item.exit_price, dailyAnalysis.currency) : "Pending price"}</small>
                        </div>
                        <div><span>Observed return</span><strong>{item.observed_return === null ? "Pending" : formatPercentage(item.observed_return)}</strong></div>
                      </div>
                      <p className="analysis-description">{item.description}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {!isLoading && backtestResult && (
            <section className="history-results">
              <div className="history-summary">
                <div><span>Final strategy capital</span><strong>{formatMoney(backtestResult.metrics.final_strategy_capital, backtestResult.currency)}</strong></div>
                <div><span>Final buy-and-hold capital</span><strong>{formatMoney(backtestResult.metrics.final_buy_hold_capital, backtestResult.currency)}</strong></div>
                <div><span>Strategy return</span><strong>{formatPercentage(backtestResult.metrics.total_strategy_return)}</strong></div>
                <div><span>Buy-and-hold return</span><strong>{formatPercentage(backtestResult.metrics.total_buy_hold_return)}</strong></div>
              </div>
              <div className="backtest-risk-grid">
                <div><span>CAGR</span><strong>{formatPercentage(backtestResult.metrics.strategy_cagr)}</strong></div>
                <div><span>Approximate Sharpe</span><strong>{backtestResult.metrics.approximate_sharpe === null ? "—" : backtestResult.metrics.approximate_sharpe.toFixed(3)}</strong></div>
                <div><span>Approximate Sortino</span><strong>{backtestResult.metrics.approximate_sortino === null ? "—" : backtestResult.metrics.approximate_sortino.toFixed(3)}</strong></div>
                <div><span>Maximum drawdown</span><strong>{formatPercentage(backtestResult.metrics.max_close_drawdown)}</strong></div>
                <div><span>Exposure</span><strong>{formatPercentage(backtestResult.metrics.exposure_ratio)}</strong></div>
                <div><span>Executed trades</span><strong>{backtestResult.metrics.executed_trades}</strong></div>
                <div><span>Win rate</span><strong>{backtestResult.metrics.trade_win_rate === null ? "—" : formatPercentage(backtestResult.metrics.trade_win_rate)}</strong></div>
                <div><span>Retrainings</span><strong>{backtestResult.total_retrainings}</strong></div>
              </div>
              <p className="backtest-period-note">
                Model used: {modelName(backtestResult.model_used)} · requested period: {formatDate(backtestResult.start_date)} to {formatDate(backtestResult.end_date)} · first signal on {formatDate(backtestResult.first_signal)} · last exit on {formatDate(backtestResult.last_exit)} · {backtestResult.horizon_trading_days}-session horizon.
              </p>
              <div className="history-list">
                {backtestResult.trades.map((item, index) => {
                  const actionLabel = item.action === "BUY" ? "BUY" : item.action === "SELL_SHORT" ? "SELL / SHORT" : "STAY OUT";
                  const resultState = item.strategy_return > 0 ? "correct" : item.strategy_return < 0 ? "error" : "pending";
                  return <article className="history-card" key={`${item.signal_date}-${index}`}>
                    <header><div><span>Analyzed close</span><h3>{formatDate(item.signal_date)}</h3></div><div className="history-badges"><span className={`daily-action ${actionClass(item.action)}`}>{actionLabel}</span><span className={`result-badge ${resultState}`}>{formatPercentage(item.strategy_return)}</span></div></header>
                    <div className="history-comparison"><div><span>Entry</span><strong>{formatMoney(item.entry_price, backtestResult.currency)}</strong><small>{formatDate(item.entry_date)}</small></div><div><span>Exit</span><strong>{formatMoney(item.exit_price, backtestResult.currency)}</strong><small>{formatDate(item.exit_date)}</small></div></div>
                    <div className="history-probabilities"><span>Down <strong>{formatPercentage(item.probability_down)}</strong></span><span>Neutral <strong>{formatPercentage(item.probability_neutral)}</strong></span><span>Up <strong>{formatPercentage(item.probability_up)}</strong></span></div>
                    <div className="backtest-operation-result"><div><span>Asset return</span><strong>{formatPercentage(item.asset_return)}</strong></div><div><span>Strategy capital</span><strong>{formatMoney(item.strategy_capital, backtestResult.currency)}</strong></div><div><span>Buy-and-hold capital</span><strong>{formatMoney(item.buy_hold_capital, backtestResult.currency)}</strong></div></div>
                  </article>;
                })}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
