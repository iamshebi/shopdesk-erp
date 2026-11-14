import { one } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { FILE_KINDS } from "@/lib/files";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await one<any>("SELECT kind, name, mime, data FROM files WHERE id=$1", [Number(id)]);
  if (!f) return new Response("Not found", { status: 404 });
  if (!FILE_KINDS[f.kind]?.public && !(await getUser())) return new Response("Sign in required", { status: 401 });
  const inline = /^(image\/|application\/pdf)/.test(f.mime) && new URL(req.url).searchParams.get("download") !== "1";
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(f.name)}"`,
      "Cache-Control": FILE_KINDS[f.kind]?.public ? "public, max-age=86400" : "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
