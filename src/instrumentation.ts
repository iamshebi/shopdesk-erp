/** Records server errors so the owner can see them in Settings → System. */
export async function onRequestError(err: unknown, request: { path?: string; method?: string }) {
  try {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const e = err as { message?: string; stack?: string; digest?: string };
    if (String(e?.digest ?? "").startsWith("NEXT_")) return; // redirects / not-found are not errors
    const { q } = await import("./lib/db");
    await q("INSERT INTO error_log (source, message, detail, path) VALUES ('server',$1,$2,$3)", [String(e?.message ?? err).slice(0, 500), String(e?.stack ?? "").slice(0, 2000), `${request?.method ?? ""} ${request?.path ?? ""}`.slice(0, 300)]);
  } catch { /* never let logging break a request */ }
}
