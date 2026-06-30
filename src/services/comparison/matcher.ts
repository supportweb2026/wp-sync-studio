import type { WpPost } from "@/schemas/wordpress";
import { contentHash, normalizeTitle } from "./hash";

export type ComparisonState =
  | "identical"
  | "different"
  | "only_on_source"
  | "only_on_destination";

export interface ComparisonRow {
  key: string;
  state: ComparisonState;
  source: WpPost | null;
  destination: WpPost | null;
  diffFields: string[];
}

export async function buildComparison(
  sourcePosts: WpPost[],
  destinationPosts: WpPost[],
): Promise<ComparisonRow[]> {
  const dstBySlug = new Map<string, WpPost>();
  const dstByTitle = new Map<string, WpPost>();
  const dstByLink = new Map<string, WpPost>();
  for (const p of destinationPosts) {
    dstBySlug.set(p.slug, p);
    dstByTitle.set(normalizeTitle(p.title.rendered), p);
    dstByLink.set(p.link, p);
  }

  const matchedDst = new Set<number>();
  const rows: ComparisonRow[] = [];

  for (const s of sourcePosts) {
    let d =
      dstBySlug.get(s.slug) ??
      dstByTitle.get(normalizeTitle(s.title.rendered)) ??
      dstByLink.get(s.link) ??
      null;

    if (!d) {
      rows.push({
        key: `s-${s.id}`,
        state: "only_on_source",
        source: s,
        destination: null,
        diffFields: [],
      });
      continue;
    }
    matchedDst.add(d.id);

    const diff: string[] = [];
    if (normalizeTitle(s.title.rendered) !== normalizeTitle(d.title.rendered))
      diff.push("titre");
    // Si la destination ne fournit pas de contenu (lecture Apify minimaliste),
    // on n'évalue pas la diff contenu / extrait.
    const destHasContent = Boolean((d.content?.rendered ?? "").trim());
    if (destHasContent) {
      const [hs, hd] = await Promise.all([
        contentHash(s.content.rendered),
        contentHash(d.content.rendered),
      ]);
      if (hs !== hd) diff.push("contenu");
      if (
        (s.excerpt.rendered || "").trim() !==
        (d.excerpt.rendered || "").trim()
      )
        diff.push("extrait");
    }
    if (s.status !== d.status) diff.push("statut");


    rows.push({
      key: `m-${s.id}-${d.id}`,
      state: diff.length === 0 ? "identical" : "different",
      source: s,
      destination: d,
      diffFields: diff,
    });
  }

  for (const d of destinationPosts) {
    if (matchedDst.has(d.id)) continue;
    rows.push({
      key: `d-${d.id}`,
      state: "only_on_destination",
      source: null,
      destination: d,
      diffFields: [],
    });
  }

  return rows;
}
