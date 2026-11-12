import Link from "next/link";

export function PageHeader(props: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
        {props.subtitle && <p className="mt-1 text-sm text-slate-500">{props.subtitle}</p>}
      </div>
      {props.children && <div className="flex flex-wrap gap-2">{props.children}</div>}
    </div>
  );
}

export function Stat(props: { label: string; value: string; hint?: string; href?: string }) {
  const inner = (
    <div className="card h-full p-5 transition hover:shadow-md">
      <div className="text-xs font-medium text-slate-500">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{props.value}</div>
      {props.hint && <div className="mt-1 text-xs text-slate-400">{props.hint}</div>}
    </div>
  );
  return props.href ? <Link href={props.href}>{inner}</Link> : inner;
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-sky-50 text-sky-700",
  slate: "bg-slate-100 text-slate-600",
  violet: "bg-violet-50 text-violet-700",
};

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES | string; children: React.ReactNode }) {
  return <span className={`badge ${TONES[tone] ?? TONES.slate}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-14 text-center text-sm text-slate-400">{children}</div>;
}

export function Field(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={props.className}>
      <label className="label">{props.label}</label>
      {props.children}
    </div>
  );
}

export function repairTone(status: string) {
  return (
    { received: "slate", diagnosing: "blue", waiting_parts: "amber", in_progress: "violet", ready: "green", delivered: "slate", cancelled: "red" } as Record<
      string,
      string
    >
  )[status] ?? "slate";
}
