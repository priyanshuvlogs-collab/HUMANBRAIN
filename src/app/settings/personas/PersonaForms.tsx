"use client";

import ActionForm from "@/components/ActionForm";
import { deletePersona, savePersona, setPersonaActive } from "./actions";

export type PersonaRow = { id: string; name: string; description: string; voice: string; active: boolean };

function PersonaFields({ persona }: { persona?: PersonaRow }) {
  const prefix = persona?.id ?? "new";
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${prefix}-name`} className="label">
          Name
        </label>
        <input id={`${prefix}-name`} name="name" required defaultValue={persona?.name} placeholder="e.g. The Bargain Hunter" className="input" />
      </div>
      <div>
        <label htmlFor={`${prefix}-description`} className="label">
          Who they are
        </label>
        <textarea
          id={`${prefix}-description`}
          name="description"
          rows={2}
          defaultValue={persona?.description}
          placeholder="Background, what they want, what they're wary of"
          className="input"
        />
      </div>
      <div>
        <label htmlFor={`${prefix}-voice`} className="label">
          Voice
        </label>
        <input
          id={`${prefix}-voice`}
          name="voice"
          defaultValue={persona?.voice}
          placeholder="How they talk, e.g. blunt, short sentences"
          className="input"
        />
      </div>
    </div>
  );
}

export function PersonaEditor({ persona, canActivate }: { persona: PersonaRow; canActivate: boolean }) {
  const blocked = !persona.active && !canActivate;
  return (
    <div className={`card space-y-3 ${persona.active ? "" : "opacity-80"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            persona.active ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {persona.active ? "Active" : "Off"}
        </span>
        <ActionForm action={setPersonaActive}>
          {(pending) => (
            <>
              <input type="hidden" name="id" value={persona.id} />
              <input type="hidden" name="active" value={persona.active ? "false" : "true"} />
              <button
                className={persona.active ? "btn-secondary" : "btn-primary"}
                disabled={pending || blocked}
                title={blocked ? "10 personas are already active — switch one off first." : undefined}
              >
                {pending ? "…" : persona.active ? "Switch off" : "Switch on"}
              </button>
            </>
          )}
        </ActionForm>
      </div>
      {blocked && <p className="text-xs text-zinc-500">10 personas are already active — switch one off to use this one.</p>}
      <ActionForm action={savePersona}>
        {(pending) => (
          <div className="space-y-3">
            <input type="hidden" name="id" value={persona.id} />
            <PersonaFields persona={persona} />
            <button className="btn-secondary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </ActionForm>
      <ActionForm action={deletePersona}>
        {(pending) => (
          <>
            <input type="hidden" name="id" value={persona.id} />
            <button
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
              disabled={pending}
              onClick={(e) => {
                if (!confirm(`Delete "${persona.name}"?`)) e.preventDefault();
              }}
            >
              {pending ? "Deleting…" : "Delete persona"}
            </button>
          </>
        )}
      </ActionForm>
    </div>
  );
}

export function NewPersonaForm({ canActivate }: { canActivate: boolean }) {
  return (
    <ActionForm action={savePersona} resetOnSuccess className="card space-y-3">
      {(pending) => (
        <>
          <h2 className="font-semibold">Add a persona</h2>
          {!canActivate && (
            <p className="text-xs text-zinc-500">10 personas are active, so a new one will be saved switched off.</p>
          )}
          <PersonaFields />
          <button className="btn-primary" disabled={pending}>
            {pending ? "Adding…" : "Add persona"}
          </button>
        </>
      )}
    </ActionForm>
  );
}
