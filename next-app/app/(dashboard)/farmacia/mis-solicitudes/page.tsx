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

export default async function MisSolicitudesPage() {
  const session = await auth();
  const user = session?.user as { role?: string; farmaciaId?: number | null } | undefined;
  const farmaciaId = user?.role === "FARMACIA" ? (user.farmaciaId ?? null) : null;
  const solicitudes = await getSolicitudesFarmacia(farmaciaId);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Mis solicitudes</h1>

      {solicitudes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-lg text-slate-500">
          Todavía no enviaste solicitudes.
        </div>
      ) : (
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
              {solicitudes.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-mono text-sm text-slate-700">{s.codigo}</td>
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
      )}
    </div>
  );
}
