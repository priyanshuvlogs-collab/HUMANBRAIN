import type { ReviewView } from "@/lib/schema";

const ACTION_LABELS: Record<string, string> = {
  scroll: "Scrolled past",
  like: "Liked",
  comment: "Commented",
  save: "Saved",
  share: "Shared",
  dm: "Sent a DM",
  click: "Clicked",
};

export default function PersonaCard({ persona }: { persona: ReviewView["personas"][number] }) {
  const converted = persona.action === "dm" || persona.action === "click";
  return (
    <div className="card flex min-w-0 flex-col gap-3 break-words">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{persona.name}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
            persona.stopped ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {persona.stopped ? "✓ Stopped" : "✗ Kept scrolling"}
        </span>
      </div>
      {persona.stopped && persona.stoppedAt && (
        <p className="text-xs text-zinc-500">
          Stopped at: <span className="font-medium text-zinc-700">{persona.stoppedAt}</span>
        </p>
      )}
      {persona.quote && <blockquote className="border-l-2 border-violet-300 pl-3 text-sm italic text-zinc-800">“{persona.quote}”</blockquote>}
      <div className="mt-auto flex flex-wrap gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${
            converted ? "bg-violet-600 text-white" : persona.action === "scroll" ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-800"
          }`}
        >
          {ACTION_LABELS[persona.action] ?? persona.action}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">
          {persona.wouldFinish ? "Would finish" : "Wouldn't finish"}
        </span>
      </div>
      {(persona.felt || persona.scrollAwayTrigger) && (
        <dl className="space-y-1 text-xs text-zinc-600">
          {persona.felt && (
            <div>
              <dt className="inline font-medium text-zinc-700">Felt: </dt>
              <dd className="inline">{persona.felt}</dd>
            </div>
          )}
          {persona.scrollAwayTrigger && (
            <div>
              <dt className="inline font-medium text-zinc-700">Would scroll away if: </dt>
              <dd className="inline">{persona.scrollAwayTrigger}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
