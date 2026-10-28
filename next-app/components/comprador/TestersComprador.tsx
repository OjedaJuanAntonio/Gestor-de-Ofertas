"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle, FlaskConical, Send } from "lucide-react";
import type { ItemTester } from "@/lib/data/testers";
import {
  marcarTesterEnviado,
  type MarcarTesterResult,
} from "@/lib/actions/testers";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const fmtFecha = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }).format(new Date(d))
    : "—";

export function TestersComprador({ items }: { items: ItemTester[] }) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<MarcarTesterResult | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const seleccionados = Object.keys(marcados).filter((id) => marcados[id]);
  const todosMarcados = items.length > 0 && items.every((it) => marcados[it.id]);

  function toggleTodos() {
    if (todosMarcados) {
      setMarcados({});
    } else {
      const all: Record<string, boolean> = {};
      items.forEach((it) => (all[it.id] = true));
      setMarcados(all);
    }
  }

  function pedirConfirmacion() {
    if (seleccionados.length === 0) return;
    setConfirmando(true);
  }

  async function ejecutar() {
    setConfirmando(false);
    setEnviando(true);
    setResultado(null);
    try {
      const res = await marcarTesterEnviado({ itemIds: seleccionados });
      setResultado(res);
      if (res.ok) {
        setMarcados({});
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
        <FlaskConical className="h-12 w-12 text-slate-300" />
        <p className="mt-3 text-lg font-medium text-slate-500">
          No hay testers pendientes de envío.
        </p>
        <p className="text-base text-slate-400">
          Cuando apruebes un probador, aparecerá acá para marcarlo como enviado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-[15px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base text-slate-600">
          <strong>{items.length}</strong> tester(s) pendiente(s) ·{" "}
          <strong>{seleccionados.length}</strong> seleccionados
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
              <th className="w-12 px-3 py-3 text-center">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={toggleTodos}
                  aria-label="Marcar todos"
                  className="h-5 w-5 accent-blue-600"
                />
              </th>
              <th className="px-3 py-3">Solicitud / Farmacia</th>
              <th className="px-3 py-3 min-w-[220px]">Producto</th>
              <th className="px-3 py-3">Lab</th>
              <th className="px-3 py-3 w-20 text-center">Cant.</th>
              <th className="px-3 py-3 w-24">Aprobado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const marcado = !!marcados[it.id];
              return (
                <tr
                  key={it.id}
                  className={`border-b border-slate-100 ${marcado ? "bg-blue-50/60" : ""}`}
                >
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) =>
                        setMarcados((p) => ({ ...p, [it.id]: e.target.checked }))
                      }
                      aria-label={`Marcar ${it.descripcion}`}
                      className="h-5 w-5 accent-blue-600"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-mono text-sm text-slate-500">{it.solicitudCodigo}</div>
                    <div className="font-medium text-slate-700">{it.farmaciaNombre}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-800">{it.descripcion}</div>
                    <div className="font-mono text-xs text-slate-400">{it.codigoBarra}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{it.laboratorio}</td>
                  <td className="px-3 py-3 text-center text-lg font-semibold">{it.cantidad}</td>
                  <td className="px-3 py-3 text-sm text-slate-500">
                    {fmtFecha(it.fechaAprobacion)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end rounded-xl border border-slate-200 bg-white p-4">
        <Button
          onClick={pedirConfirmacion}
          disabled={enviando || seleccionados.length === 0}
          className="h-12 gap-2 bg-blue-600 px-6 text-lg hover:bg-blue-700"
        >
          {enviando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
          Marcar como enviados ({seleccionados.length})
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        title="Marcar testers como enviados"
        message={
          <>
            Vas a marcar <strong>{seleccionados.length}</strong> tester(s) como enviados a la
            farmacia. Al cerrarse una solicitud se le notifica. Esta acción es definitiva.
          </>
        }
        confirmLabel="Marcar enviados"
        onConfirm={ejecutar}
        onCancel={() => setConfirmando(false)}
      />

      {resultado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setResultado(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {resultado.ok ? (
              <>
                <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
                <h2 className="mt-3 text-xl font-bold text-slate-800">Testers marcados</h2>
                <p className="mt-2 text-base text-slate-600">
                  {resultado.enviados} tester(s) enviados ·{" "}
                  {resultado.solicitudesFinalizadas} solicitud(es) finalizadas
                  {resultado.correosEncolados > 0 &&
                    ` · ${resultado.correosEncolados} correo(s) consolidado(s) a farmacias`}
                </p>
              </>
            ) : (
              <>
                <AlertTriangle className="mx-auto h-14 w-14 text-red-500" />
                <h2 className="mt-3 text-xl font-bold text-slate-800">No se pudo confirmar</h2>
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
