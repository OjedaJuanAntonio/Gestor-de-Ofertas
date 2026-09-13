import { prisma } from "@/lib/prisma";
import { ImportArticulos } from "@/components/admin/ImportArticulos";

export const metadata = { title: "Artículos / CSV · Admin" };

export default async function ArticulosPage() {
  const total = await prisma.articulo.count();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Artículos (maestro)</h1>
      <p className="mb-5 text-base text-slate-600">
        Hay <strong>{total}</strong> artículos cargados. Importá o actualizá por CSV.
      </p>
      <ImportArticulos />
    </div>
  );
}
