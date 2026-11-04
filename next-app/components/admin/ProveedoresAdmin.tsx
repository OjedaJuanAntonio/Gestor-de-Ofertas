"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  crearProveedor,
  asignarCompradorProveedor,
  toggleProveedor,
} from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

type Proveedor = {
  id: number;
  nombre: string;
  activo: boolean;
  comprador: { id: string; nombre: string } | null;
  _count: { articulos: number };
};
type CompradorOpt = { id: string; nombre: string };

export function ProveedoresAdmin({
  proveedores,
  compradores,
}: {
  proveedores: Proveedor[];
  compradores: CompradorOpt[];
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [compradorId, setCompradorId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function crear() {
    setError(null);
    start(async () => {
      const res = await crearProveedor({ nombre, compradorId: compradorId || null });
      if (res.ok) {
        setNombre("");
        setCompradorId("");
        router.refresh();
      } else setError(res.error);
    });
  }

  function asignar(id: number, nuevoCompradorId: string) {
    start(async () => {
      await asignarCompradorProveedor(id, nuevoCompradorId || null);
      router.refresh();
    });
  }

  const inputCls =
    "h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300";
  const selCls =
    "h-9 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-300";

  return (
    <div className="space-y-4">
      {/* Nuevo proveedor */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-700">Nuevo proveedor</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            className={inputCls}
            placeholder="Nombre (ej: Bayer)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <select
            className={inputCls}
            value={compradorId}
            onChange={(e) => setCompradorId(e.target.value)}
          >
            <option value="">— Sin comprador responsable —</option>
            {compradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <Button onClick={crear} disabled={pending || nombre.trim().length < 2} className="h-11 gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Crear
          </Button>
        </div>
        {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Comprador responsable</th>
              <th className="px-4 py-3 text-center">Artículos</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{p.nombre}</td>
                <td className="px-4 py-3">
                  <select
                    className={selCls}
                    value={p.comprador?.id ?? ""}
                    disabled={pending}
                    onChange={(e) => asignar(p.id, e.target.value)}
                  >
                    <option value="">— Sin asignar —</option>
                    {compradores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-center text-slate-600">{p._count.articulos}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.activo ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                    {p.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => start(async () => { await toggleProveedor(p.id, !p.activo); router.refresh(); })}
                    disabled={pending}
                    className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {p.activo ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
