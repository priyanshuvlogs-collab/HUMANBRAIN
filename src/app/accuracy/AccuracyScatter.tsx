"use client";

import { useRouter } from "next/navigation";
import { memo, useCallback, useMemo, useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import type { ScatterShapeProps } from "recharts/types/util/ScatterUtils";
import type { Verdict } from "@/lib/accuracy";

export type ScatterPoint = {
  postId: string;
  score: number;
  pi: number;
  verdict: Verdict;
  hook: string;
  where: string; // "Instagram · Reel"
  predicted: string; // "Above average"
  actual: string; // "Below average"
};

// Categorical slots 1–3 of the validated palette (all-pairs safe; see the dataviz palette).
// Colour follows the verdict, never its rank, so filtering never repaints a group.
export const VERDICT_STYLES: Record<Verdict, { label: string; color: string }> = {
  right: { label: "Right tier", color: "#2a78d6" },
  too_high: { label: "Predicted too high", color: "#eb6834" },
  too_low: { label: "Predicted too low", color: "#1baf7a" },
};
const VERDICTS: Verdict[] = ["right", "too_high", "too_low"];

const INK = { grid: "#e4e4e7", axis: "#d4d4d8", tick: "#71717a", reference: "#a1a1aa", surface: "#ffffff" };
const HEIGHT = 320; // includes the x-axis band, so the card never scrolls

function yAxisFor(maxPi: number): { max: number; ticks: number[] } {
  const max = Math.min(10, Math.max(2, Math.ceil(maxPi * 2) / 2));
  const step = max <= 3 ? 0.5 : max <= 6 ? 1 : 2;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10);
  return { max, ticks };
}

type Handlers = {
  onShow: (point: ScatterPoint, x: number, y: number) => void;
  onHide: (postId: string) => void;
  onOpen: (postId: string) => void;
};

/**
 * The chart itself. Memoised and never re-rendered on hover/focus (the tooltip and focus
 * ring are drawn on top by the parent), so a focused or clicked dot is never swapped out
 * under the pointer or the keyboard.
 */
const ScatterPlot = memo(function ScatterPlot({ points, onShow, onHide, onOpen }: { points: ScatterPoint[] } & Handlers) {
  const { max, ticks } = useMemo(() => yAxisFor(Math.max(0, ...points.map((p) => p.pi))), [points]);
  const byVerdict = useMemo(
    () => Object.fromEntries(VERDICTS.map((v) => [v, points.filter((p) => p.verdict === v)])) as Record<Verdict, ScatterPoint[]>,
    [points],
  );

  // Called by Recharts as a plain function (not mounted as a component), once per point.
  const renderDot = useCallback(
    (props: ScatterShapeProps) => {
      const point = props.payload as ScatterPoint | undefined;
      const { cx, cy } = props;
      if (!point || cx == null || cy == null) return <g />;
      return (
        <g
          role="link"
          tabIndex={0}
          aria-label={`${point.hook}. Predicted ${point.score} out of 100, ${point.predicted}. Real Performance Index ${point.pi.toFixed(2)}, ${point.actual}. Open post.`}
          style={{ cursor: "pointer", outline: "none" }}
          onMouseEnter={() => onShow(point, cx, cy)}
          onMouseLeave={() => onHide(point.postId)}
          onFocus={() => onShow(point, cx, cy)}
          onBlur={() => onHide(point.postId)}
          onClick={() => onOpen(point.postId)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(point.postId);
            }
          }}
        >
          {/* 24px transparent hit area: nobody has to land on the 10px dot itself */}
          <circle cx={cx} cy={cy} r={12} fill="transparent" />
          <circle cx={cx} cy={cy} r={5} fill={VERDICT_STYLES[point.verdict].color} stroke={INK.surface} strokeWidth={2} />
        </g>
      );
    },
    [onShow, onHide, onOpen],
  );

  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 0 }}>
        <CartesianGrid stroke={INK.grid} strokeWidth={1} />
        <XAxis
          type="number"
          dataKey="score"
          domain={[0, 100]}
          ticks={[0, 20, 40, 60, 80, 100]}
          tick={{ fill: INK.tick, fontSize: 12 }}
          stroke={INK.axis}
          label={{ value: "Predicted score", position: "insideBottom", offset: -14, fill: INK.tick, fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="pi"
          domain={[0, max]}
          ticks={ticks}
          allowDataOverflow
          tickFormatter={(v: number) => v.toFixed(1)}
          tick={{ fill: INK.tick, fontSize: 12 }}
          stroke={INK.axis}
          width={44}
          label={{ value: "Performance Index", angle: -90, position: "insideLeft", offset: 12, fill: INK.tick, fontSize: 12, dy: 56 }}
        />
        <ReferenceLine
          y={1}
          stroke={INK.reference}
          strokeWidth={1}
          label={{ value: "Your average", position: "insideTopRight", fill: INK.tick, fontSize: 11 }}
        />
        {VERDICTS.map((v) => (
          <Scatter key={v} name={VERDICT_STYLES[v].label} data={byVerdict[v]} shape={renderDot} isAnimationActive={false} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
});

/**
 * Predicted score (x) vs real Performance Index (y), one dot per post. Hover or focus a dot
 * (Tab moves between them) for its details; click or press Enter to open the post.
 */
export default function AccuracyScatter({ points }: { points: ScatterPoint[] }) {
  const router = useRouter();
  const [active, setActive] = useState<{ point: ScatterPoint; x: number; y: number } | null>(null);
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, points.filter((p) => p.verdict === v).length])) as Record<
    Verdict,
    number
  >;

  const onShow = useCallback((point: ScatterPoint, x: number, y: number) => setActive({ point, x, y }), []);
  const onHide = useCallback((postId: string) => setActive((a) => (a?.point.postId === postId ? null : a)), []);
  const onOpen = useCallback((postId: string) => router.push(`/posts/${postId}`), [router]);

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700" aria-label="Legend">
        {VERDICTS.map((v) => (
          <li key={v} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: VERDICT_STYLES[v].color }} aria-hidden />
            {VERDICT_STYLES[v].label}
            <span className="text-zinc-500 tabular-nums">({counts[v]})</span>
          </li>
        ))}
      </ul>

      <div className="relative" onMouseLeave={() => setActive(null)}>
        <ScatterPlot points={points} onShow={onShow} onHide={onHide} onOpen={onOpen} />
        {active && (
          <span
            className="pointer-events-none absolute h-[18px] w-[18px] rounded-full border-2 border-violet-600"
            style={{ left: active.x - 9, top: active.y - 9 }}
            aria-hidden
          />
        )}

        {active && (
          <div
            className="pointer-events-none absolute z-10 w-64 max-w-[calc(100%-1rem)] rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-lg"
            style={{
              top: Math.max(0, active.y - 12),
              ...(active.x > 200 ? { right: `calc(100% - ${active.x - 16}px)` } : { left: active.x + 16 }),
            }}
            role="status"
          >
            <p className="text-sm font-semibold text-zinc-900">
              PI {active.point.pi.toFixed(2)} · Score {active.point.score}
            </p>
            <p className="mt-1 line-clamp-2 break-words text-zinc-700">“{active.point.hook}”</p>
            <p className="mt-1 text-zinc-500">{active.point.where}</p>
            <p className="mt-1 flex items-center gap-1.5 text-zinc-700">
              <span className="inline-block h-0.5 w-3" style={{ backgroundColor: VERDICT_STYLES[active.point.verdict].color }} aria-hidden />
              {active.point.verdict === "right"
                ? `Predicted ${active.point.predicted.toLowerCase()}, and it was`
                : `Predicted ${active.point.predicted.toLowerCase()} → actually ${active.point.actual.toLowerCase()}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
