import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { runSiteBApifyBatch } from "@/lib/site-b/apify-batch.functions";
import { getApifyActorStatus } from "@/lib/site-b/apify.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Cloud, CheckCircle2, XCircle, ArrowLeft, Settings } from "lucide-react";
import { toast } from "sonner";

const statusQueryOptions = queryOptions({
  queryKey: ["apify-actor-status"],
  queryFn: () => getApifyActorStatus(),
});

export const Route = createFileRoute("/_authenticated/migration")({
  head: () => ({ meta: [{ title: "Publication Site B — WP Sync Manager" }] }),
  component: MigrationPage,
  errorComponent: ({ error }) => <div className="text-destructive">{error.message}</div>,
  notFoundComponent: () => <div>Introuvable</div>,
});

function MigrationPage() {
  const { data: status } = useSuspenseQuery(statusQueryOptions);
  const [postIds, setPostIds] = useState<number[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "overwrite" | "copy">("skip");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("migration:postIds");
      if (raw) setPostIds(JSON.parse(raw) as number[]);
    } catch {
      /* ignore */
    }
  }, []);

  const run = useServerFn(runSiteBApifyBatch);
  const mut = useMutation({
    mutationFn: () => run({ data: { postIds, duplicateStrategy } }),
    onSuccess: (res) => toast.success(`Apify: ${res.succeeded}/${res.total} publiés`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur Apify"),
  });

  const result = mut.data;
  const inProgress = mut.isPending;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Publication Site B</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {postIds.length > 0
              ? `${postIds.length} article(s) sélectionné(s) depuis la comparaison.`
              : "Sélectionnez des articles depuis la page Comparaison."}
          </p>
        </div>
        <Link to="/comparison" className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="size-3" /> Retour à la comparaison
        </Link>
      </header>

      <Alert variant={status.ready ? "default" : "destructive"}>
        <Settings className="size-4" />
        <AlertDescription>
          {status.ready ? (
            <>Actor Apify configuré (<code className="text-xs">{status.actorId}</code>).</>
          ) : (
            status.message
          )}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Options</CardTitle>
            <CardDescription>
              Site B est protégé par Sucuri. Les articles sont publiés via Apify (automatisation cloud du back-office WordPress).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Si un article avec le même slug existe déjà</Label>
              <Select value={duplicateStrategy} onValueChange={(v) => setDuplicateStrategy(v as "skip" | "overwrite" | "copy")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Ignorer</SelectItem>
                  <SelectItem value="overwrite">Écraser</SelectItem>
                  <SelectItem value="copy">Créer une copie (slug suffixé)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={postIds.length === 0 || inProgress || !status.ready}
              onClick={() => mut.mutate()}
            >
              <Cloud className="size-4 mr-2" />
              {inProgress ? "Apify en cours…" : `Publier sur Site B via Apify (${postIds.length})`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Résultats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {inProgress && (
              <p className="text-sm text-muted-foreground">
                Publication en cours sur Apify. Chaque article est traité séparément sur le cloud.
              </p>
            )}
            {result && (
              <div className="space-y-3">
                <div className="flex gap-3 flex-wrap">
                  <Badge variant="outline" className="border-[var(--success)]/40">
                    <CheckCircle2 className="size-3 mr-1" style={{ color: "var(--success)" }} />
                    {result.succeeded} réussis
                  </Badge>
                  {result.total - result.succeeded > 0 && (
                    <Badge variant="outline" className="border-destructive/40">
                      <XCircle className="size-3 mr-1 text-destructive" />
                      {result.total - result.succeeded} échecs
                    </Badge>
                  )}
                  <Badge variant="outline">{result.total} total</Badge>
                </div>
                <ResultsTable results={result.results} />
              </div>
            )}
            {!result && !inProgress && (
              <p className="text-sm text-muted-foreground">Aucune publication lancée.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResultsTable({ results }: { results: Array<{ sourceId: number; slug: string; ok: boolean; skipped: boolean; postUrl: string | null; postId: number | null; runId: string | null; error: string | null }> }) {
  return (
    <div className="rounded-md border border-border max-h-72 overflow-auto text-xs">
      <table className="w-full">
        <thead className="bg-muted/40 sticky top-0">
          <tr>
            <th className="text-left p-2">Slug</th>
            <th className="text-left p-2">État</th>
            <th className="text-left p-2">URL</th>
            <th className="text-left p-2">Run</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.sourceId} className="border-t border-border">
              <td className="p-2 font-mono">{r.slug}</td>
              <td className="p-2">
                {r.ok ? (
                  <span style={{ color: "var(--success)" }}>{r.skipped ? "↷" : "✓"}</span>
                ) : (
                  <span className="text-destructive" title={r.error ?? ""}>✗</span>
                )}
              </td>
              <td className="p-2 text-muted-foreground truncate max-w-[180px]">
                {r.postUrl ? (
                  <a href={r.postUrl} target="_blank" rel="noreferrer" className="text-primary">
                    {r.postUrl}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="p-2 font-mono text-muted-foreground">{r.runId ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
