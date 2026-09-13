"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, XCircle, MailCheck } from "lucide-react";
import { reintentarCorreo, cancelarCorreo } from "@/lib/actions/admin";

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

export function CorreosAdmin({ correos }: { correos: Correo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (correos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <MailCheck className="h-12 w-12 text-green-400" />
        <p className="mt-3 text-lg font-medium text-slate-500">No hay correos con problemas.</p>
      </div>
    );
  }

  const accion = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
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
            <tr key={c.id} className="border-b border-slate-100">
              <td className="px-4 py-3 font-medium text-slate-700">{c.destinatario}</td>
              <td className="px-4 py-3">
                <div className="text-slate-700">{c.asunto}</div>
                <div className="text-xs text-slate-400">{c.tipo}</div>
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
  );
}
