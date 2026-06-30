import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { listSourcePosts, type SourceArticleRow } from "@/lib/wordpress/wp.functions";
import { runSiteBApifyBatch } from "@/lib/site-b/apify-batch.functions";
import { getApifyActorStatus } from "@/lib/site-b/apify.functions";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Cloud, ExternalLink, Image as ImageIcon, Info, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/comparison")({
  head: () => ({ meta: [{ title: "Articles Site A — WP Sync Manager" }] }),
  component: ArticlesPage,
  errorComponent: ({ error }) => <div className="text-destructive">{error.message}</div>,
  notFoundComponent: () => <div>Introuvable</div>,
});

function ArticlesPage() {
  const listFn = useServerFn(listSourcePosts);
  const statusFn = useServerFn(getApifyActorStatus);
  const runBatch = useServerFn(runSiteBApifyBatch);
  const qc = useQueryClient();

  const articles = useQuery({
    queryKey: ["source-posts"],
    queryFn: () => listFn(),
    staleTime: 5 * 60_000,
  });
  const status = useQuery({
    queryKey: ["apify-actor-status"],
    queryFn: () => statusFn(),
  });

  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "overwrite" | "copy">("skip");

  const rows: SourceArticleRow[] = articles.data && "posts" in articles.data ? articles.data.posts : [];
  const notConfigured = articles.data && "notConfigured" in articles.data && articles.data.notConfigured;

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const mut = useMutation({
    mutationFn: (postIds: number[]) =>
      runBatch({ data: { postIds, duplicateStrategy } }),
    onSuccess: (res) => {
      toast.success(`Site B : ${res.succeeded}/${res.total} publié(s)`);
      qc.invalidateQueries({ queryKey: ["site-b-publications"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur de publication"),
  });

  const columns = useMemo<ColumnDef<SourceArticleRow>[]>(() => [
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
          onCheckedChange={(v) => row.toggleSelected(Boolean(v))}
          aria-label="Sélectionner"
        />
      ),
      enableSorting: false,
      size: 36,
    },
    {
      id: "image",
      header: "",
      cell: ({ row }) => row.original.featuredImageUrl ? (
        <img
          src={row.original.featuredImageUrl}
          alt=""
          className="size-10 rounded object-cover border border-border"
          loading="lazy"
        />
      ) : (
        <div className="size-10 rounded border border-dashed border-border grid place-items-center text-muted-foreground">
          <ImageIcon className="size-4" />
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "title",
      header: "Titre",
      cell: ({ row }) => (
        <div className="max-w-md">
          <div className="font-medium text-sm" dangerouslySetInnerHTML={{ __html: row.original.title }} />
          <div className="font-mono text-[11px] text-muted-foreground">{row.original.slug}</div>
        </div>
      ),
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return <span className="text-xs text-muted-foreground">{v ? new Date(v).toLocaleDateString("fr-FR") : "—"}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: ({ getValue }) => <Badge variant="outline" className="text-[10px]">{getValue() as string}</Badge>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 justify-end">
          <a
            href={row.original.link}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="Voir sur Site A"
          >
            <ExternalLink className="size-4" />
          </a>
          <Button
            size="sm"
            variant="outline"
            disabled={!status.data?.ready || mut.isPending}
            onClick={() => mut.mutate([row.original.id])}
          >
            <Cloud className="size-3.5 mr-1" />
            Publier sur B
          </Button>
        </div>
      ),
      enableSorting: false,
    },
  ], [mut, status.data]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getRowId: (r) => String(r.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const selectedIds = Object.keys(selection).map(Number).filter((n) => !Number.isNaN(n));

  function publishSelection() {
    if (selectedIds.length === 0) return;
    mut.mutate(selectedIds);
  }
  function publishAll() {
    if (filteredRows.length === 0) return;
    mut.mutate(filteredRows.map((r) => r.id));
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Articles Site A</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {articles.data && "total" in articles.data
              ? `${articles.data.total} article(s) lus depuis Site A via REST.`
              : "Chargement…"}
          </p>
        </div>
        <Button variant="outline" onClick={() => articles.refetch()} disabled={articles.isFetching}>
          <RefreshCw className={`size-4 mr-1.5 ${articles.isFetching ? "animate-spin" : ""}`} />
          Recharger
        </Button>
      </header>

      <Alert>
        <Info className="size-4" />
        <AlertDescription>
          Cochez les articles puis cliquez « Publier la sélection sur Site B ».
          Chaque article est envoyé via Apify : connexion admin WordPress, création de l'article, upload de l'image à la une.
          L'auteur n'est pas modifié côté Site B.
        </AlertDescription>
      </Alert>

      {!status.data?.ready && (
        <Alert variant="destructive">
          <AlertDescription>{status.data?.message ?? "Vérification de la configuration Apify…"}</AlertDescription>
        </Alert>
      )}

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
            <div className="flex items-center gap-2 ml-auto">
              <Select value={duplicateStrategy} onValueChange={(v) => setDuplicateStrategy(v as "skip" | "overwrite" | "copy")}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Si doublon : ignorer</SelectItem>
                  <SelectItem value="overwrite">Si doublon : écraser</SelectItem>
                  <SelectItem value="copy">Si doublon : créer copie</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={publishSelection}
                disabled={selectedIds.length === 0 || !status.data?.ready || mut.isPending}
              >
                <Cloud className="size-4 mr-1.5" />
                Publier la sélection ({selectedIds.length})
              </Button>
              <Button
                variant="outline"
                onClick={publishAll}
                disabled={filteredRows.length === 0 || !status.data?.ready || mut.isPending}
                title="Publie tous les articles filtrés"
              >
                Tout publier
              </Button>
            </div>
          </div>

          {articles.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : articles.error ? (
            <div className="p-6 text-sm text-destructive">{(articles.error as Error).message}</div>
          ) : notConfigured ? (
            <div className="p-6 text-sm text-muted-foreground">
              Configurez Site A (source) dans{" "}
              <a href="/connections" className="underline text-foreground">Connexions</a>.
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
              {table.getFilteredRowModel().rows.length} résultats · {selectedIds.length} sélectionné(s)
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
    </div>
  );
}
