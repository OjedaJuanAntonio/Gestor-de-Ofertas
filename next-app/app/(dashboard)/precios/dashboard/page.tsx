import { PackageCheck } from "lucide-react";
import { getPendientesPrecios } from "@/lib/data/precios";
import { PanelPrecios } from "@/components/precios/PanelPrecios";
import { requireRole } from "@/lib/authz";

export const metadata = { title: "Carga ERP · Precios" };

export default async function PreciosDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("ADMIN", "PRECIOS");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const data = await getPendientesPrecios(page);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <PackageCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Carga en el sistema (ERP)</h1>
          <p className="mt-0.5 text-base text-slate-600">
            Ítems aprobados pendientes de cargar. Cargalos en el ERP y marcá los
            que ya procesaste para cerrar el ciclo y notificar a la farmacia.
          </p>
        </div>
      </div>
      <PanelPrecios
        items={data.items}
        page={data.page}
        pages={data.pages}
        total={data.total}
      />
    </div>
  );
}
