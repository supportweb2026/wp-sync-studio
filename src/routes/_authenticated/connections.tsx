import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteConnection,
  listConnections,
  saveConnection,
  testConnectionRole,
} from "@/lib/wordpress/wp.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RefreshCw, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import type { Capabilities, Role } from "@/schemas/wordpress";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({ meta: [{ title: "Connexions — WP Sync Manager" }] }),
  component: ConnectionsPage,
  errorComponent: ({ error }) => <div className="text-destructive">{error.message}</div>,
  notFoundComponent: () => <div>Introuvable</div>,
});

function ConnectionsPage() {
  const list = useServerFn(listConnections);
  const conns = useQuery({ queryKey: ["connections"], queryFn: () => list() });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Connexions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez vos deux sites WordPress. Le mot de passe d'application est chiffré côté serveur.
        </p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ConnectionForm role="source" title="Site source (A)" current={conns.data?.find((c) => c.role === "source")} />
        <ConnectionForm role="destination" title="Site destination (B)" current={conns.data?.find((c) => c.role === "destination")} />
      </div>
    </div>
  );
}

interface CurrentConn {
  id: string;
  siteUrl: string;
  username: string;
  lastTestedAt: string | null;
  capabilities: Capabilities | null;
}

function ConnectionForm({ role, title, current }: { role: Role; title: string; current?: CurrentConn }) {
  const qc = useQueryClient();
  const save = useServerFn(saveConnection);
  const test = useServerFn(testConnectionRole);
  const remove = useServerFn(deleteConnection);

  const [siteUrl, setSiteUrl] = useState(current?.siteUrl ?? "");
  const [username, setUsername] = useState(current?.username ?? "");
  const [appPassword, setAppPassword] = useState("");

  const saveMut = useMutation({
    mutationFn: () =>
      save({ data: { role, credentials: { siteUrl, username, appPassword } } }),
    onSuccess: () => {
      toast.success("Connexion enregistrée");
      setAppPassword("");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const testMut = useMutation({
    mutationFn: () => test({ data: { role } }),
    onSuccess: () => {
      toast.success("Test réalisé");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const deleteMut = useMutation({
    mutationFn: () => remove({ data: { role } }),
    onSuccess: () => {
      toast.success("Connexion supprimée");
      setSiteUrl(""); setUsername(""); setAppPassword("");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {current
            ? `Dernier test : ${current.lastTestedAt ? new Date(current.lastTestedAt).toLocaleString("fr-FR") : "jamais"}`
            : "Saisissez l'URL et un mot de passe d'application WordPress."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}
        >
          <div className="space-y-1.5">
            <Label>URL du site</Label>
            <Input
              type="url"
              placeholder="https://example.com"
              required
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Utilisateur</Label>
              <Input required value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mot de passe d'application</Label>
              <Input
                type="password"
                placeholder={current ? "•••• (laisser vide pour ne pas changer)" : "xxxx xxxx xxxx xxxx"}
                required={!current}
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saveMut.isPending || (!appPassword && !current)}>
              <Save className="size-4 mr-1.5" />
              {saveMut.isPending ? "..." : "Enregistrer & tester"}
            </Button>
            {current && (
              <>
                <Button type="button" variant="outline" disabled={testMut.isPending} onClick={() => testMut.mutate()}>
                  <RefreshCw className={`size-4 mr-1.5 ${testMut.isPending ? "animate-spin" : ""}`} />
                  Re-tester
                </Button>
                <Button type="button" variant="ghost" className="text-destructive" onClick={() => deleteMut.mutate()}>
                  <Trash2 className="size-4 mr-1.5" />
                  Supprimer
                </Button>
              </>
            )}
          </div>
        </form>

        {current?.capabilities && <CapabilityReport caps={current.capabilities} />}
      </CardContent>
    </Card>
  );
}

function CapabilityReport({ caps }: { caps: Capabilities }) {
  const checks: Array<[string, boolean | null, string?]> = [
    ["API accessible", caps.reachable],
    ["Authentification", Boolean(caps.user)],
    ["Lecture articles", caps.totalPosts !== null, `${caps.totalPosts ?? "?"} articles`],
    ["Lecture catégories", caps.totalCategories !== null, `${caps.totalCategories ?? "?"} catégories`],
    ["Lecture tags", caps.totalTags !== null, `${caps.totalTags ?? "?"} tags`],
    ["Édition d'articles", caps.canEditPosts],
    ["Publication", caps.canPublishPosts],
    ["Gestion catégories", caps.canManageCategories],
    ["Upload média", caps.canUploadFiles],
  ];
  return (
    <div className="rounded-md border border-border p-3 bg-muted/30 space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
        Rapport
      </div>
      {checks.map(([label, ok, hint]) => (
        <div key={label} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            {ok ? (
              <CheckCircle2 className="size-3.5" style={{ color: "var(--success)" }} />
            ) : (
              <XCircle className="size-3.5 text-destructive" />
            )}
            {label}
          </span>
          {hint && <Badge variant="outline" className="font-mono text-[10px]">{hint}</Badge>}
        </div>
      ))}
      {caps.errors.length > 0 && (
        <div className="pt-2 mt-2 border-t border-border space-y-1">
          {caps.errors.map((e, i) => (
            <div key={i} className="text-xs text-destructive">⚠ {e}</div>
          ))}
        </div>
      )}
    </div>
  );
}
