import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  LayoutDashboard,
  PlugZap,
  GitCompareArrows,
  Rocket,
  ScrollText,
  LogOut,
  ArrowLeftRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/connections", label: "Connexions", icon: PlugZap },
  { to: "/comparison", label: "Comparaison", icon: GitCompareArrows },
  { to: "/migration", label: "Migration", icon: Rocket },
  { to: "/journal", label: "Journal", icon: ScrollText },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate({ to: "/auth", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-60 border-r border-border bg-sidebar flex flex-col shrink-0">
        <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
          <div className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <ArrowLeftRight className="size-4" />
          </div>
          <div className="font-semibold text-sm">WP Sync Manager</div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {nav.map((n) => {
            const active = pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t border-border">
          <Button variant="ghost" className="w-full justify-start gap-2.5 text-muted-foreground" onClick={signOut}>
            <LogOut className="size-4" /> Déconnexion
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-6 md:p-8 max-w-[1600px] mx-auto">{children}</div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
