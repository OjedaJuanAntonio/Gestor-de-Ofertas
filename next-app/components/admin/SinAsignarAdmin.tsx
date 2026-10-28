"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle2 } from "lucide-react";
import { reasignarItems } from "@/lib/actions/derivacion";
import { MOTIVO_LABEL, type MotivoSolicitud } from "@/types";
import { Button } from "@/components/ui/button";

type Item = {
  id: string;
  codigoBarra: string;
  cantidad: number;
  motivo: MotivoSolicitud;
  fechaVencimiento: string | null;
  laboratorioHistorico: string;
  articulo: { descripcion: string };
  solicitud: { codigo: string; fechaEnvio: Date; nombreFarmaciaHistorico: string };
};

type Comprador = {
  id: string;
  nombre: string;
  email: string;
  laboratorios: { laboratorio: string }[];
};

export function SinAsignarAdmin({
  items,
  compradores,
}: {
  items: Item[];
  compradores: Comprador[];
}) {
  // Agrupa por laboratorio (el motivo real del huérfano: ese lab no tiene comprador).
  const grupos = useMemo(() => {
    const mapa = new Map<string, Item[]>();
    for (const it of items) {
      const lab = it.laboratorioHistorico || "(sin laboratorio)";
      const g = mapa.get(lab);
      if (g) g.push(it);
      else mapa.set(lab, [it]);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <p className="text-base font-semibold text-slate-700">No hay ítems sin asignar.</p>
        <p className="text-sm text-slate-500">
          Todo lo que entra tiene un comprador resuelto por laboratorio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {compradores.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          No hay compradores activos. Creá uno en Usuarios antes de poder derivar.
        </p>
      )}
      {grupos.map(([lab, itemsLab]) => (
        <GrupoLab
          key={lab}
          laboratorio={lab}
          items={itemsLab}
          compradores={compradores}
        />
      ))}
    </div>
  );
}

function GrupoLab({
  laboratorio,
  items,
  compradores,
}: {
  laboratorio: string;
  items: Item[];
  compradores: Comprador[];
}) {
  const router = useRouter();
  const [compradorId, setCompradorId] = useState("");
  const [crearMapeo, setCrearMapeo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function derivar() {
    setError(null);
    start(async () => {
      const res = await reasignarItems({
        itemIds: items.map((it) => it.id),
        compradorId,
        crearMapeo,
      });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <span className="text-base font-semibold text-slate-800">{laboratorio}</span>
          <span className="ml-2 text-sm text-slate-500">
            {items.length} ítem(s) sin comprador
          </span>
        </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2">Producto</th>
            <th className="px-4 py-2 text-center">Cant.</th>
            <th className="px-4 py-2">Motivo</th>
            <th className="px-4 py-2">Vto.</th>
            <th className="px-4 py-2">Solicitud</th>
            <th className="px-4 py-2">Farmacia</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-slate-100 text-sm">
              <td className="px-4 py-2">
                <div className="font-medium text-slate-800">{it.articulo.descripcion}</div>
                <div className="text-xs text-slate-400">{it.codigoBarra}</div>
              </td>
              <td className="px-4 py-2 text-center text-slate-700">{it.cantidad}</td>
              <td className="px-4 py-2 text-slate-600">{MOTIVO_LABEL[it.motivo]}</td>
              <td className="px-4 py-2 text-slate-600">{it.fechaVencimiento ?? "—"}</td>
              <td className="px-4 py-2 font-mono text-xs text-slate-500">{it.solicitud.codigo}</td>
              <td className="px-4 py-2 text-slate-600">{it.solicitud.nombreFarmaciaHistorico}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-4 py-3">
        <select
          value={compradorId}
          onChange={(e) => setCompradorId(e.target.value)}
          className="h-11 min-w-56 rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
        >
          <option value="">— Elegí un comprador —</option>
          {compradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.laboratorios.length > 0
                ? ` · ${c.laboratorios.map((l) => l.laboratorio).join(", ")}`
                : ""}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={crearMapeo}
            onChange={(e) => setCrearMapeo(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Asignar <span className="font-semibold">{laboratorio}</span> a este comprador para futuros envíos
        </label>

        <Button
          onClick={derivar}
          disabled={pending || !compradorId}
          className="h-11 gap-2 bg-blue-600 hover:bg-blue-700"
        >
          <Send className="h-4 w-4" /> Derivar {items.length} ítem(s)
        </Button>

        {error && <span className="text-sm font-semibold text-red-600">{error}</span>}
      </div>
    </div>
  );
}
