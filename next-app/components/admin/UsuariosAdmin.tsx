"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { crearUsuario, toggleUsuario } from "@/lib/actions/admin";
import type { Role } from "@/types";
import { Button } from "@/components/ui/button";

type Usuario = {
  id: string;
  email: string;
  nombre: string;
  role: Role;
  activo: boolean;
  farmacia: { nombre: string } | null;
  laboratorios: { laboratorio: string }[];
};
type FarmaciaOpt = { id: number; nombre: string };

const ROLES: Role[] = ["ADMIN", "FARMACIA", "COMPRADOR", "PRECIOS"];

export function UsuariosAdmin({
  usuarios,
  farmacias,
}: {
  usuarios: Usuario[];
  farmacias: FarmaciaOpt[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    nombre: "",
    password: "",
    role: "COMPRADOR" as Role,
    farmaciaId: "" as number | "",
    laboratorios: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function crear() {
    setError(null);
    start(async () => {
      const res = await crearUsuario({
        email: form.email,
        nombre: form.nombre,
        password: form.password,
        role: form.role,
        farmaciaId: form.role === "FARMACIA" && form.farmaciaId ? Number(form.farmaciaId) : null,
        laboratorios:
          form.role === "COMPRADOR"
            ? form.laboratorios.split(",").map((l) => l.trim()).filter(Boolean)
            : [],
      });
      if (res.ok) {
        setForm({ email: "", nombre: "", password: "", role: "COMPRADOR", farmaciaId: "", laboratorios: "" });
        router.refresh();
      } else setError(res.error);
    });
  }

  const inputCls =
    "h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-700">Nuevo usuario</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input className={inputCls} placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <input className={inputCls} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={inputCls} type="password" placeholder="Contraseña (mín. 6)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {form.role === "FARMACIA" && (
            <select className={inputCls} value={form.farmaciaId} onChange={(e) => setForm({ ...form, farmaciaId: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">— Farmacia asignada —</option>
              {farmacias.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
            </select>
          )}
          {form.role === "COMPRADOR" && (
            <input className={inputCls} placeholder="Laboratorios (coma: Bayer, Roche)" value={form.laboratorios} onChange={(e) => setForm({ ...form, laboratorios: e.target.value })} />
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={crear} disabled={pending} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <UserPlus className="h-4 w-4" /> Crear usuario
          </Button>
          {error && <span className="text-sm font-semibold text-red-600">{error}</span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
              <th className="px-4 py-3">Nombre / Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Asignación</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{u.nombre}</div>
                  <div className="text-sm text-slate-400">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{u.role}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {u.role === "FARMACIA" && (u.farmacia?.nombre ?? "—")}
                  {u.role === "COMPRADOR" && (u.laboratorios.map((l) => l.laboratorio).join(", ") || "—")}
                  {(u.role === "ADMIN" || u.role === "PRECIOS") && "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.activo ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <ToggleBtn id={u.id} activo={u.activo} pending={pending} onToggle={(id, a) => start(async () => { await toggleUsuario(id, a); router.refresh(); })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ToggleBtn({
  id,
  activo,
  pending,
  onToggle,
}: {
  id: string;
  activo: boolean;
  pending: boolean;
  onToggle: (id: string, activo: boolean) => void;
}) {
  return (
    <button
      onClick={() => onToggle(id, !activo)}
      disabled={pending}
      className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
    >
      {activo ? "Desactivar" : "Activar"}
    </button>
  );
}
