import { UserX } from "lucide-react";
import { listItemsSinComprador, listCompradoresOptions } from "@/lib/data/admin";
import { SinAsignarAdmin } from "@/components/admin/SinAsignarAdmin";
import { requireRole } from "@/lib/authz";

export const metadata = { title: "Sin asignar · Admin" };

export default async function SinAsignarPage() {
  await requireRole("ADMIN");
  const [items, compradores] = await Promise.all([
    listItemsSinComprador(),
    listCompradoresOptions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <UserX className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ítems sin asignar</h1>
          <p className="mt-0.5 text-base text-slate-600">
            Ítems de laboratorios sin comprador asignado. No aparecen en ninguna bandeja y
            bloquean el cierre de su solicitud hasta que los derives a un comprador.
          </p>
        </div>
      </div>
      <SinAsignarAdmin items={items} compradores={compradores} />
    </div>
  );
}
