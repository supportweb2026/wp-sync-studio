import { wpUserSchema, type WpUser } from "@/schemas/wordpress";
import { wpFetchAll, type WpAuth } from "./client.server";

export async function listAllUsers(auth: WpAuth): Promise<WpUser[]> {
  const raw = await wpFetchAll<unknown>(auth, "/wp-json/wp/v2/users", {
    context: "edit",
  });
  const out: WpUser[] = [];
  for (const item of raw) {
    const parsed = wpUserSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
