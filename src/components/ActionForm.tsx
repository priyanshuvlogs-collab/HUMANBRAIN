"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: (pending: boolean) => ReactNode;
  className?: string;
  /** Clear the inputs after a successful save (for "add new" forms). */
  resetOnSuccess?: boolean;
};

/**
 * A form wired to a Server Action that shows its success/error message.
 * Calls the action from onSubmit (instead of the `action` attribute) so typed
 * values are NOT wiped when the server returns an error.
 */
export default function ActionForm({ action, children, className, resetOnSuccess }: Props) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const form = event.currentTarget;
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const formData = new FormData(form, submitter);
        startTransition(async () => {
          try {
            const result = await action(state, formData);
            setState(result);
            if (resetOnSuccess && result.ok) form.reset();
          } catch {
            setState({ error: "Something went wrong. Please try again." });
          }
        });
      }}
    >
      {children(pending)}
      {state.error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && !pending && (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          {state.ok}
        </p>
      )}
    </form>
  );
}
