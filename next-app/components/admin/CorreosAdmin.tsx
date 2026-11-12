"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, XCircle, MailCheck, Send, AlertTriangle, Loader2 } from "lucide-react";
import { reintentarCorreo, cancelarCorreo, procesarColaAhora } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

type Correo = {
  id: string;
  tipo: string;
  destinatario: string;
  asunto: string;
  estado: string;
  intentos: number;
  ultimoError: string | null;
  updatedAt: Date;
};

type Resumen = {
  pendientes: number;
  masViejo: string | null;
  enviados24h: number;
  conProblemas: number;
};

type Modo = "real" | "simulacion" | "sin-configurar";

export function CorreosAdmin({
  correos,
  resumen,
  modo,
}: {
  correos: Correo[];
  resumen: Resumen;
  modo: Modo;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const accion = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  function procesar() {
    setMensaje(null);
    start(async () => {
      try {
        const r = await procesarColaAhora();
        setMensaje(
          r.ok
            ? {
                ok: true,
                texto:
                  r.procesados === 0
                    ? "No había correos listos para enviar."
                    : `Procesados ${r.procesados}: ${r.enviados} enviados, ${r.fallidos} a reintentar, ${r.dead} sin poder enviarse.`,
              }
            : { ok: false, texto: r.error },
        );
      } catch {
        setMensaje({ ok: false, texto: "Se cortó la conexión con el servidor." });
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {modo === "sin-configurar" && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <strong>El envío de correos no está configurado</strong> (falta <code>RESEND_API_KEY</code>).
            Las notificaciones quedan en la cola y no les llegan a las farmacias.
          </p>
        </div>
      )}
      {modo === "simulacion" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900" role="status">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <strong>Modo simulación:</strong> los correos se marcan como enviados pero <strong>no salen</strong>.
            En producción, poné <code>EMAIL_DRY_RUN=false</code> y cargá <code>RESEND_API_KEY</code>.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dt className="text-sm text-slate-500">En cola</dt>
            <dd className={`text-2xl font-bold ${resumen.pendientes ? "text-amber-600" : "text-slate-800"}`}>
              {resumen.pendientes}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Enviados (24 h)</dt>
            <dd className="text-2xl font-bold text-slate-800">{resumen.enviados24h}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Sin poder enviarse</dt>
            <dd className={`text-2xl font-bold ${resumen.conProblemas ? "text-red-600" : "text-slate-800"}`}>
              {resumen.conProblemas}
            </dd>
          </div>
        </dl>
        <div className="text-right">
          <Button onClick={procesar} disabled={pending} className="gap-2 bg-blue-600 hover:bg-blue-700">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Procesar cola ahora
          </Button>
          {resumen.masViejo && (
            <p className="mt-1 text-xs text-slate-500">El más antiguo espera desde {resumen.masViejo}.</p>
          )}
        </div>
      </div>

      {mensaje && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-2 text-sm ${mensaje.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}
        >
          {mensaje.texto}
        </p>
      )}

      {correos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <MailCheck className="h-12 w-12 text-green-400" />
          <p className="mt-3 text-lg font-medium text-slate-500">No hay correos con problemas.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
                <th className="px-4 py-3">Destinatario</th>
                <th className="px-4 py-3">Asunto / Tipo</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3">Último error</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {correos.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{c.destinatario}</td>
                  <td className="px-4 py-3">
                    <div className="text-slate-700">{c.asunto}</div>
                    <div className="text-xs text-slate-500">{c.tipo}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.estado === "DEAD" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {c.estado} · {c.intentos}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{c.ultimoError ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => accion(() => reintentarCorreo(c.id))} disabled={pending} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50">
                        <RefreshCw className="h-4 w-4" /> Reintentar
                      </button>
                      <button onClick={() => accion(() => cancelarCorreo(c.id))} disabled={pending} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:underline disabled:opacity-50">
                        <XCircle className="h-4 w-4" /> Cancelar
                      </button>
                    </div>
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
