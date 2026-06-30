import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { fetchComparison } from "@/lib/wordpress/wp.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArticlePreviewDialog } from "@/components/dialogs/ArticlePreviewDialog";
import { Eye, Rocket, RefreshCw, Search } from "lucide-react";
import type { WpPost } from "@/schemas/wordpress";
import type { ComparisonRow, ComparisonState } from "@/services/comparison/matcher";

export const Route = createFileRoute("/_authenticated/comparison")({
  head: () => ({ meta: [{ title: "Comparaison — WP Sync Manager" }] }),
  component: ComparisonPage,
  errorComponent: ({ error }) => <div className="text-destructive">{error.message}</div>,
  notFoundComponent: () => <div>Introuvable</div>,
});

const stateLabel: Record<ComparisonState, { label: string; color: string }> = {
  identical: { label: "Identique", color: "var(--success)" },
  different: { label: "Différent", color: "var(--warning)" },
  only_on_source: { label: "Absent de B", color: "var(--info)" },
  only_on_destination: { label: "Absent de A", color: "var(--muted-foreground)" },
};

function ComparisonPage() {
  const fetchFn = useServerFn(fetchComparison);
  const cmp = useQuery({
    queryKey: ["comparison"],
    queryFn: () => fetchFn(),
    staleTime: 5 * 60_000,
  });

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [previewRow, setPreviewRow] = useState<ComparisonRow | null>(null);
  const navigate = useNavigate();

  const rows = cmp.data?.rows ?? [];
  const filteredRows = useMemo(() => {
    let r = rows;
    if (stateFilter !== "all") r = r.filter((x) => x.state === stateFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) => {
        const t = (x.source?.title.rendered ?? x.destination?.title.rendered ?? "").toLowerCase();
        const s = (x.source?.slug ?? x.destination?.slug ?? "").toLowerCase();
        return t.includes(q) || s.includes(q);
      });
    }
    return r;
  }, [rows, stateFilter, search]);

  const columns = useMemo<ColumnDef<ComparisonRow>[]>(() => [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
          aria-label="Tout sélectionner"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.original.source}
          onCheckedChange={(v) => row.toggleSelected(Boolean(v))}
          aria-label="Sélectionner"
        />
      ),
      enableSorting: false,
      size: 36,
    },
    {
      accessorFn: (r) => r.source?.title.rendered ?? r.destination?.title.rendered ?? "",
      id: "title",
      header: "Titre",
      cell: ({ row, getValue }) => (
        <div>
          <div className="font-medium text-sm">{getValue() as string}</div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {row.original.source?.slug ?? row.original.destination?.slug}
          </div>
        </div>
      ),
    },
    {
      accessorFn: (r) => r.source?.date ?? r.destination?.date ?? "",
      id: "date",
      header: "Date",
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return <span className="text-xs text-muted-foreground">{v ? new Date(v).toLocaleDateString("fr-FR") : "—"}</span>;
      },
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => {
        const s = row.original.source?.status ?? row.original.destination?.status ?? "—";
        return <Badge variant="outline" className="text-[10px]">{s}</Badge>;
      },
    },
    {
      id: "presence",
      header: "A / B",
      cell: ({ row }) => (
        <div className="flex gap-1.5">
          <Dot ok={Boolean(row.original.source)} />
          <Dot ok={Boolean(row.original.destination)} />
        </div>
      ),
    },
    {
      id: "state",
      header: "État",
      cell: ({ row }) => {
        const info = stateLabel[row.original.state];
        return (
          <Badge variant="outline" style={{ borderColor: info.color, color: info.color }}>
            {info.label}
            {row.original.diffFields.length > 0 && (
              <span className="ml-1 text-[10px] opacity-80">({row.original.diffFields.join(", ")})</span>
            )}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" onClick={() => setPreviewRow(row.original)}>
          <Eye className="size-4" />
        </Button>
      ),
    },
  ], []);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getRowId: (r) => r.key,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
    enableRowSelection: (r) => Boolean(r.original.source),
  });

  function migrateSelected() {
    const ids = Object.keys(selection)
      .map((k) => filteredRows.find((r) => r.key === k))
      .filter((r): r is ComparisonRow => Boolean(r?.source))
      .map((r) => (r.source as WpPost).id);
    if (ids.length === 0) return;
    sessionStorage.setItem("migration:postIds", JSON.stringify(ids));
    navigate({ to: "/migration" });
  }

  const destSource = cmp.data && "destinationSource" in cmp.data ? cmp.data.destinationSource : "none";
  const destError = cmp.data && "destinationError" in cmp.data ? cmp.data.destinationError : null;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comparaison</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {cmp.data ? `${cmp.data.sourceTotal} articles côté A · ${cmp.data.destinationTotal} côté B` : "Chargement…"}
            {destSource === "cache" && (
              <span className="ml-2 text-amber-600">(Site B lu depuis le cache local : Apify indisponible{destError ? ` — ${destError}` : ""})</span>
            )}
            {destSource === "none" && cmp.data && !("notConfigured" in cmp.data && cmp.data.notConfigured) && (
              <span className="ml-2 text-amber-600">(aucune donnée Site B disponible{destError ? ` — ${destError}` : ""})</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => cmp.refetch()} disabled={cmp.isFetching}>
            <RefreshCw className={`size-4 mr-1.5 ${cmp.isFetching ? "animate-spin" : ""}`} />
            Recharger
          </Button>
          <Button onClick={migrateSelected} disabled={Object.keys(selection).length === 0}>
            <Rocket className="size-4 mr-1.5" />
            Migrer ({Object.keys(selection).length})
          </Button>
        </div>
      </header>


      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b border-border flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Rechercher titre ou slug…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les états</SelectItem>
                <SelectItem value="identical">Identique</SelectItem>
                <SelectItem value="different">Différent</SelectItem>
                <SelectItem value="only_on_source">Absent de B</SelectItem>
                <SelectItem value="only_on_destination">Absent de A</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cmp.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : cmp.error ? (
            <div className="p-6 text-sm text-destructive">{(cmp.error as Error).message}</div>
          ) : cmp.data && "notConfigured" in cmp.data && cmp.data.notConfigured ? (
            <div className="p-6 text-sm text-muted-foreground">
              Configurez les connexions Site A et Site B dans{" "}
              <a href="/connections" className="underline text-foreground">Connexions</a> pour lancer la comparaison.
            </div>
          ) : (

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((h) => (
                        <th
                          key={h.id}
                          className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground cursor-pointer select-none"
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-muted/30">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2 align-middle">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.getRowModel().rows.length === 0 && (
                    <tr><td colSpan={columns.length} className="text-center py-8 text-muted-foreground text-sm">Aucun résultat</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <div>
              {table.getFilteredRowModel().rows.length} résultats ·{" "}
              {Object.keys(selection).length} sélectionné(s)
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                Précédent
              </Button>
              <span>
                Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
              </span>
              <Button size="sm" variant="ghost" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                Suivant
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ArticlePreviewDialog row={previewRow} onClose={() => setPreviewRow(null)} />
    </div>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block size-2.5 rounded-full"
      style={{ backgroundColor: ok ? "var(--success)" : "oklch(0.85 0.01 260)" }}
    />
  );
}
