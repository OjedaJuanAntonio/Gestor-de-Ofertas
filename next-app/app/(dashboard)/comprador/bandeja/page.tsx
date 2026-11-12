import { Inbox } from "lucide-react";
import { requireRole } from "@/lib/authz";
import { getBandejaComprador } from "@/lib/data/comprador";
import { BandejaComprador } from "@/components/comprador/BandejaComprador";

export const metadata = { title: "Bandeja · Comprador" };

export default async function BandejaPage() {
  const user = await requireRole("ADMIN", "COMPRADOR");

  const items = await getBandejaComprador(user.id);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Inbox className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bandeja de aprobaciones</h1>
          <p className="mt-0.5 text-base text-slate-600">
            Ítems pendientes asignados a tus laboratorios. Aprobá con una condición
            comercial o rechazá.
          </p>
        </div>
      </div>
      <BandejaComprador items={items} />
    </div>
  );
}
