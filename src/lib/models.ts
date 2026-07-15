export type InvestmentModel =
  | "lightgbm"
  | "catboost"
  | "xgboost"
  | "logistic"
  | "random_forest"
  | "ensemble";

export const INVESTMENT_MODELS: ReadonlyArray<{
  value: InvestmentModel;
  name: string;
  description: string;
}> = [
  {
    value: "lightgbm",
    name: "LightGBM",
    description: "Fast, regularized default model.",
  },
  {
    value: "catboost",
    name: "CatBoost",
    description: "Gradient boosting with ordered training.",
  },
  {
    value: "xgboost",
    name: "XGBoost",
    description: "Gradient boosting with alternative regularization.",
  },
  {
    value: "logistic",
    name: "Logistic Regression",
    description: "Simple and interpretable linear baseline.",
  },
  {
    value: "random_forest",
    name: "Random Forest",
    description: "An ensemble of randomly sampled decision trees.",
  },
  {
    value: "ensemble",
    name: "Ensemble",
    description: "Average probabilities from the three boosting models.",
  },
];

export function isInvestmentModel(value: string | null): value is InvestmentModel {
  return INVESTMENT_MODELS.some((model) => model.value === value);
}

export function modelName(value: InvestmentModel) {
  return INVESTMENT_MODELS.find((model) => model.value === value)?.name ?? value;
}

export function modelDescription(value: InvestmentModel) {
  return INVESTMENT_MODELS.find((model) => model.value === value)?.description ?? "";
}
