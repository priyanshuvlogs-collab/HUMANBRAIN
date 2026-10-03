"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = { step: "email", email: "" };

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  if (state.step === "email") {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="send" />
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.email}
            key={state.email}
            className="input"
          />
        </div>
        {state.error && (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "Sending…" : "Email me a login code"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {state.info && <p className="text-sm text-zinc-600">{state.info}</p>}
      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="verify" />
        <input type="hidden" name="email" value={state.email} />
        <div>
          <label htmlFor="code" className="label">
            Login code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={10}
            required
            autoFocus
            className="input text-center text-2xl tracking-[0.4em]"
          />
        </div>
        {state.error && (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "Please wait…" : "Log in"}
        </button>
      </form>
      <div className="flex justify-between gap-2 text-sm">
        <form action={action}>
          <input type="hidden" name="intent" value="restart" />
          <button className="text-zinc-500 hover:text-zinc-900" disabled={pending}>
            Use a different email
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="intent" value="resend" />
          <input type="hidden" name="email" value={state.email} />
          <button className="text-zinc-500 hover:text-zinc-900" disabled={pending}>
            Send a new code
          </button>
        </form>
      </div>
    </div>
  );
}
