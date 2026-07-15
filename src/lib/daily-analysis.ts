import type { InvestmentModel } from "./models";

export type DailyAnalysisRequestPayload = {
  ticker: string;
  model: InvestmentModel;
  start_date: string;
  end_date: string;
  horizon_trading_days: number;
};

export function createDailyAnalysisPayload(
  ticker: string,
  model: InvestmentModel,
  startDate: string,
  endDate: string,
  horizonTradingDays: string,
): DailyAnalysisRequestPayload {
  return {
    ticker: ticker.trim().toUpperCase(),
    model,
    start_date: startDate,
    end_date: endDate,
    horizon_trading_days: Number(horizonTradingDays),
  };
}
