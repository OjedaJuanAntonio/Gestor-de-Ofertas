"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle, ThumbsUp, ThumbsDown, Inbox } from "lucide-react";
import type { ItemBandeja } from "@/lib/data/comprador";
import { MOTIVO_LABEL } from "@/types";
import type { MotivoSolicitud } from "@/types";
import {
  confirmarDecisiones,
  type ConfirmarDecisionesResult,
} from "@/lib/actions/decisiones";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Decision = "APROBADO" | "RECHAZADO";
type DecisionState = { decision?: Decision; condicion: string; motivoRechazo: string };

const fmtFecha = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(
    new Date(d),
  );

export function BandejaComprador({ items }: { items: ItemBandeja[] }) {
  const router = useRouter();
  const [estados, setEstados] = useState<Record<string, DecisionState>>({});
  const [filtro, setFiltro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ConfirmarDecisionesResult | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  // Un probador (tester) no requiere condición comercial al aprobar.
  const esProb = useMemo(() => {
    const m = new Map(items.map((it) => [it.id, it.motivo === "PROBADOR"]));
    return (id: string) => m.get(id) ?? false;
  }, [items]);

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.descripcion.toLowerCase().includes(q) ||
        it.farmaciaNombre.toLowerCase().includes(q) ||
        it.laboratorio.toLowerCase().includes(q) ||
        it.solicitudCodigo.toLowerCase().includes(q) ||
        it.codigoBarra.includes(q),
    );
  }, [items, filtro]);

  function set(id: string, patch: Partial<DecisionState>) {
    setEstados((prev) => {
      const base: DecisionState = prev[id] ?? {
        decision: undefined,
        condicion: "",
        motivoRechazo: "",
      };
      return { ...prev, [id]: { ...base, ...patch } };
    });
  }

  const conDecision = Object.entries(estados).filter(([, s]) => s.decision);
  const aprobadosSinCondicion = conDecision.filter(
    ([id, s]) => s.decision === "APROBADO" && s.condicion.trim() === "" && !esProb(id),
  );

  function pedirConfirmacion() {
    setIntentado(true);
    if (conDecision.length === 0) return;
    if (aprobadosSinCondicion.length > 0) return; // bloquea: condición obligatoria
    setConfirmando(true);
  }

  const aprobadosCount = conDecision.filter(([, s]) => s.decision === "APROBADO").length;
  const rechazadosCount = conDecision.length - aprobadosCount;

  async function ejecutar() {
    setConfirmando(false);
    setEnviando(true);
    setResultado(null);
    try {
      const res = await confirmarDecisiones({
        decisiones: conDecision.map(([itemId, s]) => ({
          itemId,
          decision: s.decision!,
          condicion: s.condicion,
          motivoRechazo: s.motivoRechazo,
        })),
      });
      setResultado(res);
      if (res.ok) {
        setEstados({});
        setIntentado(false);
        router.refresh();
      }
    } catch {
      setResultado({ ok: false, error: "Error inesperado." });
    } finally {
      setEnviando(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <Inbox className="h-12 w-12 text-slate-300" />
        <p className="mt-3 text-lg font-medium text-slate-500">No tenés ítems pendientes.</p>
        <p className="text-base text-slate-400">Cuando una farmacia te envíe una solicitud, aparecerá acá.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-[15px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          placeholder="Filtrar por farmacia, lab, producto o código…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-11 w-full max-w-md rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
        />
        <span className="text-base text-slate-600">
          <strong>{items.length}</strong> pendiente(s) · <strong>{conDecision.length}</strong> con decisión
        </span>
      </div>

      {intentado && aprobadosSinCondicion.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-amber-800">
          <AlertTriangle className="h-5 w-5" />
          Completá la condición en los ítems aprobados (resaltados en amarillo).
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
              <th className="px-3 py-3">Solicitud / Farmacia</th>
              <th className="px-3 py-3 min-w-[220px]">Producto</th>
              <th className="px-3 py-3">Lab</th>
              <th className="px-3 py-3 w-20 text-center">Cant.</th>
              <th className="px-3 py-3">Motivo</th>
              <th className="px-3 py-3 w-44 text-center">Decisión</th>
              <th className="px-3 py-3 min-w-[200px]">Condición / Motivo</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((it) => {
              const st = estados[it.id] ?? { decision: undefined, condicion: "", motivoRechazo: "" };
              const aprobadoSinCond =
                intentado && st.decision === "APROBADO" && st.condicion.trim() === "" && !esProb(it.id);
              return (
                <tr
                  key={it.id}
                  className={
                    aprobadoSinCond
                      ? "border-b border-slate-100 bg-amber-50"
                      : st.decision === "APROBADO"
                        ? "border-b border-slate-100 bg-green-50/50"
                        : st.decision === "RECHAZADO"
                          ? "border-b border-slate-100 bg-red-50/50"
                          : "border-b border-slate-100"
                  }
                >
                  <td className="px-3 py-2.5 align-top">
                    <div className="font-mono text-sm text-slate-500">{it.solicitudCodigo}</div>
                    <div className="font-medium text-slate-700">{it.farmaciaNombre}</div>
                    <div className="text-xs text-slate-400">{fmtFecha(it.fechaEnvio)}</div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="font-medium text-slate-800">{it.descripcion}</div>
                    <div className="font-mono text-xs text-slate-400">{it.codigoBarra}</div>
                    {it.fechaVencimiento && (
                      <div className="text-xs text-amber-600">Vence {it.fechaVencimiento}</div>
                    )}
                    {it.observaciones && (
                      <div className="text-xs text-slate-500 italic">{it.observaciones}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top text-slate-600">{it.laboratorio}</td>
                  <td className="px-3 py-2.5 align-top text-center text-lg font-semibold">{it.cantidad}</td>
                  <td className="px-3 py-2.5 align-top text-slate-600">
                    {MOTIVO_LABEL[it.motivo as MotivoSolicitud] ?? it.motivo}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex justify-center gap-1.5">
                      <button
                        onClick={() => set(it.id, { decision: "APROBADO" })}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-semibold ${
                          st.decision === "APROBADO"
                            ? "bg-green-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-green-100"
                        }`}
                      >
                        <ThumbsUp className="h-4 w-4" /> Aprobar
                      </button>
                      <button
                        onClick={() => set(it.id, { decision: "RECHAZADO" })}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-semibold ${
                          st.decision === "RECHAZADO"
                            ? "bg-red-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-red-100"
                        }`}
                      >
                        <ThumbsDown className="h-4 w-4" /> Rechazar
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    {st.decision === "APROBADO" && (
                      <input
                        autoFocus
                        placeholder={esProb(it.id) ? "Opcional (tester)" : "Condición (ej: 50%, 2x1)"}
                        value={st.condicion}
                        onChange={(e) => set(it.id, { condicion: e.target.value })}
                        className={`h-10 w-full rounded-md border px-2 text-base focus:ring-2 ${
                          aprobadoSinCond
                            ? "border-amber-400 bg-amber-50 focus:ring-amber-300"
                            : "border-slate-300 focus:border-blue-500 focus:ring-blue-300"
                        }`}
                      />
                    )}
                    {st.decision === "RECHAZADO" && (
                      <input
                        placeholder="Motivo del rechazo (opcional)"
                        value={st.motivoRechazo}
                        onChange={(e) => set(it.id, { motivoRechazo: e.target.value })}
                        className="h-10 w-full rounded-md border border-slate-300 px-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <Button
          onClick={pedirConfirmacion}
          disabled={enviando || conDecision.length === 0}
          className="h-12 gap-2 bg-blue-600 px-6 text-lg hover:bg-blue-700"
        >
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          Confirmar decisiones ({conDecision.length})
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        title="Confirmar decisiones"
        message={
          <>
            Vas a confirmar <strong>{conDecision.length}</strong> decisión(es):{" "}
            <strong>{aprobadosCount}</strong> aprobada(s) y{" "}
            <strong>{rechazadosCount}</strong> rechazada(s). Esta acción es definitiva.
          </>
        }
        confirmLabel="Confirmar"
        onConfirm={ejecutar}
        onCancel={() => setConfirmando(false)}
      />

      {resultado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setResultado(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            {resultado.ok ? (
              <>
                <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
                <h2 className="mt-3 text-xl font-bold text-slate-800">Decisiones guardadas</h2>
                <p className="mt-2 text-base text-slate-600">
                  {resultado.actualizados} ítem(s) actualizados ·{" "}
                  {resultado.solicitudesCerradas} solicitud(es) cerradas
                  {resultado.rechazosNotificados > 0 &&
                    ` · ${resultado.rechazosNotificados} farmacia(s) notificada(s) del rechazo total`}
                </p>
              </>
            ) : (
              <>
                <AlertTriangle className="mx-auto h-14 w-14 text-red-500" />
                <h2 className="mt-3 text-xl font-bold text-slate-800">No se pudo guardar</h2>
                <p className="mt-2 text-base text-red-600">{resultado.error}</p>
              </>
            )}
            <Button className="mt-5" variant="ghost" onClick={() => setResultado(null)}>
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
