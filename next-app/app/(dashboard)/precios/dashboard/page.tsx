import { getPendientesPrecios } from "@/lib/data/precios";
import { PanelPrecios } from "@/components/precios/PanelPrecios";

export const metadata = { title: "Carga ERP · Precios" };

export default async function PreciosDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const data = await getPendientesPrecios(page);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Carga en el sistema (ERP)</h1>
        <p className="mt-1 text-base text-slate-600">
          Ítems aprobados pendientes de cargar. Cargalos en el ERP y marcá los
          que ya procesaste para cerrar el ciclo y notificar a la farmacia.
        </p>
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
