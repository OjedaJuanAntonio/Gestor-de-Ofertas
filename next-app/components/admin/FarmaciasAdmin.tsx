"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { crearFarmacia, toggleFarmacia } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

type Farmacia = {
  id: number;
  nombre: string;
  email: string | null;
  activa: boolean;
  _count: { solicitudes: number };
};

export function FarmaciasAdmin({ farmacias }: { farmacias: Farmacia[] }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function crear() {
    setError(null);
    start(async () => {
      const res = await crearFarmacia({ nombre, email });
      if (res.ok) {
        setNombre("");
        setEmail("");
        router.refresh();
      } else setError(res.error);
    });
  }

  function toggle(id: number, activa: boolean) {
    start(async () => {
      await toggleFarmacia(id, activa);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-semibold text-slate-600">Nombre</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Farmacia Nueva 1234"
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-semibold text-slate-600">Email (opcional)</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contacto@farma.com"
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <Button onClick={crear} disabled={pending || nombre.trim().length < 2} className="h-11 gap-2 bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-center">Solicitudes</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {farmacias.map((f) => (
              <tr key={f.id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{f.nombre}</td>
                <td className="px-4 py-3 text-slate-600">{f.email ?? <span className="text-slate-300">SIN_MAIL</span>}</td>
                <td className="px-4 py-3 text-center text-slate-600">{f._count.solicitudes}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${f.activa ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                    {f.activa ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggle(f.id, !f.activa)}
                    disabled={pending}
                    className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {f.activa ? "Desactivar" : "Activar"}
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
