"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { crearFarmacia, actualizarFarmacia, toggleFarmacia } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

type Farmacia = {
  id: string;
  nombre: string;
  email: string | null;
  activa: boolean;
  _count: { solicitudes: number };
};

export function FarmaciasAdmin({ farmacias }: { farmacias: Farmacia[] }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<{ id: string; codigo: string; nombre: string; email: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  function guardarEdicion() {
    if (!edit) return;
    setEditError(null);
    start(async () => {
      const res = await actualizarFarmacia(edit);
      if (res.ok) {
        setEdit(null);
        router.refresh();
      } else setEditError(res.error);
    });
  }

  function crear() {
    setError(null);
    start(async () => {
      const res = await crearFarmacia({ codigo, nombre, email });
      if (res.ok) {
        setCodigo("");
        setNombre("");
        setEmail("");
        router.refresh();
      } else setError(res.error);
    });
  }

  function toggle(id: string, activa: boolean) {
    start(async () => {
      await toggleFarmacia(id, activa);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="w-40">
          <label className="mb-1 block text-sm font-semibold text-slate-600">Código interno</label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="F001"
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
          />
        </div>
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
        <Button onClick={crear} disabled={pending || codigo.trim().length < 1 || nombre.trim().length < 2} className="h-11 gap-2 bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-center">Solicitudes</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {farmacias.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-700">{f.id}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{f.nombre}</td>
                <td className="px-4 py-3 text-slate-600">{f.email ?? <span className="text-slate-300">SIN_MAIL</span>}</td>
                <td className="px-4 py-3 text-center text-slate-600">{f._count.solicitudes}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${f.activa ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                    {f.activa ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setEditError(null);
                      setEdit({ id: f.id, codigo: f.id, nombre: f.nombre, email: f.email ?? "" });
                    }}
                    className="mr-4 text-sm font-semibold text-slate-600 hover:underline"
                  >
                    Editar
                  </button>
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

      {edit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEdit(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="editar-farmacia-titulo"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="editar-farmacia-titulo" className="text-xl font-bold text-slate-800">
              Editar farmacia
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-codigo" className="mb-1 block text-sm font-semibold text-slate-600">
                  Código interno
                </label>
                <input
                  id="edit-codigo"
                  value={edit.codigo}
                  onChange={(e) => setEdit({ ...edit, codigo: e.target.value })}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                />
                {edit.codigo.trim().toUpperCase() !== edit.id && (
                  <p className="mt-1 text-xs text-amber-700">
                    Vas a cambiar el código. Sus usuarios y solicitudes pasan al código nuevo.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="edit-nombre" className="mb-1 block text-sm font-semibold text-slate-600">
                  Nombre
                </label>
                <input
                  id="edit-nombre"
                  value={edit.nombre}
                  onChange={(e) => setEdit({ ...edit, nombre: e.target.value })}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label htmlFor="edit-email" className="mb-1 block text-sm font-semibold text-slate-600">
                  Email (opcional)
                </label>
                <input
                  id="edit-email"
                  type="email"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                />
                <p className="mt-1 text-xs text-slate-500">
                  A este mail llega el resultado de las solicitudes nuevas. Las ya enviadas conservan
                  el mail que tenía en ese momento.
                </p>
              </div>
            </div>
            {editError && <p className="mt-3 text-sm font-semibold text-red-600">{editError}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEdit(null)}>
                Cancelar
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={guardarEdicion}
                disabled={pending || edit.codigo.trim().length < 1 || edit.nombre.trim().length < 2}
              >
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
