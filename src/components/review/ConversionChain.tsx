import type { ReviewView } from "@/lib/schema";

const STATUS = {
  pass: { icon: "✓", dot: "bg-emerald-500 text-white", text: "text-zinc-800" },
  weak: { icon: "!", dot: "bg-amber-400 text-white", text: "text-zinc-800" },
  break: { icon: "✗", dot: "bg-red-600 text-white", text: "text-red-700 font-semibold" },
} as const;

export default function ConversionChain({ chain, breakPoint }: { chain: ReviewView["conversionChain"]; breakPoint: string | null }) {
  if (chain.length === 0) {
    return <p className="text-sm text-zinc-500">{breakPoint ? `Breaks at: ${breakPoint}` : "No conversion path returned."}</p>;
  }
  return (
    <ol className="relative space-y-4">
      {chain.map((step, i) => {
        const s = STATUS[step.status];
        const isBreak = step.status === "break";
        return (
          <li key={i} className={`flex gap-3 ${isBreak ? "rounded-lg bg-red-50 p-2 ring-1 ring-red-200" : ""}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.dot}`}>{s.icon}</span>
            <div>
              <p className={`text-sm ${s.text}`}>
                {step.step}
                {isBreak && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">BREAK POINT</span>}
              </p>
              {step.note && <p className="text-xs text-zinc-600">{step.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
