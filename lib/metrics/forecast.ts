// ─── Forecasting ───────────────────────────────────────────────────────────────
// VIA Phase 12, brief sections 20-22: transparent methods only (moving
// average, simple exponential smoothing, linear trend) — no ML, no black
// box. Every result carries method, training window, and an uncertainty
// band; a series with too little history returns INSUFFICIENT_DATA rather
// than a confident-looking number (brief section 22's explicit instruction,
// and this codebase's existing convention — lib/operationalIntelligence's
// minimumSampleSize gate, lib/analytics/periods.ts's smallSample flag).

export type ForecastMethod = 'MOVING_AVERAGE' | 'EXPONENTIAL_SMOOTHING' | 'LINEAR_TREND';

export interface HistoryPoint { period: string; value: number }
export interface ForecastPoint { period: string; forecast: number; lowerBound: number; upperBound: number }

export interface ForecastResult {
  status: 'OK' | 'INSUFFICIENT_DATA';
  metricId?: string;
  method?: ForecastMethod;
  horizon?: number;
  trainingWindow?: number;
  points?: ForecastPoint[];
  dataSufficiency?: string;
  reason?: string;
  lastUpdated: string;
}

const MIN_HISTORY_POINTS = 6;

function stdev(residuals: number[]): number {
  if (residuals.length === 0) return 0;
  const mean = residuals.reduce((sum, r) => sum + r, 0) / residuals.length;
  const variance = residuals.reduce((sum, r) => sum + (r - mean) ** 2, 0) / residuals.length;
  return Math.sqrt(variance);
}

function movingAverage(values: number[], windowSize: number, horizon: number): { forecasts: number[]; residuals: number[] } {
  const w = Math.min(windowSize, values.length);
  const residuals: number[] = [];
  for (let t = w; t < values.length; t++) {
    const window = values.slice(t - w, t);
    const avg = window.reduce((s, v) => s + v, 0) / w;
    residuals.push(values[t] - avg);
  }
  const lastWindow = values.slice(-w);
  const flat = lastWindow.reduce((s, v) => s + v, 0) / w;
  return { forecasts: Array(horizon).fill(flat), residuals };
}

function exponentialSmoothing(values: number[], alpha: number, horizon: number): { forecasts: number[]; residuals: number[] } {
  let level = values[0];
  const residuals: number[] = [];
  for (let t = 1; t < values.length; t++) {
    residuals.push(values[t] - level);
    level = alpha * values[t] + (1 - alpha) * level;
  }
  return { forecasts: Array(horizon).fill(level), residuals };
}

function linearTrend(values: number[], horizon: number): { forecasts: number[]; residuals: number[] } {
  const n = values.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const xMean = xs.reduce((s, x) => s + x, 0) / n;
  const yMean = values.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xMean) * (values[i] - yMean); den += (xs[i] - xMean) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const fitted = xs.map(x => intercept + slope * x);
  const residuals = values.map((v, i) => v - fitted[i]);
  const forecasts = Array.from({ length: horizon }, (_, h) => intercept + slope * (n + h));
  return { forecasts, residuals };
}

/**
 * Forecasts the next `horizon` periods of `history` using a transparent,
 * auditable method. Returns INSUFFICIENT_DATA (never a fabricated number)
 * when fewer than MIN_HISTORY_POINTS periods are supplied. The uncertainty
 * band widens with the forecast step (sqrt(h) scaling of the in-sample
 * residual standard deviation) — a simple, disclosed heuristic, not a
 * formal statistical confidence interval.
 */
export function forecastSeries(history: HistoryPoint[], horizon: number, method: ForecastMethod = 'MOVING_AVERAGE', metricId?: string): ForecastResult {
  const lastUpdated = new Date().toISOString();
  if (history.length < MIN_HISTORY_POINTS) {
    return {
      status: 'INSUFFICIENT_DATA', metricId, lastUpdated,
      reason: `Forecasting needs at least ${MIN_HISTORY_POINTS} historical periods; only ${history.length} available.`,
    };
  }
  if (horizon < 1 || horizon > 12) throw new Error('Forecast horizon must be between 1 and 12 periods.');

  const values = history.map(h => h.value);
  const { forecasts, residuals } = method === 'EXPONENTIAL_SMOOTHING' ? exponentialSmoothing(values, 0.3, horizon)
    : method === 'LINEAR_TREND' ? linearTrend(values, horizon)
    : movingAverage(values, 3, horizon);

  const residualStdev = stdev(residuals);
  const points: ForecastPoint[] = forecasts.map((forecast, h) => {
    const band = residualStdev * Math.sqrt(h + 1);
    return {
      period: `T+${h + 1}`,
      forecast,
      lowerBound: Math.max(0, forecast - band),
      upperBound: forecast + band,
    };
  });

  return {
    status: 'OK', metricId, method, horizon, trainingWindow: history.length, points,
    dataSufficiency: residuals.length >= MIN_HISTORY_POINTS ? `${history.length} periods, ${residuals.length} residuals — adequate for a simple ${method.toLowerCase().replace('_', ' ')} model.` : `${history.length} periods — minimal; treat the uncertainty band as wide.`,
    lastUpdated,
  };
}
