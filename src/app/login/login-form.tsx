"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../actions";

const initial: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Benutzername</span>
        <input
          name="user"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Passwort</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-accent-foreground disabled:opacity-60"
      >
        {pending ? "Anmelden..." : "Anmelden"}
      </button>
    </form>
  );
}
