import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { loadCredentials, setupCode } from "@/lib/credentials";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Einrichten · Fehlstunden" };

export default async function SetupPage() {
  const loggedIn = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const creds = loadCredentials();
  if (creds && !loggedIn) redirect("/login");
  // Only whoever can read the server log can claim a fresh instance.
  if (!creds) console.log(`[excuses] Setup-Code: ${setupCode()}`);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{creds ? "Zugangsdaten" : "Einrichten"}</h1>
        <p className="mt-1 text-sm text-muted">{creds ? "Leeres Passwort bleibt unverändert." : "Setup-Code steht im Server-Log."}</p>
        <SetupForm
          first={!creds}
          defaults={{ server: creds?.server ?? "", school: creds?.school ?? "", user: creds?.user ?? "", place: creds?.place ?? "" }}
        />
      </div>
    </main>
  );
}
