import Link from "next/link";
import { auth } from "@/lib/auth";
import { getSolicitudesFarmacia } from "@/lib/data/farmacia";
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

/** Arma el querystring preservando el estado activo (y reseteando page si corresponde). */
function qs(params: { estado?: EstadoSolicitud | null; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.estado) sp.set("estado", params.estado);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return s ? `?${s}` : "?";
}

export default async function MisSolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; estado?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const estado = ESTADOS.includes(sp.estado as EstadoSolicitud)
    ? (sp.estado as EstadoSolicitud)
    : null;

  const session = await auth();
  const user = session?.user as { role?: string; farmaciaId?: number | null } | undefined;
  const farmaciaId = user?.role === "FARMACIA" ? (user.farmaciaId ?? null) : null;
  const data = await getSolicitudesFarmacia(farmaciaId, { page, estado });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Mis solicitudes</h1>

      {/* Filtro por estado */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FiltroChip href={qs({ estado: null })} activo={estado === null}>
          Todas
        </FiltroChip>
        {ESTADOS.map((e) => (
          <FiltroChip key={e} href={qs({ estado: e })} activo={estado === e}>
            {ESTADO_SOLICITUD_LABEL[e]}
          </FiltroChip>
        ))}
        <span className="ml-auto text-sm text-slate-500">
          {data.total} solicitud(es)
        </span>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-lg text-slate-500">
          {estado
            ? "No hay solicitudes con ese estado."
            : "Todavía no enviaste solicitudes."}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Enviada</th>
                  <th className="px-4 py-3 text-center">Ítems</th>
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
                href={qs({ estado, page: data.page - 1 })}
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
                href={qs({ estado, page: data.page + 1 })}
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
