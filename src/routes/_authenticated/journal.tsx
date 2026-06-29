import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMigrationRun, listMigrationRuns } from "@/lib/wordpress/wp.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({ meta: [{ title: "Journal — WP Sync Manager" }] }),
  component: JournalPage,
  errorComponent: ({ error }) => <div className="text-destructive">{error.message}</div>,
  notFoundComponent: () => <div>Introuvable</div>,
});

interface RunDetail {
  id: string;
  started_at: string;
  ended_at: string | null;
  total: number;
  succeeded: number;
  failed: number;
  report: unknown;
  log: unknown;
}

function JournalPage() {
  const list = useServerFn(listMigrationRuns);
  const detail = useServerFn(getMigrationRun);
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => list() });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const run = useQuery({
    queryKey: ["run", selectedId],
    queryFn: () => detail({ data: { id: selectedId as string } }),
    enabled: Boolean(selectedId),
  });

  function download(content: unknown, name: string) {
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
        <p className="text-sm text-muted-foreground mt-1">Historique des migrations exécutées.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Migrations</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {(runs.data ?? []).map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/40 ${selectedId === r.id ? "bg-muted/50" : ""}`}
                  >
                    <div className="font-mono text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleString("fr-FR")}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="border-[var(--success)]/40">{r.succeeded}</Badge>
                      {r.failed > 0 && <Badge variant="outline" className="border-destructive/40">{r.failed}</Badge>}
                      <span className="text-xs text-muted-foreground">/ {r.total}</span>
                    </div>
                  </button>
                </li>
              ))}
              {runs.data?.length === 0 && (
                <li className="p-6 text-sm text-muted-foreground text-center">Aucune migration</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Détail</CardTitle>
            {run.data && (
              <Button size="sm" variant="outline" onClick={() => download(run.data, `migration-${(run.data as RunDetail).id}.json`)}>
                <Download className="size-4 mr-1.5" />
                Exporter JSON
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedId && <p className="text-sm text-muted-foreground">Sélectionnez une migration pour voir le détail.</p>}
            {run.data && <RunDetailView data={run.data as RunDetail} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RunDetailView({ data }: { data: RunDetail }) {
  const log = Array.isArray(data.log) ? (data.log as Array<{ ts: string; level: string; message: string }>) : [];
  return (
    <div className="space-y-4">
      <div className="flex gap-3 text-sm">
        <Badge variant="outline" className="border-[var(--success)]/40">{data.succeeded} réussis</Badge>
        {data.failed > 0 && <Badge variant="outline" className="border-destructive/40">{data.failed} échecs</Badge>}
        <Badge variant="outline">{data.total} total</Badge>
      </div>
      <div className="rounded-md border border-border bg-muted/30 max-h-[60vh] overflow-auto p-3 font-mono text-[11px] leading-5">
        {log.map((l, i) => (
          <div key={i} className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-[var(--warning)]" : ""}>
            [{new Date(l.ts).toLocaleTimeString("fr-FR")}] {l.message}
          </div>
        ))}
      </div>
    </div>
  );
}
