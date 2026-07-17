import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { createBacktestPayload } from "./lib/backtest";
import { createDailyAnalysisPayload } from "./lib/daily-analysis";
import { API_BASE_URL, JSON_HEADERS, apiErrorMessage } from "./lib/api";
import {
  isInvestmentModel,
  INVESTMENT_MODELS,
  modelName,
  type InvestmentModel,
} from "./lib/models";
import {
  actionClass,
  futureWeekdayIsoDate,
  localIsoDate,
  formatDate,
  formatShortDate,
  formatMoney,
  formatPercentage,
  languageToLocale,
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



export default function Home() {
  const { t, i18n } = useTranslation();
  const locale = languageToLocale(i18n.resolvedLanguage ?? i18n.language);
  const translatedModelName = (value: InvestmentModel) => t(`models.names.${value}`, {
    defaultValue: modelName(value),
  });
  const translatedAction = (value: string) => t(`actions.labels.${value.toLowerCase()}`, {
    defaultValue: value.replaceAll("_", " "),
  });
  const translatedProjectionType = (value: string) => t(`projectionTypes.${value.toLowerCase()}`, {
    defaultValue: value,
  });
  const translatedClassName = (value: string | null) => {
    if (!value) return t("common.pending");
    return t(`classes.${value.toLowerCase()}`, {
      defaultValue: value.charAt(0).toUpperCase() + value.slice(1),
    });
  };

  const [ticker, setTicker] = useState("AAPL");
  const [model, setModel] = useState<InvestmentModel>("lightgbm");
  const [queryMode, setQueryMode] = useState<QueryMode>("signals");
  const [startDate, setStartDate] = useState(() => futureWeekdayIsoDate(1));
  const [endDate, setEndDate] = useState(() => futureWeekdayIsoDate(5));
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
  ) => {
    const normalizedTicker = providedTicker.trim().toUpperCase();
    const response = await fetch(`${API_BASE_URL}/v1/positions/${encodeURIComponent(normalizedTicker)}`, {
      headers: JSON_HEADERS,
    });
    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) throw new Error(apiErrorMessage(data, response.status, t));
    const state = data as PositionState;
    setPositionState(state);
    return state;
  }, [t]);

  const fetchDailyForecasts = useCallback(async (
    providedTicker: string,
    start: string,
    end: string,
    providedModel: InvestmentModel,
  ) => {
    const normalizedTicker = providedTicker.trim().toUpperCase();
    if (!normalizedTicker || !start || !end) throw new Error(t("errors.tickerAndDates"));

    setIsLoading(true);
    setError("");
    setDailyForecasts(null);
    setDailyAnalysis(null);
    setBacktestResult(null);
    setTicker(normalizedTicker);
    window.localStorage.setItem("quant-horizon-model", providedModel);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/forecasts/daily`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ticker: normalizedTicker,
          model: providedModel,
          start_date: start,
          end_date: end,
        }),
      });
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(apiErrorMessage(data, response.status, t));
      setDailyForecasts(data as DailyForecastResponse);
      await fetchPosition(normalizedTicker);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors.dailySignals"));
    } finally {
      setIsLoading(false);
    }
  }, [fetchPosition, t]);

  useEffect(() => {
    if (initialQueryCompleted.current) return;
    initialQueryCompleted.current = true;
    window.localStorage.removeItem("quant-horizon-api-url");
    const savedModel = window.localStorage.getItem("quant-horizon-model");
    const initialModel = isInvestmentModel(savedModel) ? savedModel : "lightgbm";
    setModel(initialModel);
    void fetchDailyForecasts("AAPL", startDate, endDate, initialModel);
  }, [fetchDailyForecasts, endDate, startDate]);

  async function submitQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (queryMode === "signals") {
      await fetchDailyForecasts(ticker, startDate, endDate, model);
      return;
    }

    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker || !startDate || !endDate) {
      setError(t("errors.tickerAndDates"));
      return;
    }
    if (queryMode === "analysis") {
      if (!Number.isInteger(Number(analysisHorizon)) || Number(analysisHorizon) < 1) {
        setError(t("errors.horizonWhole"));
        return;
      }
      setIsLoading(true);
      setError("");
      setDailyForecasts(null);
      setDailyAnalysis(null);
      setBacktestResult(null);
      window.localStorage.setItem("quant-horizon-model", model);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/analyses/daily`, {
          method: "POST",
          headers: JSON_HEADERS,
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
          throw new Error(t("errors.analysisUnsupported"));
        }
        if (!response.ok) throw new Error(apiErrorMessage(data, response.status, t));
        setDailyAnalysis(data as DailyAnalysisResponse);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : t("errors.dailyAnalysis"));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!Number.isFinite(Number(initialCapital)) || Number(initialCapital) <= 0) {
      setError(t("errors.initialCapital"));
      return;
    }
    if (!Number.isInteger(Number(backtestHorizon)) || Number(backtestHorizon) < 1) {
      setError(t("errors.horizonWhole"));
      return;
    }

    setIsLoading(true);
    setError("");
    setDailyForecasts(null);
    setDailyAnalysis(null);
    setBacktestResult(null);
    window.localStorage.setItem("quant-horizon-model", model);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/backtests/period`, {
        method: "POST",
        headers: JSON_HEADERS,
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
      if (!response.ok) throw new Error(apiErrorMessage(data, response.status, t));
      setBacktestResult(data as PeriodBacktestResponse);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors.backtest"));
    } finally {
      setIsLoading(false);
    }
  }

  async function registerAcceptance(item: DailyForecastItem) {
    const normalizedTicker = ticker.trim().toUpperCase();
    const tradeType = item.position_before === "LONG" ? "SELL" : "BUY";
    setAcceptanceInProgress(item.target_date);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/positions/${encodeURIComponent(normalizedTicker)}/acceptances`,
        {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            trade_type: tradeType,
            acceptance_date: item.target_date,
            acceptance_price: item.reference_price,
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(apiErrorMessage(data, response.status, t));
      setPositionState(data as PositionState);
      await fetchDailyForecasts(normalizedTicker, startDate, endDate, model);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors.recordAcceptance"));
    } finally {
      setAcceptanceInProgress(null);
    }
  }

  async function resetAcceptances() {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!window.confirm(t("position.resetConfirm", { ticker: normalizedTicker }))) return;

    setIsResettingAcceptances(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/positions/${encodeURIComponent(normalizedTicker)}/acceptances`,
        { method: "DELETE", headers: JSON_HEADERS },
      );
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(apiErrorMessage(data, response.status, t));
      setPositionState(data as PositionState);
      await fetchDailyForecasts(normalizedTicker, startDate, endDate, model);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors.resetAcceptances"));
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
        <span className="topbar-title">{t("app.subtitle")}</span>
        <LanguageSwitcher />
        <span className="read-only">{t("app.readOnly")}</span>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div>
            <p className="eyebrow">{t("app.assetResearch")}</p>
            <h1>{t(`sidebar.titles.${queryMode}`)}</h1>
            <p className="sidebar-copy">
              {t(`sidebar.copies.${queryMode}`)}
            </p>
          </div>

          <form onSubmit={submitQuery} className="form">
            <label>{t("form.question")}</label>
            <div className="mode-selector" role="group" aria-label={t("form.analysisType")}>
              <button
                type="button"
                className={queryMode === "signals" ? "mode-option active" : "mode-option"}
                aria-pressed={queryMode === "signals"}
                onClick={() => changeMode("signals")}
              >
                {t("form.modes.signals")}
              </button>
              <button
                type="button"
                className={queryMode === "analysis" ? "mode-option active" : "mode-option"}
                aria-pressed={queryMode === "analysis"}
                onClick={() => changeMode("analysis")}
              >
                {t("form.modes.analysis")}
              </button>
              <button
                type="button"
                className={queryMode === "backtest" ? "mode-option active" : "mode-option"}
                aria-pressed={queryMode === "backtest"}
                onClick={() => changeMode("backtest")}
              >
                {t("form.modes.backtest")}
              </button>
            </div>

            <label htmlFor="ticker">{t("form.ticker")}</label>
            <div className="ticker-field">
              <span aria-hidden="true">⌕</span>
              <input id="ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" autoComplete="off" />
            </div>

            <div className="model-field">
              <label htmlFor="model">{t("form.model")}</label>
              <select
                id="model"
                value={model}
                onChange={(event) => setModel(event.target.value as InvestmentModel)}
              >
                {INVESTMENT_MODELS.map((option) => (
                  <option value={option.value} key={option.value}>{translatedModelName(option.value)}</option>
                ))}
              </select>
              <p className="model-help">{t(`models.descriptions.${model}`)}</p>
            </div>

            <div className="period-grid">
              <div className="field-group">
                <label htmlFor="start-date">{t("form.startDate")}</label>
                <input id="start-date" type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="field-group">
                <label htmlFor="end-date">{t("form.endDate")}</label>
                <input id="end-date" type="date" value={endDate} min={startDate} max={queryMode === "backtest" ? localIsoDate(0) : undefined} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            {queryMode === "analysis" && (
              <div className="analysis-parameters">
                <div className="field-group">
                  <label htmlFor="analysis-horizon">{t("form.analysisHorizon")}</label>
                  <input id="analysis-horizon" type="number" min="1" max="60" step="1" value={analysisHorizon} onChange={(e) => setAnalysisHorizon(e.target.value)} />
                </div>
              </div>
            )}
            {queryMode === "backtest" && (
              <div className="period-grid backtest-parameters">
                <div className="field-group">
                  <label htmlFor="initial-capital">{t("form.initialCapital")}</label>
                  <input id="initial-capital" type="number" min="1" step="0.01" value={initialCapital} onChange={(e) => setInitialCapital(e.target.value)} />
                </div>
                <div className="field-group">
                  <label htmlFor="backtest-horizon">{t("form.backtestHorizon")}</label>
                  <input id="backtest-horizon" type="number" min="1" max="60" step="1" value={backtestHorizon} onChange={(e) => setBacktestHorizon(e.target.value)} />
                </div>
              </div>
            )}
            <p className="field-help period-help">
              {t(`form.help.${queryMode}`)}
            </p>


            <button type="submit" disabled={isLoading}>
              {isLoading
                ? <><span className="spinner" aria-hidden="true" />{t("form.analyzing")}</>
                : <>{queryMode === "signals"
                  ? t("form.generateSignals")
                  : queryMode === "analysis"
                    ? t("form.analyzeSessions")
                    : t("form.runBacktest")} <span aria-hidden="true">→</span></>}
            </button>
          </form>

          <p className="disclaimer">{t("form.disclaimer")}</p>
        </aside>

        <section className="content" aria-live="polite">
          <div className="content-heading">
            <div>
              <p className="eyebrow">{t("content.eyebrow", { model: translatedModelName(displayedModel) })}</p>
              <h2>{t(`content.headings.${queryMode}`)}</h2>
            </div>
            {(dailyForecasts || dailyAnalysis || backtestResult) && (
              <div className="heading-chips">
                <span className="model-chip">{translatedModelName(displayedModel)}</span>
                <span className="ticker-chip">{(dailyForecasts || dailyAnalysis || backtestResult)?.ticker}</span>
              </div>
            )}
          </div>

          {error && <div className="error-card" role="alert"><span>!</span><div><strong>{t("errors.unableToComplete")}</strong><p>{error}</p></div></div>}

          {isLoading && <div className="empty-state loading-state"><div className="pulse" /><h3>{t("loading.title")}</h3><p>{t("loading.copy")}</p></div>}

          {!isLoading && queryMode === "signals" && positionState && (
            <section className="position-card">
              <div className="position-copy">
                <span>{t("position.title")}</span>
                <strong className={positionState.status === "LONG" ? "position-open" : "position-flat"}>
                  {positionState.status === "LONG" ? t("position.long") : t("position.none")}
                </strong>
                <small>
                  {positionState.status === "LONG" && positionState.purchase_date
                    ? `${t("position.acceptanceRecorded", { date: formatDate(positionState.purchase_date, locale) })}${positionState.purchase_price !== null ? ` · ${formatMoney(positionState.purchase_price, dailyForecasts?.currency ?? "", locale)}` : ""}`
                    : t("position.recordGuidance")}
                </small>
              </div>
              <div className="position-guidance">
                <strong>{t("position.howToRecord")}</strong>
                <span>{t("position.howToRecordCopy")}</span>
                {positionState.trades.length > 0 && (
                  <button
                    type="button"
                    className="reset-operations-button"
                    onClick={() => void resetAcceptances()}
                    disabled={isResettingAcceptances || acceptanceInProgress !== null}
                  >
                    {isResettingAcceptances ? t("position.resetting") : t("position.reset")}
                  </button>
                )}
              </div>
            </section>
          )}

          {!isLoading && dailyForecasts && (
            <section className="daily-results">
              {!hasMultiHorizonForecasts && (
                <div className="compatibility-alert" role="alert">
                  <strong>{t("compatibility.title")}</strong>
                  <span>
                    {t("compatibility.beforeCode")} <code>api.py</code> {t("compatibility.afterCode")}
                  </span>
                </div>
              )}
              <div className="agenda-summary">
                <div><span>{t("summary.sessionsInRange")}</span><strong>{dailyForecasts.total_trading_days}</strong></div>
                <div><span>{t("summary.availableSignals")}</span><strong>{dailyForecasts.total_available}</strong></div>
                <div><span>{t("summary.preliminaryForecasts")}</span><strong>{dailyForecasts.total_preliminary ?? "—"}</strong></div>
                <div><span>{t("summary.apiCalendar")}</span><strong>{dailyForecasts.api_version ? `v${dailyForecasts.api_version} · ` : ""}{dailyForecasts.market_calendar}</strong></div>
              </div>

              <nav className="interval-strip" aria-label={t("daily.forecastSessionsAria")}>
                <div>
                  <span>{t("daily.rangeForecasts")}</span>
                  <strong>{dailyForecasts.forecasts.length} {t(dailyForecasts.forecasts.length === 1 ? "common.session" : "common.sessions")}</strong>
                </div>
                <div className="interval-days">
                  {dailyForecasts.forecasts.map((item) => (
                    <a href={`#session-${item.target_date}`} className={actionClass(item.suggested_action)} key={item.target_date}>
                      <span>{formatShortDate(item.target_date, locale)}</span>
                      <strong>{translatedAction(item.suggested_action)}</strong>
                    </a>
                  ))}
                </div>
              </nav>

              <div className="daily-list">
                {dailyForecasts.forecasts.map((item) => (
                  <article id={`session-${item.target_date}`} className={`daily-card ${item.status.toLowerCase()}`} key={item.target_date}>
                    <header>
                      <div><span>{t("daily.analyzedSession")}</span><h3>{formatDate(item.target_date, locale)}</h3></div>
                      <div className="daily-badges">
                        {item.forecast_type && <span className={`projection-badge ${item.forecast_type.toLowerCase()}`}>{translatedProjectionType(item.forecast_type)}</span>}
                        <span className={`daily-action ${actionClass(item.suggested_action)}`}>{translatedAction(item.suggested_action)}</span>
                      </div>
                    </header>
                    <div className="daily-meta">
                      <div>
                        <span>{t("daily.analysisBasis")}</span>
                        <strong>{t("daily.closeOn", { date: formatDate(item.base_close_date, locale) })}</strong>
                        {typeof item.horizon_used === "number" && <small>{t("daily.projection", { count: item.horizon_used })}</small>}
                      </div>
                      <div><span>{t("daily.positionBefore")}</span><strong>{item.position_before === "LONG" ? t("positions.long") : t("positions.no_position")}</strong></div>
                      <div><span>{t("daily.referencePrice")}</span><strong>{item.reference_price !== null ? formatMoney(item.reference_price, dailyForecasts.currency, locale) : t("common.pending")}</strong></div>
                    </div>
                    {item.status === "AVAILABLE" && item.probability_down !== null && item.probability_neutral !== null && item.probability_up !== null && (
                      <div className="daily-probabilities">
                        <span>{t("common.down")} <strong>{formatPercentage(item.probability_down, locale)}</strong></span>
                        <span>{t("common.neutral")} <strong>{formatPercentage(item.probability_neutral, locale)}</strong></span>
                        <span>{t("common.up")} <strong>{formatPercentage(item.probability_up, locale)}</strong></span>
                        <span>{t("common.threshold")} <strong>{item.threshold !== null ? formatPercentage(item.threshold, locale) : "—"}</strong></span>
                      </div>
                    )}
                    <p className="daily-description">{item.description}</p>
                    {item.registered_acceptance && <p className="daily-accepted">{t("daily.recordedAcceptance", { tradeType: translatedAction(item.registered_acceptance.trade_type), date: formatDate(item.registered_acceptance.acceptance_date, locale) })}</p>}
                    {!item.registered_acceptance && item.status === "AVAILABLE" && (
                      <div className="daily-card-actions">
                        <span>
                          {t("daily.saveReference", { date: formatDate(item.target_date, locale) })}
                        </span>
                        <button
                          type="button"
                          className={item.position_before === "LONG" ? "accept-button sell" : "accept-button buy"}
                          onClick={() => void registerAcceptance(item)}
                          disabled={acceptanceInProgress !== null}
                        >
                          {acceptanceInProgress === item.target_date
                            ? t("daily.saving")
                            : item.position_before === "LONG"
                              ? t("daily.acceptSell")
                              : t("daily.acceptBuy")}
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
                <div><span>{t("analysis.analyzedSessions")}</span><strong>{dailyAnalysis.total_trading_days}</strong></div>
                <div><span>{t("analysis.evaluatedResults")}</span><strong>{dailyAnalysis.total_evaluated}</strong></div>
                <div><span>{t("analysis.futureForecasts")}</span><strong>{dailyAnalysis.total_preliminary}</strong></div>
                <div><span>{t("analysis.accuracyRate")}</span><strong>{dailyAnalysis.accuracy_rate === null ? t("common.pending") : formatPercentage(dailyAnalysis.accuracy_rate, locale)}</strong></div>
              </div>
              <div className="market-days-note">
                <strong>{dailyAnalysis.market_calendar}</strong>
                <span>
                  {t("analysis.marketDaysRemoved", { count: dailyAnalysis.ignored_non_trading_days })}
                </span>
              </div>
              <p className="analysis-period-note">
                {t("analysis.periodNote", {
                  latestClose: formatDate(dailyAnalysis.latest_available_close, locale),
                  historicalHorizon: dailyAnalysis.historical_horizon_trading_days,
                  frequency: dailyAnalysis.retraining_frequency_trading_days,
                  version: dailyAnalysis.api_version,
                })}
              </p>
              <div className="analysis-list">
                {dailyAnalysis.analyses.map((item) => {
                  const resultState = item.is_correct === true ? "correct" : item.is_correct === false ? "error" : "pending";
                  const resultLabel = item.is_correct === true ? t("results.correct") : item.is_correct === false ? t("results.divergence") : t("results.pending");
                  return (
                    <article className={`analysis-card ${item.forecast_type.toLowerCase()}`} key={`${item.reference_date}-${item.forecast_type}`}>
                      <header>
                        <div>
                          <span>{item.forecast_type === "HISTORICAL" ? t("analysis.replayedClose") : t("analysis.projectedSession")}</span>
                          <h3>{formatDate(item.reference_date, locale)}</h3>
                        </div>
                        <div className="analysis-badges">
                          <span className={`projection-badge ${item.forecast_type.toLowerCase()}`}>{translatedProjectionType(item.forecast_type)}</span>
                          <span className={`daily-action ${actionClass(item.action)}`}>{translatedAction(item.action)}</span>
                          <span className={`result-badge ${resultState}`}>{resultLabel}</span>
                        </div>
                      </header>
                      <div className="analysis-meta">
                        <div><span>{t("analysis.analysisBasis")}</span><strong>{formatDate(item.base_date, locale)}</strong><small>{item.forecast_type === "PRELIMINARY" ? t("analysis.latestKnownClose") : t("analysis.dataAvailable")}</small></div>
                        <div><span>{t("analysis.referencePrice")}</span><strong>{formatMoney(item.reference_price, dailyAnalysis.currency, locale)}</strong></div>
                        <div><span>{t("analysis.horizonUsed")}</span><strong>{item.horizon_used} {t(item.horizon_used === 1 ? "common.session" : "common.sessions")}</strong><small>{t("analysis.trainingSamples", { count: item.training_samples })}</small></div>
                      </div>
                      <div className="daily-probabilities">
                        <span>{t("common.down")} <strong>{formatPercentage(item.probability_down, locale)}</strong></span>
                        <span>{t("common.neutral")} <strong>{formatPercentage(item.probability_neutral, locale)}</strong></span>
                        <span>{t("common.up")} <strong>{formatPercentage(item.probability_up, locale)}</strong></span>
                        <span>{t("common.threshold")} <strong>{formatPercentage(item.threshold, locale)}</strong></span>
                      </div>
                      <div className="analysis-outcome">
                        <div><span>{t("analysis.predictedClass")}</span><strong>{translatedClassName(item.predicted_class_name)}</strong></div>
                        <div><span>{t("analysis.observedResult")}</span><strong>{translatedClassName(item.actual_class_name)}</strong></div>
                        <div>
                          <span>{t("analysis.entryExit")}</span>
                          <strong>{item.entry_date ? formatDate(item.entry_date, locale) : t("common.pending")} → {item.exit_date ? formatDate(item.exit_date, locale) : t("common.pending")}</strong>
                          <small>{item.entry_price !== null ? formatMoney(item.entry_price, dailyAnalysis.currency, locale) : t("analysis.pendingPrice")} → {item.exit_price !== null ? formatMoney(item.exit_price, dailyAnalysis.currency, locale) : t("analysis.pendingPrice")}</small>
                        </div>
                        <div><span>{t("analysis.observedReturn")}</span><strong>{item.observed_return === null ? t("common.pending") : formatPercentage(item.observed_return, locale)}</strong></div>
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
                <div><span>{t("backtest.finalStrategyCapital")}</span><strong>{formatMoney(backtestResult.metrics.final_strategy_capital, backtestResult.currency, locale)}</strong></div>
                <div><span>{t("backtest.finalBuyHoldCapital")}</span><strong>{formatMoney(backtestResult.metrics.final_buy_hold_capital, backtestResult.currency, locale)}</strong></div>
                <div><span>{t("backtest.strategyReturn")}</span><strong>{formatPercentage(backtestResult.metrics.total_strategy_return, locale)}</strong></div>
                <div><span>{t("backtest.buyHoldReturn")}</span><strong>{formatPercentage(backtestResult.metrics.total_buy_hold_return, locale)}</strong></div>
              </div>
              <div className="backtest-risk-grid">
                <div><span>{t("common.cagr")}</span><strong>{formatPercentage(backtestResult.metrics.strategy_cagr, locale)}</strong></div>
                <div><span>{t("backtest.approximateSharpe")}</span><strong>{backtestResult.metrics.approximate_sharpe === null ? "—" : backtestResult.metrics.approximate_sharpe.toFixed(3)}</strong></div>
                <div><span>{t("backtest.approximateSortino")}</span><strong>{backtestResult.metrics.approximate_sortino === null ? "—" : backtestResult.metrics.approximate_sortino.toFixed(3)}</strong></div>
                <div><span>{t("backtest.maximumDrawdown")}</span><strong>{formatPercentage(backtestResult.metrics.max_close_drawdown, locale)}</strong></div>
                <div><span>{t("backtest.exposure")}</span><strong>{formatPercentage(backtestResult.metrics.exposure_ratio, locale)}</strong></div>
                <div><span>{t("backtest.executedTrades")}</span><strong>{backtestResult.metrics.executed_trades}</strong></div>
                <div><span>{t("backtest.winRate")}</span><strong>{backtestResult.metrics.trade_win_rate === null ? "—" : formatPercentage(backtestResult.metrics.trade_win_rate, locale)}</strong></div>
                <div><span>{t("backtest.retrainings")}</span><strong>{backtestResult.total_retrainings}</strong></div>
              </div>
              <p className="backtest-period-note">
                {t("backtest.periodNote", {
                  model: translatedModelName(backtestResult.model_used),
                  start: formatDate(backtestResult.start_date, locale),
                  end: formatDate(backtestResult.end_date, locale),
                  firstSignal: formatDate(backtestResult.first_signal, locale),
                  lastExit: formatDate(backtestResult.last_exit, locale),
                  horizon: backtestResult.horizon_trading_days,
                })}
              </p>
              <div className="history-list">
                {backtestResult.trades.map((item, index) => {
                  const actionLabel = translatedAction(item.action);
                  const resultState = item.strategy_return > 0 ? "correct" : item.strategy_return < 0 ? "error" : "pending";
                  return <article className="history-card" key={`${item.signal_date}-${index}`}>
                    <header><div><span>{t("backtest.analyzedClose")}</span><h3>{formatDate(item.signal_date, locale)}</h3></div><div className="history-badges"><span className={`daily-action ${actionClass(item.action)}`}>{actionLabel}</span><span className={`result-badge ${resultState}`}>{formatPercentage(item.strategy_return, locale)}</span></div></header>
                    <div className="history-comparison"><div><span>{t("backtest.entry")}</span><strong>{formatMoney(item.entry_price, backtestResult.currency, locale)}</strong><small>{formatDate(item.entry_date, locale)}</small></div><div><span>{t("backtest.exit")}</span><strong>{formatMoney(item.exit_price, backtestResult.currency, locale)}</strong><small>{formatDate(item.exit_date, locale)}</small></div></div>
                    <div className="history-probabilities"><span>{t("common.down")} <strong>{formatPercentage(item.probability_down, locale)}</strong></span><span>{t("common.neutral")} <strong>{formatPercentage(item.probability_neutral, locale)}</strong></span><span>{t("common.up")} <strong>{formatPercentage(item.probability_up, locale)}</strong></span></div>
                    <div className="backtest-operation-result"><div><span>{t("backtest.assetReturn")}</span><strong>{formatPercentage(item.asset_return, locale)}</strong></div><div><span>{t("backtest.strategyCapital")}</span><strong>{formatMoney(item.strategy_capital, backtestResult.currency, locale)}</strong></div><div><span>{t("backtest.buyHoldCapital")}</span><strong>{formatMoney(item.buy_hold_capital, backtestResult.currency, locale)}</strong></div></div>
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
