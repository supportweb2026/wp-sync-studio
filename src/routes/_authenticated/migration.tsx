import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { runMigrationFn } from "@/lib/wordpress/wp.functions";
import { runSiteBApifyBatch } from "@/lib/site-b/apify-batch.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Rocket, ScrollText, CheckCircle2, XCircle, Cloud } from "lucide-react";
import { toast } from "sonner";
import type { LogEntry } from "@/services/migration/pipeline.server";
import type { MigrationReportItem } from "@/schemas/wordpress";


export const Route = createFileRoute("/_authenticated/migration")({
  head: () => ({ meta: [{ title: "Migration — WP Sync Manager" }] }),
  component: MigrationPage,
  errorComponent: ({ error }) => <div className="text-destructive">{error.message}</div>,
  notFoundComponent: () => <div>Introuvable</div>,
});

function MigrationPage() {
  const [postIds, setPostIds] = useState<number[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "overwrite" | "copy">("skip");
  const [preserveSlug, setPreserveSlug] = useState(true);
  const [preserveDate, setPreserveDate] = useState(true);
  const [preserveStatus, setPreserveStatus] = useState(true);
  const [preserveExcerpt, setPreserveExcerpt] = useState(true);
  const [migrateFeaturedImage, setMigrateFeaturedImage] = useState(true);
  const [migrateInlineImages, setMigrateInlineImages] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("migration:postIds");
      if (raw) setPostIds(JSON.parse(raw) as number[]);
    } catch {
      /* ignore */
    }
  }, []);

  const run = useServerFn(runMigrationFn);
  const mut = useMutation({
    mutationFn: () =>
      run({
        data: {
          postIds,
          options: {
            duplicateStrategy,
            preserveSlug,
            preserveDate,
            preserveStatus,
            preserveExcerpt,
            migrateFeaturedImage,
            migrateInlineImages,
          },
        },
      }),
    onSuccess: (res) => {
      toast.success(`Migration: ${res.succeeded}/${res.total} réussis`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const result = mut.data;
  const inProgress = mut.isPending;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Migration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {postIds.length > 0
              ? `${postIds.length} article(s) sélectionné(s) depuis la comparaison.`
              : "Sélectionnez des articles depuis la page Comparaison."}
          </p>
        </div>
        <Link to="/comparison" className="text-sm text-primary">
          ← Retour à la comparaison
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Options</CardTitle>
            <CardDescription>Comportement de la migration article par article.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Stratégie en cas de doublon (même slug)</Label>
              <Select value={duplicateStrategy} onValueChange={(v) => setDuplicateStrategy(v as "skip" | "overwrite" | "copy")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Ignorer</SelectItem>
                  <SelectItem value="overwrite">Écraser</SelectItem>
                  <SelectItem value="copy">Créer une copie (slug suffixé)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <OptionRow checked={preserveSlug} onChange={setPreserveSlug} label="Conserver le slug" />
              <OptionRow checked={preserveDate} onChange={setPreserveDate} label="Conserver la date" />
              <OptionRow checked={preserveStatus} onChange={setPreserveStatus} label="Conserver le statut" />
              <OptionRow checked={preserveExcerpt} onChange={setPreserveExcerpt} label="Conserver l'extrait" />
              <OptionRow checked={migrateFeaturedImage} onChange={setMigrateFeaturedImage} label="Image principale" />
              <OptionRow checked={migrateInlineImages} onChange={setMigrateInlineImages} label="Images du contenu" />
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={postIds.length === 0 || inProgress}
              onClick={() => mut.mutate()}
            >
              <Rocket className="size-4 mr-2" />
              {inProgress ? "Migration en cours…" : `Lancer via REST (${postIds.length})`}
            </Button>
            <ApifyButton postIds={postIds} duplicateStrategy={duplicateStrategy} />
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progression</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {inProgress && (
              <>
                <Progress value={undefined} />
                <p className="text-sm text-muted-foreground">
                  Migration synchrone en cours. Les opérations sont exécutées sur le serveur.
                  La fenêtre ne doit pas être fermée.
                </p>
              </>
            )}
            {result && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Badge variant="outline" className="border-[var(--success)]/40">
                    <CheckCircle2 className="size-3 mr-1" style={{ color: "var(--success)" }} />
                    {result.succeeded} réussis
                  </Badge>
                  {result.failed > 0 && (
                    <Badge variant="outline" className="border-destructive/40">
                      <XCircle className="size-3 mr-1 text-destructive" />
                      {result.failed} échecs
                    </Badge>
                  )}
                  <Badge variant="outline">{result.total} total</Badge>
                </div>
                <ReportList report={result.report} />
                <LogList log={result.log} />
                <Link to="/journal" className="text-sm text-primary inline-flex items-center gap-1">
                  <ScrollText className="size-3" /> Voir le journal complet
                </Link>
              </div>
            )}
            {!result && !inProgress && (
              <p className="text-sm text-muted-foreground">Aucune migration lancée.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OptionRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
      {label}
    </label>
  );
}

function ApifyButton({
  postIds,
  duplicateStrategy,
}: {
  postIds: number[];
  duplicateStrategy: "skip" | "overwrite" | "copy";
}) {
  const run = useServerFn(runSiteBApifyBatch);
  const mut = useMutation({
    mutationFn: () => run({ data: { postIds, duplicateStrategy } }),
    onSuccess: (res) => toast.success(`Apify: ${res.succeeded}/${res.total} publiés`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur Apify"),
  });
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        disabled={postIds.length === 0 || mut.isPending}
        onClick={() => mut.mutate()}
      >
        <Cloud className="size-4 mr-2" />
        {mut.isPending ? "Apify en cours…" : `Publier sur Site B via Apify (${postIds.length})`}
      </Button>
      {mut.data && (
        <div className="rounded-md border border-border max-h-48 overflow-auto text-xs">
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
              {mut.data.results.map((r) => (
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
      )}
    </div>
  );
}


function ReportList({ report }: { report: MigrationReportItem[] }) {
  return (
    <div className="rounded-md border border-border max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 sticky top-0">
          <tr>
            <th className="text-left p-2 font-medium">Slug</th>
            <th className="text-left p-2 font-medium">État</th>
            <th className="text-left p-2 font-medium">Étape</th>
            <th className="text-left p-2 font-medium">HTTP</th>
            <th className="text-left p-2 font-medium">Message</th>
          </tr>
        </thead>
        <tbody>
          {report.map((r) => (
            <tr key={r.sourceId} className="border-t border-border">
              <td className="p-2 font-mono">{r.slug}</td>
              <td className="p-2">{r.ok ? <span style={{ color: "var(--success)" }}>✓</span> : <span className="text-destructive">✗</span>}</td>
              <td className="p-2">{r.step}</td>
              <td className="p-2">{r.httpStatus ?? "—"}</td>
              <td className="p-2 text-muted-foreground">{r.message ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogList({ log }: { log: LogEntry[] }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 max-h-48 overflow-auto p-2 font-mono text-[11px] leading-5">
      {log.slice(-100).map((l, i) => (
        <div key={i} className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-[var(--warning)]" : ""}>
          [{new Date(l.ts).toLocaleTimeString("fr-FR")}] {l.message}
        </div>
      ))}
    </div>
  );
}
