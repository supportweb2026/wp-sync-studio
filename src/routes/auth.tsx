import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connexion — WordPress Sync Manager" },
      { name: "description", content: "Connectez-vous pour gérer vos migrations WordPress." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connecté");
        navigate({ to: "/dashboard" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Compte créé. Vous êtes connecté.");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Si un compte existe, un email de réinitialisation a été envoyé.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="size-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <ArrowLeftRight className="size-5" />
          </div>
          <div className="font-semibold tracking-tight">WP Sync Manager</div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "signin"
                ? "Connexion"
                : mode === "signup"
                  ? "Créer un compte"
                  : "Mot de passe oublié"}
            </CardTitle>
            <CardDescription>
              {mode === "forgot"
                ? "Saisissez votre email pour recevoir un lien de réinitialisation."
                : "Vos identifiants WordPress restent chiffrés côté serveur."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? "..."
                  : mode === "signin"
                    ? "Se connecter"
                    : mode === "signup"
                      ? "Créer le compte"
                      : "Envoyer le lien"}
              </Button>
              <div className="flex flex-col gap-2">
                {mode === "signin" && (
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                    onClick={() => setMode("forgot")}
                  >
                    Mot de passe oublié ?
                  </button>
                )}
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                  onClick={() =>
                    setMode(mode === "signin" ? "signup" : "signin")
                  }
                >
                  {mode === "signin"
                    ? "Pas de compte ? Créer"
                    : mode === "signup"
                      ? "Déjà un compte ? Se connecter"
                      : "Retour à la connexion"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
