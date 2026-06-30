import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listConnections, listMigrationRuns } from "@/lib/wordpress/wp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, XCircle, Database } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — WP Sync Manager" }] }),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div className="text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div>Introuvable</div>,
});

function Dashboard() {
  const list = useServerFn(listConnections);
  const runs = useServerFn(listMigrationRuns);
  const conns = useSuspenseQuery(
    queryOptions({ queryKey: ["connections"], queryFn: () => list() }),
  );
  const history = useSuspenseQuery(
    queryOptions({ queryKey: ["runs"], queryFn: () => runs() }),
  );

  const src = conns.data.find((c) => c.role === "source");
  const dst = conns.data.find((c) => c.role === "destination");
  const lastRun = history.data[0];

  const srcCaps = src?.capabilities && !("kind" in src.capabilities) ? src.capabilities : null;
  const dstCaps = dst?.capabilities && "kind" in dst.capabilities ? dst.capabilities : null;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vue d'ensemble des sites connectés et des migrations.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Articles Site A"
          value={srcCaps?.totalPosts ?? "—"}
          hint={src ? src.siteUrl.replace(/^https?:\/\//, "") : "Non configuré"}
        />
        <StatCard
          title="Site B (Apify)"
          value={dstCaps ? (dstCaps.loginOk ? "OK" : "KO") : "—"}
          hint={dst ? dst.siteUrl.replace(/^https?:\/\//, "") : "Non configuré"}
        />
        <StatCard
          title="Dernière migration"
          value={lastRun ? `${lastRun.succeeded}/${lastRun.total}` : "—"}
          hint={
            lastRun
              ? new Date(lastRun.started_at).toLocaleString("fr-FR")
              : "Aucune"
          }
        />
        <StatCard
          title="Échecs cumulés"
          value={history.data.reduce((acc, r) => acc + r.failed, 0)}
          hint={`${history.data.length} migration(s)`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ConnectionSummary
          role="source"
          label="Site A — source (REST)"
          siteUrl={src?.siteUrl ?? null}
          badges={srcCaps ? [
            { label: "API", ok: srcCaps.reachable },
            { label: "Édition", ok: srcCaps.canEditPosts },
            { label: "Upload", ok: srcCaps.canUploadFiles },
          ] : null}
        />
        <ConnectionSummary
          role="destination"
          label="Site B — destination (Apify)"
          siteUrl={dst?.siteUrl ?? null}
          badges={dstCaps ? [
            { label: "Login", ok: dstCaps.loginOk },
            { label: "Dashboard", ok: dstCaps.dashboardReachable },
          ] : null}
        />
      </div>


      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Migrations récentes</CardTitle>
          <Link to="/journal" className="text-xs text-primary inline-flex items-center gap-1">
            Voir tout <ArrowRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {history.data.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Aucune migration encore exécutée.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {history.data.slice(0, 5).map((r) => (
                <li key={r.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div className="font-mono text-xs text-muted-foreground">
                    {new Date(r.started_at).toLocaleString("fr-FR")}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-[var(--success)]/40">
                      <CheckCircle2 className="size-3 mr-1" style={{ color: "var(--success)" }} />
                      {r.succeeded}
                    </Badge>
                    {r.failed > 0 && (
                      <Badge variant="outline" className="border-destructive/40">
                        <XCircle className="size-3 mr-1 text-destructive" />
                        {r.failed}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">/ {r.total}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="text-3xl font-semibold mt-2 tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1 truncate">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ConnectionSummary({
  role,
  label,
  siteUrl,
  badges,
}: {
  role: "source" | "destination";
  label: string;
  siteUrl: string | null;
  badges: Array<{ label: string; ok: boolean }> | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {siteUrl ? (
          <div className="space-y-2 text-sm">
            <div className="font-mono text-xs break-all">{siteUrl}</div>
            <div className="flex flex-wrap gap-1.5">
              {(badges ?? []).map((b) => (
                <CapBadge key={b.label} ok={b.ok} label={b.label} />
              ))}
            </div>
          </div>
        ) : (
          <Link to="/connections" className="text-sm text-primary inline-flex items-center gap-1">
            Configurer {role === "source" ? "le site source" : "le site destination"}
            <ArrowRight className="size-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function CapBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant="outline" className={ok ? "border-[var(--success)]/40" : "border-destructive/40"}>
      {ok ? (
        <CheckCircle2 className="size-3 mr-1" style={{ color: "var(--success)" }} />
      ) : (
        <XCircle className="size-3 mr-1 text-destructive" />
      )}
      {label}
    </Badge>
  );
}

