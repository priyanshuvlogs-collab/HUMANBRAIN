import { METRIC_KEYS, METRIC_LABELS, type MetricKey, type Metrics } from "./performance";

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function formatMetric(key: MetricKey, value: number): string {
  return key.endsWith("_pct") ? `${formatNumber(value)}%` : formatNumber(value);
}

/** "12,000 views/reach, 38% avg watch %, 9 DMs" — only the metrics that were recorded. */
export function describeMetrics(metrics: Metrics): string {
  const parts = METRIC_KEYS.flatMap((key) => {
    const value = metrics[key];
    return value == null ? [] : [`${METRIC_LABELS[key]}: ${formatMetric(key, Number(value))}`];
  });
  return parts.length ? parts.join(", ") : "no metrics recorded";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Keeps text short for prompts and tables. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
