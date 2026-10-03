import { requireUser } from "@/lib/auth";
import { MAX_ACTIVE_PERSONAS } from "@/lib/constants";
import { canActivateAnother } from "@/lib/personas";
import { NewPersonaForm, PersonaEditor } from "./PersonaForms";

export default async function PersonasPage() {
  const { supabase, userId } = await requireUser();
  const { data: personas } = await supabase
    .from("personas")
    .select("id, name, description, voice, active")
    .eq("user_id", userId)
    .order("sort_order")
    .order("created_at");

  const list = personas ?? [];
  const activeCount = list.filter((p) => p.active).length;
  const canActivate = canActivateAnother(activeCount);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personas</h1>
          <p className="text-sm text-zinc-600">Your simulated audience. Every review uses the active ones.</p>
        </div>
        <p className="rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-800">
          {activeCount}/{MAX_ACTIVE_PERSONAS} active
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((p) => (
          <PersonaEditor key={p.id} persona={p} canActivate={canActivate} />
        ))}
      </div>
      <NewPersonaForm canActivate={canActivate} />
    </div>
  );
}
