import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listSiteBPublications, getApifyActorStatus } from "@/lib/site-b/apify.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, RefreshCw, Settings, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/migration")({
  head: () => ({ meta: [{ title: "Journal Site B — WP Sync Manager" }] }),
  component: PublicationsJournalPage,
  errorComponent: ({ error }) => <div className="text-destructive">{error.message}</div>,
  notFoundComponent: () => <div>Introuvable</div>,
});

function PublicationsJournalPage() {
  const statusFn = useServerFn(getApifyActorStatus);
  const listFn = useServerFn(listSiteBPublications);
  const status = useQuery({ queryKey: ["apify-actor-status"], queryFn: () => statusFn() });
  const pubs = useQuery({
    queryKey: ["site-b-publications"],
    queryFn: () => listFn(),
    refetchInterval: (q) => {
      const list = q.state.data as Array<{ status: string }> | undefined;
      return list?.some((p) => p.status === "running" || p.status === "pending") ? 3000 : false;
    },
  });
  const running = (pubs.data ?? []).filter((p) => p.status === "running" || p.status === "pending").length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Journal Site B</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historique des publications envoyées sur Site B via Apify.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => pubs.refetch()} disabled={pubs.isFetching}>
            <RefreshCw className={`size-4 mr-1.5 ${pubs.isFetching ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
          <Link to="/comparison">
            <Button size="sm">
              Aller à Articles Site A <ArrowRight className="size-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </header>

      <Alert variant={status.data?.ready ? "default" : "destructive"}>
        <Settings className="size-4" />
        <AlertDescription>
          {status.data?.ready ? (
            <>Actor Apify configuré (<code className="text-xs">{status.data.actorId}</code>). Les publications se déclenchent depuis « Articles Site A ».</>
          ) : (
            status.data?.message ?? "Vérification…"
          )}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">50 dernières publications</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pubs.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Chargement…</div>
          ) : (pubs.data ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Aucune publication encore envoyée.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">Date</th>
                    <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">Slug</th>
                    <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">Statut</th>
                    <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">URL Site B</th>
                    <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">Run</th>
                  </tr>
                </thead>
                <tbody>
                  {(pubs.data ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-border hover:bg-muted/30 align-top">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(p.created_at).toLocaleString("fr-FR")}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{p.source_slug ?? "—"}</td>
                      <td className="px-3 py-2">
                        {p.status === "succeeded" ? (
                          <Badge variant="outline" className="border-[var(--success)]/40">
                            <CheckCircle2 className="size-3 mr-1" style={{ color: "var(--success)" }} />
                            réussi
                          </Badge>
                        ) : p.status === "skipped" ? (
                          <Badge variant="outline">ignoré</Badge>
                        ) : p.status === "failed" ? (
                          <Badge variant="outline" className="border-destructive/40">
                            <XCircle className="size-3 mr-1 text-destructive" />
                            échec
                          </Badge>
                        ) : p.status === "running" || p.status === "pending" ? (
                          <Badge variant="outline">
                            <RefreshCw className="size-3 mr-1 animate-spin" />
                            en cours
                          </Badge>
                        ) : (
                          <Badge variant="outline">{p.status}</Badge>
                        )}
                        {p.status === "failed" && p.error && (
                          <div className="mt-1 text-[11px] text-destructive whitespace-pre-wrap break-words max-w-[420px]">
                            {p.error}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {p.post_url ? (
                          <a href={p.post_url} target="_blank" rel="noreferrer" className="text-primary truncate inline-block max-w-[260px] align-middle">
                            {p.post_url}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {p.apify_run_id ? (
                          <a
                            href={`https://console.apify.com/actors/runs/${p.apify_run_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary"
                          >
                            {p.apify_run_id}
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
