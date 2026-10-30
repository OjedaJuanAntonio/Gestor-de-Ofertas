import Link from "next/link";
import { auth } from "@/lib/auth";
import { getSolicitudesFarmacia } from "@/lib/data/farmacia";
import { SortableTh } from "@/components/historial/SortableTh";
import { ESTADO_SOLICITUD_LABEL } from "@/types";
import type { EstadoSolicitud } from "@/types";

export const metadata = { title: "Mis Solicitudes · Farmacia" };

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));

const ESTADO_CLS: Record<string, string> = {
  PENDIENTE: "bg-slate-100 text-slate-600",
  EN_PROCESO: "bg-amber-100 text-amber-700",
  FINALIZADA: "bg-green-100 text-green-700",
};

const ESTADOS: EstadoSolicitud[] = ["PENDIENTE", "EN_PROCESO", "FINALIZADA"];

type Dir = "asc" | "desc";
const SORT_DEFECTO = "enviada";

type QsParams = {
  estado?: EstadoSolicitud | null;
  q?: string | null;
  desde?: string | null;
  hasta?: string | null;
  sort?: string | null;
  dir?: Dir | null;
  page?: number;
};

/** Arma el querystring preservando estado, búsqueda, rango de fechas y orden (omite los valores por defecto). */
function qs(p: QsParams): string {
  const sp = new URLSearchParams();
  if (p.estado) sp.set("estado", p.estado);
  if (p.q) sp.set("q", p.q);
  if (p.desde) sp.set("desde", p.desde);
  if (p.hasta) sp.set("hasta", p.hasta);
  if (p.sort && p.sort !== SORT_DEFECTO) sp.set("sort", p.sort);
  if (p.dir && p.dir !== "desc") sp.set("dir", p.dir);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const s = sp.toString();
  return s ? `?${s}` : "?";
}

export default async function MisSolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    estado?: string;
    q?: string;
    desde?: string;
    hasta?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const estado = ESTADOS.includes(sp.estado as EstadoSolicitud)
    ? (sp.estado as EstadoSolicitud)
    : null;
  const q = (sp.q ?? "").trim();
  const desde = (sp.desde ?? "").trim();
  const hasta = (sp.hasta ?? "").trim();
  const sort = sp.sort ?? SORT_DEFECTO;
  const dir: Dir = sp.dir === "asc" ? "asc" : "desc";

  const session = await auth();
  const user = session?.user as { role?: string; farmaciaId?: number | null } | undefined;
  const farmaciaId = user?.role === "FARMACIA" ? (user.farmaciaId ?? null) : null;
  const data = await getSolicitudesFarmacia(farmaciaId, {
    page,
    estado,
    q: q || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    sort,
    dir,
  });

  const hrefFor = (col: string, d: Dir) => qs({ estado, q, desde, hasta, sort: col, dir: d });
  const hayFiltro = Boolean(q || desde || hasta);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Mis solicitudes</h1>

      {/* Filtro por estado */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FiltroChip href={qs({ estado: null, q, desde, hasta, sort, dir })} activo={estado === null}>
          Todas
        </FiltroChip>
        {ESTADOS.map((e) => (
          <FiltroChip key={e} href={qs({ estado: e, q, desde, hasta, sort, dir })} activo={estado === e}>
            {ESTADO_SOLICITUD_LABEL[e]}
          </FiltroChip>
        ))}
        <span className="ml-auto text-sm text-slate-500">
          {data.total} solicitud(es)
        </span>
      </div>

      {/* Búsqueda */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        {/* Estado y orden se conservan al buscar. */}
        {estado && <input type="hidden" name="estado" value={estado} />}
        {sort !== SORT_DEFECTO && <input type="hidden" name="sort" value={sort} />}
        {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por código, producto o EAN…"
          aria-label="Buscar"
          className="h-10 w-full max-w-md rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
        />
        <label className="flex flex-col text-xs text-slate-500">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            aria-label="Desde"
            className="h-10 rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            aria-label="Hasta"
            className="h-10 rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Buscar
        </button>
        {hayFiltro && (
          <a
            href={qs({ estado, sort, dir })}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Limpiar
          </a>
        )}
      </form>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-lg text-slate-500">
          {hayFiltro || estado
            ? "No hay solicitudes que coincidan con el filtro o la búsqueda."
            : "Todavía no enviaste solicitudes."}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
                  <SortableTh className="px-4 py-3" label="Código" col="codigo" activeSort={sort} dir={dir} hrefFor={hrefFor} />
                  <SortableTh className="px-4 py-3" label="Enviada" col="enviada" activeSort={sort} dir={dir} hrefFor={hrefFor} />
                  <SortableTh className="px-4 py-3 text-center" label="Ítems" col="items" activeSort={sort} dir={dir} hrefFor={hrefFor} />
                  <th className="px-4 py-3 text-center">Aprob.</th>
                  <th className="px-4 py-3 text-center">Rech.</th>
                  <th className="px-4 py-3 text-center">Pend.</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-mono text-sm">
                    <Link
                      href={`/farmacia/mis-solicitudes/${s.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {s.codigo}
                    </Link>
                  </td>
                    <td className="px-4 py-3 text-slate-600">{fmt(s.fechaEnvio)}</td>
                    <td className="px-4 py-3 text-center font-semibold">{s.total}</td>
                    <td className="px-4 py-3 text-center text-green-600">{s.aprobados}</td>
                    <td className="px-4 py-3 text-center text-red-600">{s.rechazados}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{s.pendientes}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_CLS[s.estado] ?? ""}`}>
                        {ESTADO_SOLICITUD_LABEL[s.estado as EstadoSolicitud] ?? s.estado}
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
                href={qs({ estado, q, desde, hasta, sort, dir, page: data.page - 1 })}
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
                href={qs({ estado, q, desde, hasta, sort, dir, page: data.page + 1 })}
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

function FiltroChip({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
        activo
          ? "bg-blue-600 text-white"
          : "border border-slate-300 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </a>
  );
}
