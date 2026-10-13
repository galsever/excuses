"use client";

import { useActionState } from "react";
import { setup, type LoginState } from "../actions";

const initial: LoginState = { error: null };
const input = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent";

type Defaults = { server: string; school: string; user: string; place: string };

function Field(props: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input {...rest} className={input} />
    </label>
  );
}

export function SetupForm({ first, defaults }: { first: boolean; defaults: Defaults }) {
  const [state, action, pending] = useActionState(setup, initial);
  return (
    <form action={action} className="mt-6 space-y-4">
      {first && <Field label="Setup-Code" name="code" autoComplete="off" required />}
      <Field label="WebUntis-Server" name="server" placeholder="schule.webuntis.com" defaultValue={defaults.server} required />
      <Field label="Schule" name="school" placeholder="?school= aus der Login-URL" defaultValue={defaults.school} />
      <Field label="Benutzername" name="user" autoComplete="username" defaultValue={defaults.user} required />
      <Field label="Passwort" name="password" type="password" autoComplete="current-password" required={first} />
      <Field label="Ort" name="place" placeholder="Wien" defaultValue={defaults.place} />
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-accent-foreground disabled:opacity-60"
      >
        {pending ? "Prüfe bei WebUntis..." : "Speichern"}
      </button>
    </form>
  );
}
