import Link from "next/link";
import { logout } from "../actions";
import { Nav } from "@/components/nav";
import { SyncBar } from "@/components/sync-bar";
import { loadSnapshot } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { syncStatus } from "@/lib/sync";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  const status = syncStatus();
  const snap = loadSnapshot();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24">
      <header className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/85 px-4 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">Fehlstunden</h1>
            {snap && (
              <p className="truncate text-xs text-muted">
                {snap.name} · {snap.klasse} · {snap.schoolyear.name}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <Link href="/setup" className="rounded-lg px-2 py-1 text-sm text-muted hover:text-foreground">
              Zugangsdaten
            </Link>
            <form action={logout}>
              <button className="rounded-lg px-2 py-1 text-sm text-muted hover:text-foreground">Abmelden</button>
            </form>
          </div>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <Nav />
          <SyncBar status={status} />
        </div>
      </header>
      <main className="pt-4">{children}</main>
    </div>
  );
}
