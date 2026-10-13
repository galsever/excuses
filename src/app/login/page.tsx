import { connection } from "next/server";
import { redirect } from "next/navigation";
import { loadCredentials } from "@/lib/credentials";
import { LoginForm } from "./login-form";

export const metadata = { title: "Anmelden · Fehlstunden" };

export default async function LoginPage() {
  await connection();
  if (!loadCredentials()) redirect("/setup");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Fehlstunden</h1>
        <p className="mt-1 text-sm text-muted">Mit deinem WebUntis-Konto anmelden.</p>
        <LoginForm />
      </div>
    </main>
  );
}
