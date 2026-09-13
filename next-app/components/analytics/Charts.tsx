// Gráficos livianos sin dependencias (server components puros).

export function KpiCard({
  titulo,
  valor,
  sub,
}: {
  titulo: string;
  valor: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-500">{titulo}</p>
      <p className="mt-1 text-3xl font-bold text-slate-800">{valor}</p>
      {sub && <p className="mt-0.5 text-sm text-slate-400">{sub}</p>}
    </div>
  );
}

export function BarList({
  titulo,
  data,
}: {
  titulo: string;
  data: { label: string; value: number; sub?: string }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-base font-semibold text-slate-700">{titulo}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400">Sin datos.</p>
      ) : (
        <div className="space-y-2.5">
          {data.map((d) => (
            <div key={d.label}>
              <div className="mb-0.5 flex justify-between text-sm">
                <span className="font-medium text-slate-700">{d.label}</span>
                <span className="text-slate-500">{d.sub ?? d.value}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${(d.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ColumnChart({
  titulo,
  data,
}: {
  titulo: string;
  data: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-base font-semibold text-slate-700">{titulo}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400">Sin datos.</p>
      ) : (
        <div className="flex h-44 items-end gap-1.5 overflow-x-auto">
          {data.map((d) => (
            <div key={d.label} className="flex min-w-8 flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-xs text-slate-500">{d.value}</span>
              <div
                className="w-full rounded-t bg-blue-500"
                style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
                title={`${d.label}: ${d.value}`}
              />
              <span className="mt-1 truncate text-[10px] text-slate-400">{d.label.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
