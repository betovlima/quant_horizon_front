import type { InvestmentModel } from "./models";

export type BacktestRequestPayload = {
  ticker: string;
  model: InvestmentModel;
  start_date: string;
  end_date: string;
  initial_capital: number;
  horizon_trading_days: number;
  position_mode: "long_flat";
};

export function createBacktestPayload(
  ticker: string,
  startDate: string,
  endDate: string,
  initialCapital: string,
  horizonTradingDays: string,
  model: InvestmentModel,
): BacktestRequestPayload {
  return {
    ticker: ticker.trim().toUpperCase(),
    model,
    start_date: startDate,
    end_date: endDate,
    initial_capital: Number(initialCapital),
    horizon_trading_days: Number(horizonTradingDays),
    position_mode: "long_flat",
  };
}
