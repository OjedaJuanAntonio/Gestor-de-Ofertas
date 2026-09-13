import { auth } from "@/lib/auth";
import { getFarmaciasActivas } from "@/lib/data/farmacias";
import { GrillaCarga } from "@/components/carga/GrillaCarga";

export const metadata = { title: "Nueva Solicitud · Gestor de Ofertas" };

export default async function NuevaSolicitudPage() {
  const session = await auth();
  const user = session?.user as
    | { role?: string; farmaciaId?: number | null }
    | undefined;

  const farmacias = await getFarmaciasActivas();

  // Si el usuario es operador de UNA farmacia, queda preseleccionada y
  // bloqueada (solo carga lo suyo). El ADMIN puede elegir cualquiera.
  const farmaciaFija =
    user?.role === "FARMACIA" && user.farmaciaId ? user.farmaciaId : null;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Nueva solicitud de oferta</h1>
        <p className="mt-1 text-base text-slate-600">
          Cargá los artículos como en una planilla. El sistema valida cada
          código al instante.
        </p>
      </div>

      <GrillaCarga farmacias={farmacias} farmaciaFija={farmaciaFija} />
    </div>
  );
}
