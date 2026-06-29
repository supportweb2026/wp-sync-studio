import { wpTermSchema, type WpTerm } from "@/schemas/wordpress";
import { wpFetchAll, wpRequest, type WpAuth } from "./client.server";

export type TaxonomyKind = "categories" | "tags";

export async function listAllTerms(
  auth: WpAuth,
  kind: TaxonomyKind,
): Promise<WpTerm[]> {
  const raw = await wpFetchAll<unknown>(
    auth,
    `/wp-json/wp/v2/${kind}`,
    { context: "edit", hide_empty: false },
  );
  const out: WpTerm[] = [];
  for (const item of raw) {
    const parsed = wpTermSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function findOrCreateTerm(
  auth: WpAuth,
  kind: TaxonomyKind,
  source: WpTerm,
): Promise<number> {
  // search by slug
  const search = await wpRequest<unknown>(
    auth,
    `/wp-json/wp/v2/${kind}`,
    { query: { slug: source.slug, context: "edit" } },
  );
  if (Array.isArray(search.data) && search.data.length > 0) {
    const found = wpTermSchema.safeParse(search.data[0]);
    if (found.success) return found.data.id;
  }
  const created = await wpRequest<unknown>(
    auth,
    `/wp-json/wp/v2/${kind}`,
    {
      method: "POST",
      body: { name: source.name, slug: source.slug, description: source.description },
    },
  );
  return wpTermSchema.parse(created.data).id;
}
