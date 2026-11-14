import { one } from "@/lib/db";
import { getUser } from "@/lib/auth";
export async function GET() {
  const u = await getUser();
  if (!u) return Response.json({ unread: 0 }, { status: 401 });
  const r = await one<{ n: number }>("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL", [u.id]);
  return Response.json({ unread: r?.n ?? 0 });
}
