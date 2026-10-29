import { auth } from "@/lib/auth";
import { getHistoricoComprador } from "@/lib/data/comprador";
import { ESTADO_DECISION_LABEL } from "@/types";
import type { EstadoDecision } from "@/types";

export const metadata = { title: "Historial · Comprador" };

const fmt = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }).format(new Date(d))
    : "—";

type EstadoHist = "APROBADO" | "RECHAZADO";
const ESTADOS: EstadoHist[] = ["APROBADO", "RECHAZADO"];

const ESTADO_CLS: Record<string, string> = {
  APROBADO: "bg-green-100 text-green-700",
  RECHAZADO: "bg-red-100 text-red-700",
};

function qs(params: { estado?: EstadoHist | null; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.estado) sp.set("estado", params.estado);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return s ? `?${s}` : "?";
}

export default async function HistorialCompradorPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; estado?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const estado = ESTADOS.includes(sp.estado as EstadoHist)
    ? (sp.estado as EstadoHist)
    : null;

  const session = await auth();
  const compradorId = (session?.user as { id?: string } | undefined)?.id ?? "";
  const data = await getHistoricoComprador(compradorId, { page, estado });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Historial</h1>
      <p className="mb-5 text-base text-slate-600">
        Ítems que ya resolviste: aprobados (con su condición) y rechazados (con su motivo).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FiltroChip href={qs({ estado: null })} activo={estado === null}>
          Todos
        </FiltroChip>
        {ESTADOS.map((e) => (
          <FiltroChip key={e} href={qs({ estado: e })} activo={estado === e}>
            {ESTADO_DECISION_LABEL[e]}
          </FiltroChip>
        ))}
        <span className="ml-auto text-sm text-slate-500">{data.total} ítem(s)</span>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-lg text-slate-500">
          {estado ? "No hay ítems con ese resultado." : "Todavía no resolviste ítems."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Solicitud</th>
                  <th className="px-4 py-3">Farmacia</th>
                  <th className="px-4 py-3">EAN</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-center">Cant.</th>
                  <th className="px-4 py-3 text-center">Resultado</th>
                  <th className="px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-600">{fmt(it.fechaAprobacion)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{it.solicitudCodigo}</td>
                    <td className="px-4 py-3 text-slate-700">{it.farmaciaNombre}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{it.codigoBarra}</td>
                    <td className="px-4 py-3 text-slate-800">{it.descripcion}</td>
                    <td className="px-4 py-3 text-center font-semibold">{it.cantidad}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_CLS[it.estadoDecision] ?? ""}`}
                      >
                        {ESTADO_DECISION_LABEL[it.estadoDecision as EstadoDecision] ?? it.estadoDecision}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {it.estadoDecision === "APROBADO" ? (
                        <span className="font-semibold text-green-700">
                          {it.condicionAutorizada ?? "Aprobado"}
                        </span>
                      ) : (
                        <span className="text-red-700">{it.motivoRechazo ?? "Rechazado"}</span>
                      )}
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
