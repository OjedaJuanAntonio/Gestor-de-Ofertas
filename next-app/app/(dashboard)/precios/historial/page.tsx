import { getHistoricoPrecios } from "@/lib/data/precios";

export const metadata = { title: "Historial de carga · Precios" };

const fmt = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(d))
    : "—";

function qs(params: { q?: string | null; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return s ? `?${s}` : "?";
}

export default async function HistorialPreciosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = (sp.q ?? "").trim();
  const data = await getHistoricoPrecios({ page, q: q || undefined });

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Historial de carga</h1>
      <p className="mb-4 text-base text-slate-600">
        Ítems que ya cargaste en el ERP. {data.total} en total.
      </p>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por farmacia, laboratorio, producto, EAN o código…"
          aria-label="Buscar"
          className="h-10 w-full max-w-md rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
        />
        <button
          type="submit"
          className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Buscar
        </button>
        {q && (
          <a
            href="?"
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Limpiar
          </a>
        )}
      </form>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-lg text-slate-500">
          {q ? "No hay ítems que coincidan con la búsqueda." : "Todavía no cargaste ítems en el sistema."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
                  <th className="px-4 py-3">Cargado</th>
                  <th className="px-4 py-3">Solicitud</th>
                  <th className="px-4 py-3">Farmacia</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Laboratorio</th>
                  <th className="px-4 py-3 text-center">Cant.</th>
                  <th className="px-4 py-3">EAN</th>
                  <th className="px-4 py-3">Condición</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-600">{fmt(it.fechaCargaERP)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{it.solicitudCodigo}</td>
                    <td className="px-4 py-3 text-slate-700">{it.farmaciaNombre}</td>
                    <td className="px-4 py-3 text-slate-800">{it.descripcion}</td>
                    <td className="px-4 py-3 text-slate-600">{it.laboratorio}</td>
                    <td className="px-4 py-3 text-center font-semibold">{it.cantidad}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{it.codigoBarra}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded bg-green-100 px-2 py-0.5 font-semibold text-green-800">
                        {it.condicionAutorizada ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.pages > 1 && (
            <div className="mt-4 flex items-center gap-2 text-base">
              <a
                href={qs({ q, page: data.page - 1 })}
                className={`rounded-md border px-3 py-1.5 ${
                  data.page <= 1
                    ? "pointer-events-none border-slate-200 text-slate-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                ← Anterior
              </a>
              <span className="text-slate-500">
                Página {data.page} de {data.pages}
              </span>
              <a
                href={qs({ q, page: data.page + 1 })}
                className={`rounded-md border px-3 py-1.5 ${
                  data.page >= data.pages
                    ? "pointer-events-none border-slate-200 text-slate-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Siguiente →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
