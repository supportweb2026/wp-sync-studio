import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteConnection,
  listConnections,
  saveConnection,
  testConnectionRole,
  type PublicConnection,
} from "@/lib/wordpress/wp.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, RefreshCw, Trash2, Save, Cloud, Globe, Info } from "lucide-react";
import { toast } from "sonner";
import type { ApifyCapabilities, Capabilities } from "@/schemas/wordpress";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({ meta: [{ title: "Connexions — WP Sync Manager" }] }),
  component: ConnectionsPage,
  errorComponent: ({ error }) => <div className="text-destructive">{error.message}</div>,
  notFoundComponent: () => <div>Introuvable</div>,
});

function isApify(caps: Capabilities | ApifyCapabilities | null | undefined): caps is ApifyCapabilities {
  return !!caps && "kind" in caps && caps.kind === "apify";
}
function isRest(caps: Capabilities | ApifyCapabilities | null | undefined): caps is Capabilities {
  return !!caps && !("kind" in caps);
}

function ConnectionsPage() {
  const list = useServerFn(listConnections);
  const conns = useQuery({ queryKey: ["connections"], queryFn: () => list() });

  const src = conns.data?.find((c) => c.role === "source");
  const dst = conns.data?.find((c) => c.role === "destination");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Connexions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deux modes distincts : Site A est lu via l'API REST WordPress, Site B est piloté via Apify (back-office WP).
        </p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SourceForm current={src} />
        <DestinationForm current={dst} />
      </div>
    </div>
  );
}

function SourceForm({ current }: { current?: PublicConnection }) {
  const qc = useQueryClient();
  const save = useServerFn(saveConnection);
  const test = useServerFn(testConnectionRole);
  const remove = useServerFn(deleteConnection);

  const [siteUrl, setSiteUrl] = useState(current?.siteUrl ?? "");
  const [username, setUsername] = useState(current?.username ?? "");
  const [appPassword, setAppPassword] = useState("");

  const saveMut = useMutation({
    mutationFn: () =>
      save({ data: { role: "source", credentials: { siteUrl, username, appPassword } } }),
    onSuccess: () => {
      toast.success("Site A enregistré");
      setAppPassword("");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const testMut = useMutation({
    mutationFn: () => test({ data: { role: "source" } }),
    onSuccess: () => { toast.success("Test REST OK"); qc.invalidateQueries({ queryKey: ["connections"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const deleteMut = useMutation({
    mutationFn: () => remove({ data: { role: "source" } }),
    onSuccess: () => {
      toast.success("Site A supprimé");
      setSiteUrl(""); setUsername(""); setAppPassword("");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  const caps = isRest(current?.capabilities) ? current?.capabilities : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          Site A — source (REST)
        </CardTitle>
        <CardDescription>
          {current
            ? `Dernier test : ${current.lastTestedAt ? new Date(current.lastTestedAt).toLocaleString("fr-FR") : "jamais"}`
            : "Le mot de passe d'application WordPress est requis pour lire les articles via /wp-json."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}>
          <Field label="URL du site">
            <Input type="url" required placeholder="https://site-a.example" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Utilisateur">
              <Input required value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Mot de passe d'application">
              <Input
                type="password"
                placeholder={current ? "•••• (vide = inchangé)" : "xxxx xxxx xxxx xxxx"}
                required={!current}
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
              />
            </Field>
          </div>
          <Actions
            saving={saveMut.isPending}
            current={!!current}
            disabled={!appPassword && !current}
            onTest={() => testMut.mutate()}
            testing={testMut.isPending}
            onDelete={() => deleteMut.mutate()}
          />
        </form>
        {caps && <RestCapabilityReport caps={caps} />}
      </CardContent>
    </Card>
  );
}

function DestinationForm({ current }: { current?: PublicConnection }) {
  const qc = useQueryClient();
  const save = useServerFn(saveConnection);
  const test = useServerFn(testConnectionRole);
  const remove = useServerFn(deleteConnection);

  const [siteUrl, setSiteUrl] = useState(current?.siteUrl ?? "");
  const [username, setUsername] = useState(current?.username ?? "");
  const [appPassword, setAppPassword] = useState("");
  const [loginPath, setLoginPath] = useState(current?.loginPath ?? "/wp-admin");

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          role: "destination",
          credentials: { siteUrl, username, appPassword, loginPath },
        },
      }),
    onSuccess: () => {
      toast.success("Site B enregistré et login testé via Apify");
      setAppPassword("");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const testMut = useMutation({
    mutationFn: () => test({ data: { role: "destination" } }),
    onSuccess: () => { toast.success("Test login Apify déclenché"); qc.invalidateQueries({ queryKey: ["connections"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const deleteMut = useMutation({
    mutationFn: () => remove({ data: { role: "destination" } }),
    onSuccess: () => {
      toast.success("Site B supprimé");
      setSiteUrl(""); setUsername(""); setAppPassword(""); setLoginPath("/wp-admin");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  const caps = isApify(current?.capabilities) ? current?.capabilities : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="size-4 text-muted-foreground" />
          Site B — destination (Apify)
        </CardTitle>
        <CardDescription>
          Site protégé par Sucuri : pas d'API REST. Un Actor Apify se connecte au back-office pour publier.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="size-4" />
          <AlertDescription className="text-xs">
            Saisissez le compte <strong>administrateur WordPress</strong> classique (pas un mot de passe d'application).
            Le test déclenche un mini-run Apify qui vérifie le login.
          </AlertDescription>
        </Alert>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}>
          <Field label="URL du site">
            <Input type="url" required placeholder="https://site-b.example" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Utilisateur admin">
              <Input required value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Mot de passe admin">
              <Input
                type="password"
                placeholder={current ? "•••• (vide = inchangé)" : "Mot de passe WordPress"}
                required={!current}
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Chemin de connexion">
            <Input value={loginPath} onChange={(e) => setLoginPath(e.target.value)} placeholder="/wp-admin" />
          </Field>
          <Actions
            saving={saveMut.isPending}
            current={!!current}
            disabled={!appPassword && !current}
            onTest={() => testMut.mutate()}
            testing={testMut.isPending}
            onDelete={() => deleteMut.mutate()}
          />
        </form>
        {caps && <ApifyCapabilityReport caps={caps} />}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Actions({ saving, current, disabled, onTest, testing, onDelete }: { saving: boolean; current: boolean; disabled: boolean; onTest: () => void; testing: boolean; onDelete: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={saving || disabled}>
        <Save className="size-4 mr-1.5" />
        {saving ? "..." : "Enregistrer & tester"}
      </Button>
      {current && (
        <>
          <Button type="button" variant="outline" disabled={testing} onClick={onTest}>
            <RefreshCw className={`size-4 mr-1.5 ${testing ? "animate-spin" : ""}`} />
            Re-tester
          </Button>
          <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="size-4 mr-1.5" />
            Supprimer
          </Button>
        </>
      )}
    </div>
  );
}

function RestCapabilityReport({ caps }: { caps: Capabilities }) {
  const checks: Array<[string, boolean | null, string?]> = [
    ["API accessible", caps.reachable],
    ["Authentification", Boolean(caps.user)],
    ["Lecture articles", caps.totalPosts !== null, `${caps.totalPosts ?? "?"} articles`],
    ["Lecture catégories", caps.totalCategories !== null, `${caps.totalCategories ?? "?"} catégories`],
    ["Lecture tags", caps.totalTags !== null, `${caps.totalTags ?? "?"} tags`],
    ["Édition d'articles", caps.canEditPosts],
    ["Publication", caps.canPublishPosts],
    ["Upload média", caps.canUploadFiles],
  ];
  return <Report title="Rapport REST" rows={checks} errors={caps.errors} />;
}

function ApifyCapabilityReport({ caps }: { caps: ApifyCapabilities }) {
  const checks: Array<[string, boolean | null, string?]> = [
    ["Login WordPress", caps.loginOk],
    ["Dashboard accessible", caps.dashboardReachable],
  ];
  return <Report title={`Rapport Apify${caps.runId ? ` · run ${caps.runId}` : ""}`} rows={checks} errors={caps.errors} />;
}

function Report({ title, rows, errors }: { title: string; rows: Array<[string, boolean | null, string?]>; errors: string[] }) {
  return (
    <div className="rounded-md border border-border p-3 bg-muted/30 space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      {rows.map(([label, ok, hint]) => (
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
      {errors.length > 0 && (
        <div className="pt-2 mt-2 border-t border-border space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="text-xs text-destructive">⚠ {e}</div>
          ))}
        </div>
      )}
    </div>
  );
}
