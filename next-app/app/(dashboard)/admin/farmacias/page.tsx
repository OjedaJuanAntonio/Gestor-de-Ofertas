import { listFarmacias } from "@/lib/data/admin";
import { FarmaciasAdmin } from "@/components/admin/FarmaciasAdmin";
import { ImportFarmacias } from "@/components/admin/ImportFarmacias";

export const metadata = { title: "Farmacias · Admin" };

export default async function FarmaciasPage() {
  const farmacias = await listFarmacias();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="mb-5 text-2xl font-bold text-slate-800">Farmacias</h1>
        <FarmaciasAdmin farmacias={farmacias} />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Importar desde Excel/CSV</h2>
        <ImportFarmacias />
      </div>
    </div>
  );
}
