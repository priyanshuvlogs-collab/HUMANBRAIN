"use client";

import { useActionState } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";

const emailInitial: LoginState = { step: "email", email: "" };
const codeInitial: LoginState = { step: "code", email: "" };

export default function LoginForm() {
  const [emailState, emailAction, sending] = useActionState(sendCode, emailInitial);
  const [codeState, codeAction, verifying] = useActionState(verifyCode, codeInitial);

  // Show the code step once an email was sent (and stay there while verifying).
  const onCodeStep = emailState.step === "code" && codeState.step !== "email";
  const email = emailState.email;

  if (!onCodeStep) {
    return (
      <form action={emailAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} className="input" />
        </div>
        {(emailState.error || codeState.error) && (
          <p className="text-sm text-red-600" role="alert">
            {emailState.error ?? codeState.error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={sending}>
          {sending ? "Sending…" : "Email me a login code"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{emailState.info}</p>
      <form action={codeAction} className="space-y-4">
        <input type="hidden" name="email" value={email} />
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
        {codeState.error && (
          <p className="text-sm text-red-600" role="alert">
            {codeState.error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={verifying}>
          {verifying ? "Checking…" : "Log in"}
        </button>
      </form>
      <form action={emailAction}>
        <input type="hidden" name="email" value={email} />
        <button className="w-full text-sm text-zinc-500 hover:text-zinc-900" disabled={sending}>
          {sending ? "Sending…" : "Send a new code"}
        </button>
      </form>
    </div>
  );
}
