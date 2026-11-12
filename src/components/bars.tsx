// Tiny dependency-free bar chart (server-rendered SVG).
export default function Bars({ data, height = 160 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 4);
          return (
            <rect key={i} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={Math.max(h, d.value > 0 ? 1 : 0)} rx={0.8} className="fill-accent" opacity={i === data.length - 1 ? 1 : 0.55}>
              <title>{`${d.label}: ${d.value.toFixed(2)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-2 flex text-[10px] text-slate-400">
        {data.map((d, i) => <div key={i} className="text-center" style={{ width: `${w}%` }}>{i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? d.label : ""}</div>)}
      </div>
    </div>
  );
}
