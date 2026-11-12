import { ClipboardList } from "lucide-react";
import { requireRole, alcanceFarmacia } from "@/lib/authz";
import { getFarmaciasActivas } from "@/lib/data/farmacias";
import { GrillaCarga } from "@/components/carga/GrillaCarga";

export const metadata = { title: "Nueva Solicitud · Gestor de Ofertas" };

export default async function NuevaSolicitudPage() {
  const user = await requireRole("ADMIN", "FARMACIA");

  // Si el usuario es operador de UNA farmacia, queda preseleccionada y
  // bloqueada (solo carga lo suyo). El ADMIN puede elegir cualquiera.
  const farmaciaFija = alcanceFarmacia(user);

  // Al operador solo se le manda SU farmacia; el listado completo (códigos,
  // nombres y mails de toda la red) es solo para el admin.
  const farmacias = await getFarmaciasActivas(farmaciaFija ?? undefined);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nueva solicitud de oferta</h1>
          <p className="mt-0.5 text-base text-slate-600">
            Cargá los artículos como en una planilla. El sistema valida cada
            código al instante.
          </p>
        </div>
      </div>

      <GrillaCarga farmacias={farmacias} farmaciaFija={farmaciaFija} />
    </div>
  );
}
