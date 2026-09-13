import { listFarmacias } from "@/lib/data/admin";
import { FarmaciasAdmin } from "@/components/admin/FarmaciasAdmin";

export const metadata = { title: "Farmacias · Admin" };

export default async function FarmaciasPage() {
  const farmacias = await listFarmacias();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Farmacias</h1>
      <FarmaciasAdmin farmacias={farmacias} />
    </div>
  );
}
