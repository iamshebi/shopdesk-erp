import { q } from "@/lib/db";
import { getUser, can } from "@/lib/auth";
import { FILE_KINDS } from "@/lib/files";
import { fmtDate } from "@/lib/util";
import Submit from "./submit";
import { uploadFiles, deleteFile, makeMainImage } from "@/app/(app)/files-actions";

export default async function Attachments({ kind, ownerId, back, title }: { kind: string; ownerId: number; back: string; title?: string }) {
  const cfg = FILE_KINDS[kind];
  const user = await getUser();
  const edit = !!user && can(user, cfg.perm);
  const files = await q<any>("SELECT id, name, mime, size, created_at FROM files WHERE kind=$1 AND owner_id=$2 ORDER BY sort, id", [kind, ownerId]);
  return (
    <div className="card p-5">
      <h3 className="mb-3 font-semibold">{title ?? cfg.label} <span className="text-sm font-normal text-slate-400">{files.length}</span></h3>
      {cfg.images ? (
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f, i) => (
            <div key={f.id} className="group relative overflow-hidden rounded-xl border border-slate-200">
              <a href={`/api/files/${f.id}`} target="_blank"><img src={`/api/files/${f.id}`} alt={f.name} className="aspect-square w-full object-cover" /></a>
              {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">Main</span>}
              {edit && <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-1 opacity-0 transition group-hover:opacity-100">
                {i > 0 ? <form action={makeMainImage}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="back" value={back} /><button className="text-[10px] text-white">Make main</button></form> : <span />}
                <form action={deleteFile}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="back" value={back} /><button className="text-[10px] text-red-200">Delete</button></form>
              </div>}
            </div>
          ))}
        </div>
      ) : (
        <ul className="mb-3 space-y-1 text-sm">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <a href={`/api/files/${f.id}`} target="_blank" className="truncate text-accent hover:underline">{f.name}</a>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">{Math.ceil(f.size / 1024)} KB · {fmtDate(f.created_at)}
                {edit && <form action={deleteFile}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="back" value={back} /><Submit className="text-red-500" confirm={`Delete ${f.name}?`}>×</Submit></form>}</span>
            </li>
          ))}
          {files.length === 0 && <li className="text-slate-400">Nothing attached</li>}
        </ul>
      )}
      {edit && (
        <form action={uploadFiles} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="owner_id" value={ownerId} /><input type="hidden" name="back" value={back} />
          <input type="file" name="files" multiple accept={cfg.images ? "image/*" : undefined} className="text-xs" />
          <Submit className="btn-ghost btn-sm">Upload</Submit>
          <span className="text-xs text-slate-400">max 3 MB each</span>
        </form>
      )}
    </div>
  );
}
