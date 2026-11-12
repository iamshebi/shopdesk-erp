"use client";
import { useState } from "react";

export default function LogoInput({ initial }: { initial: string }) {
  const [logo, setLogo] = useState(initial);
  async function onFile(f: File) {
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await img.decode();
    const max = 400;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    setLogo(c.toDataURL("image/png"));
  }
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1" /> : <span className="text-xs text-slate-400">No logo</span>}
      </div>
      <div className="space-x-2">
        <label className="btn-ghost btn-sm">
          Upload logo
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {logo && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setLogo("")}>
            Remove
          </button>
        )}
      </div>
      <input type="hidden" name="logo" value={logo} />
    </div>
  );
}
