import { MIN_POSTS_FOR_ACCURACY, STRENGTH_LABELS, roundRho, strengthOf, type CategoryAccuracy } from "@/lib/accuracy";
import { SCORE_LABELS } from "@/lib/constants";

// Diverging pair from the validated palette: blue = lines up with results, red = runs against them.
const POSITIVE = "#2a78d6";
const NEGATIVE = "#e34948";

function sentence(c: CategoryAccuracy): string {
  const label = SCORE_LABELS[c.category];
  if (c.rho == null && c.n < MIN_POSTS_FOR_ACCURACY) {
    return `${label}: needs ${MIN_POSTS_FOR_ACCURACY} posts with a full scorecard (has ${c.n}).`;
  }
  if (c.rho == null) return `${label}: not enough variety in the scores yet (${c.n} posts).`;
  const r = roundRho(c.rho);
  const strength = STRENGTH_LABELS[strengthOf(c.rho)].toLowerCase();
  if (r <= -0.3) return `${label}: higher ${label.toLowerCase()} scores have gone with worse results (${r.toFixed(2)}, ${c.n} posts).`;
  return `${label}: a ${strength} predictor of your results (${r.toFixed(2)}, ${c.n} posts).`;
}

/**
 * Which score categories line up with real results: one diverging bar per category,
 * from 0 (no link) to +1 (perfect order) or −1 (backwards). Every value is labelled.
 */
export default function CategoryBars({ categories }: { categories: CategoryAccuracy[] }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 pb-1 text-[11px] text-zinc-500 sm:grid-cols-[9rem_1fr_3.5rem]">
        <span />
        <span className="relative flex justify-between">
          <span>
            −1<span className="hidden sm:inline"> backwards</span>
          </span>
          {/* centred over the zero baseline, whatever the side labels' widths */}
          <span className="absolute left-1/2 -translate-x-1/2">0</span>
          <span>
            +1<span className="hidden sm:inline"> perfect</span>
          </span>
        </span>
        <span />
      </div>
      <ul className="space-y-1">
        {categories.map((c) => {
          const r = c.rho == null ? null : roundRho(c.rho);
          const width = r == null ? 0 : Math.abs(r) * 50; // % of the full −1…+1 track
          return (
            <li
              key={c.category}
              tabIndex={0}
              aria-label={sentence(c)}
              className="group relative grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:grid-cols-[9rem_1fr_3.5rem]"
            >
              <span className="truncate text-sm text-zinc-800">{SCORE_LABELS[c.category]}</span>
              <span className="relative block h-3.5" aria-hidden>
                {/* zero baseline */}
                <span className="absolute inset-y-[-3px] left-1/2 w-px bg-zinc-300" />
                {r != null && r !== 0 && (
                  <span
                    className="absolute inset-y-0"
                    style={{
                      backgroundColor: r > 0 ? POSITIVE : NEGATIVE,
                      width: `${width}%`,
                      ...(r > 0
                        ? { left: "50%", borderRadius: "0 4px 4px 0" }
                        : { right: "50%", borderRadius: "4px 0 0 4px" }),
                    }}
                  />
                )}
              </span>
              <span className="text-right text-sm tabular-nums text-zinc-700">
                {r == null ? <span className="text-xs text-zinc-400">—</span> : r.toFixed(2)}
              </span>
              {/* hover / focus detail (the same sentence screen readers get) */}
              <span
                className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-72 max-w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-700 shadow-lg group-hover:block group-focus-visible:block"
                aria-hidden
              >
                {sentence(c)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
