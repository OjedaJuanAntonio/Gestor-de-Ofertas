import { Upload } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ImportArticulos } from "@/components/admin/ImportArticulos";

export const metadata = { title: "Artículos / CSV · Admin" };

export default async function ArticulosPage() {
  const total = await prisma.articulo.count();
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Upload className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Artículos (maestro)</h1>
          <p className="mt-0.5 text-base text-slate-600">
            Hay <strong>{total}</strong> artículos cargados. Importá o actualizá por CSV.
          </p>
        </div>
      </div>
      <ImportArticulos />
    </div>
  );
}
