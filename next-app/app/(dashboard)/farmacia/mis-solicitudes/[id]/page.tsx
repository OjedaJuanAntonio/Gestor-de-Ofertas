import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getSolicitudDetalle } from "@/lib/data/farmacia";
import {
  ESTADO_SOLICITUD_LABEL,
  ESTADO_DECISION_LABEL,
  MOTIVO_LABEL,
} from "@/types";
import type {
  EstadoSolicitud,
  EstadoDecision,
  MotivoSolicitud,
} from "@/types";

export const metadata = { title: "Detalle de solicitud · Farmacia" };

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));

const ESTADO_SOL_CLS: Record<string, string> = {
  PENDIENTE: "bg-slate-100 text-slate-600",
  EN_PROCESO: "bg-amber-100 text-amber-700",
  FINALIZADA: "bg-green-100 text-green-700",
};

const ESTADO_DEC_CLS: Record<string, string> = {
  PENDIENTE: "bg-slate-100 text-slate-600",
  APROBADO: "bg-green-100 text-green-700",
  RECHAZADO: "bg-red-100 text-red-700",
};

export default async function SolicitudDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const user = session?.user as { role?: string; farmaciaId?: number | null } | undefined;
  const farmaciaId = user?.role === "FARMACIA" ? (user.farmaciaId ?? null) : null;

  const solicitud = await getSolicitudDetalle(id, farmaciaId);

  if (!solicitud) {
    return (
      <div className="mx-auto max-w-5xl">
        <Link
          href="/farmacia/mis-solicitudes"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a mis solicitudes
        </Link>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-lg text-slate-500">
          No encontramos esa solicitud (o no pertenece a tu farmacia).
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/farmacia/mis-solicitudes"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a mis solicitudes
      </Link>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold text-slate-800">{solicitud.codigo}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enviada el {fmt(solicitud.fechaEnvio)} · {solicitud.items.length} ítem(s)
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${ESTADO_SOL_CLS[solicitud.estado] ?? ""}`}
        >
          {ESTADO_SOLICITUD_LABEL[solicitud.estado as EstadoSolicitud] ?? solicitud.estado}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">EAN</th>
              <th className="px-4 py-3">Laboratorio</th>
              <th className="px-4 py-3 text-center">Cant.</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3 text-center">Vto.</th>
              <th className="px-4 py-3 text-center">Resultado</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {solicitud.items.map((it) => (
              <tr key={it.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-3 text-slate-800">{it.descripcion}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{it.codigoBarra}</td>
                <td className="px-4 py-3 text-slate-600">{it.laboratorio}</td>
                <td className="px-4 py-3 text-center font-semibold">{it.cantidad}</td>
                <td className="px-4 py-3 text-slate-600">
                  {MOTIVO_LABEL[it.motivo as MotivoSolicitud] ?? it.motivo}
                </td>
                <td className="px-4 py-3 text-center text-slate-600">
                  {it.fechaVencimiento || "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_DEC_CLS[it.estadoDecision] ?? ""}`}
                  >
                    {ESTADO_DECISION_LABEL[it.estadoDecision as EstadoDecision] ?? it.estadoDecision}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {it.estadoDecision === "APROBADO" && (
                    <span className="font-semibold text-green-700">
                      {it.condicionAutorizada ?? "Aprobado"}
                      {it.motivo === "PROBADOR" && (it.testerEnviado ? " · tester enviado" : " · tester pendiente")}
                    </span>
                  )}
                  {it.estadoDecision === "RECHAZADO" && (
                    <span className="text-red-700">{it.motivoRechazo ?? "Rechazado"}</span>
                  )}
                  {it.estadoDecision === "PENDIENTE" && <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
