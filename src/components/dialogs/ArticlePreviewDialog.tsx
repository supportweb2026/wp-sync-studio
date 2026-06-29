import { useMemo } from "react";
import DOMPurify from "dompurify";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ComparisonRow } from "@/services/comparison/matcher";
import type { WpPost } from "@/schemas/wordpress";

export function ArticlePreviewDialog({
  row,
  onClose,
}: {
  row: ComparisonRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {row?.source?.title.rendered ?? row?.destination?.title.rendered}
          </DialogTitle>
        </DialogHeader>
        {row && (
          <Tabs defaultValue="rendered" className="flex-1 overflow-hidden flex flex-col">
            <TabsList>
              <TabsTrigger value="rendered">Rendu</TabsTrigger>
              <TabsTrigger value="raw">Brut</TabsTrigger>
              <TabsTrigger value="meta">Métadonnées</TabsTrigger>
            </TabsList>
            <TabsContent value="rendered" className="overflow-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <SideRendered title="Site A" post={row.source} />
                <SideRendered title="Site B" post={row.destination} />
              </div>
            </TabsContent>
            <TabsContent value="raw" className="overflow-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <SideRaw title="Site A" post={row.source} />
                <SideRaw title="Site B" post={row.destination} />
              </div>
            </TabsContent>
            <TabsContent value="meta" className="overflow-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <SideMeta title="Site A" post={row.source} />
                <SideMeta title="Site B" post={row.destination} />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SideHeader({ title, post }: { title: string; post: WpPost | null }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="text-xs uppercase tracking-wide font-medium text-muted-foreground">{title}</div>
      {post && <Badge variant="outline" className="text-[10px]">{post.status}</Badge>}
    </div>
  );
}

function SideRendered({ title, post }: { title: string; post: WpPost | null }) {
  const html = useMemo(() => {
    if (!post) return "";
    return DOMPurify.sanitize(post.content.rendered);
  }, [post]);
  return (
    <div className="border border-border rounded-md p-3">
      <SideHeader title={title} post={post} />
      {post ? (
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-sm text-muted-foreground italic">Absent</p>
      )}
    </div>
  );
}

function SideRaw({ title, post }: { title: string; post: WpPost | null }) {
  return (
    <div className="border border-border rounded-md p-3">
      <SideHeader title={title} post={post} />
      {post ? (
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-[60vh] overflow-auto">
          {post.content.rendered}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground italic">Absent</p>
      )}
    </div>
  );
}

function SideMeta({ title, post }: { title: string; post: WpPost | null }) {
  return (
    <div className="border border-border rounded-md p-3">
      <SideHeader title={title} post={post} />
      {post ? (
        <dl className="text-xs space-y-1">
          <Row k="ID" v={post.id} />
          <Row k="Slug" v={post.slug} />
          <Row k="Date" v={post.date} />
          <Row k="Modifié" v={post.modified ?? "—"} />
          <Row k="Auteur" v={post.author} />
          <Row k="Lien" v={post.link} />
          <Row k="Categories" v={post.categories.join(", ") || "—"} />
          <Row k="Tags" v={post.tags.join(", ") || "—"} />
          <Row k="Featured" v={post.featured_media || "—"} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground italic">Absent</p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground w-24 shrink-0">{k}</dt>
      <dd className="font-mono break-all">{v}</dd>
    </div>
  );
}
