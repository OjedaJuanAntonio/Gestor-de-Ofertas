import Link from "next/link";
import { ScrollText, Search } from "lucide-react";
import { listAuditoria } from "@/lib/data/admin";
import { requireRole } from "@/lib/authz";
import { fmtFechaHora } from "@/lib/fecha";

export const metadata = { title: "Auditoría · Admin" };

// Nombre legible de cada acción registrada.
const ACCION: Record<string, string> = {
  CREAR: "Solicitud enviada",
  APROBAR: "Ítem aprobado",
  RECHAZAR: "Ítem rechazado",
  CARGAR_ERP: "Carga en ERP",
  ENVIAR_TESTER: "Tester enviado",
  DERIVAR: "Ítem derivado",
  CREAR_USUARIO: "Usuario creado",
  ACTIVAR_USUARIO: "Usuario activado",
  DESACTIVAR_USUARIO: "Usuario desactivado",
  RESETEAR_CLAVE: "Contraseña reseteada",
  GENERAR_CLAVE_TEMPORAL: "Clave temporal generada",
  IMPORTAR_USUARIOS_FARMACIA: "Alta masiva de usuarios",
  CREAR_FARMACIA: "Farmacia creada",
  EDITAR_FARMACIA: "Farmacia editada",
  ACTIVAR_FARMACIA: "Farmacia activada",
  DESACTIVAR_FARMACIA: "Farmacia desactivada",
  IMPORTAR_FARMACIAS: "Import de farmacias",
  CREAR_PROVEEDOR: "Proveedor creado",
  ASIGNAR_COMPRADOR: "Comprador asignado a proveedor",
  ACTIVAR_PROVEEDOR: "Proveedor activado",
  DESACTIVAR_PROVEEDOR: "Proveedor desactivado",
  IMPORTAR_ARTICULOS: "Import de artículos",
  REINTENTAR_CORREO: "Correo reintentado",
  CANCELAR_CORREO: "Correo cancelado",
};

function detalle(diff: unknown): string {
  if (!diff || typeof diff !== "object") return "";
  return Object.entries(diff as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = (sp.q ?? "").trim();
  const data = await listAuditoria({ page, q: q || undefined });
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <ScrollText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Auditoría</h1>
          <p className="mt-0.5 text-base text-slate-600">
            Quién hizo qué y cuándo: decisiones, cargas, y cambios de usuarios, farmacias y
            proveedores. Solo lectura.
          </p>
        </div>
      </div>

      <form className="mb-3 flex items-center gap-2" action="">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={q}
            aria-label="Buscar en la auditoría"
            placeholder="Buscar por acción, usuario o código…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <button type="submit" className="h-10 rounded-lg bg-blue-600 px-4 font-medium text-white hover:bg-blue-700">
          Buscar
        </button>
        {q && (
          <Link href="?" className="text-sm font-medium text-slate-600 hover:underline">
            Limpiar
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 font-semibold text-slate-600">
              <th className="px-4 py-3 whitespace-nowrap">Fecha</th>
              <th className="px-4 py-3">Quién</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Sobre</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No hay registros{q ? " para esa búsqueda" : ""}.
                </td>
              </tr>
            )}
            {data.filas.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{fmtFechaHora(f.createdAt)}</td>
                <td className="px-4 py-2.5 text-slate-700">{f.actorEmail ?? "—"}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{ACCION[f.action] ?? f.action}</td>
                <td className="px-4 py-2.5 text-slate-600">
                  {f.entityType}
                  {f.entityId !== "*" && (
                    <span className="ml-1 font-mono text-xs text-slate-500">{f.entityId}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-600 break-words">{detalle(f.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>
          {data.total} registro(s) · página {data.page} de {data.pages}
        </span>
        <div className="flex gap-2">
          {data.page > 1 && (
            <Link href={href(data.page - 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50">
              Anterior
            </Link>
          )}
          {data.page < data.pages && (
            <Link href={href(data.page + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50">
              Siguiente
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
