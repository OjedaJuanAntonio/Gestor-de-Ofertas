import { listItemsSinComprador, listCompradoresOptions } from "@/lib/data/admin";
import { SinAsignarAdmin } from "@/components/admin/SinAsignarAdmin";

export const metadata = { title: "Sin asignar · Admin" };

export default async function SinAsignarPage() {
  const [items, compradores] = await Promise.all([
    listItemsSinComprador(),
    listCompradoresOptions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Ítems sin asignar</h1>
        <p className="mt-1 text-base text-slate-600">
          Ítems de laboratorios sin comprador asignado. No aparecen en ninguna bandeja y
          bloquean el cierre de su solicitud hasta que los derives a un comprador.
        </p>
      </div>
      <SinAsignarAdmin items={items} compradores={compradores} />
    </div>
  );
}
