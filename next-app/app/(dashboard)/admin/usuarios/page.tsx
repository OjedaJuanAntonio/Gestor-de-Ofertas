import { listUsuarios, listFarmaciasOptions } from "@/lib/data/admin";
import { UsuariosAdmin } from "@/components/admin/UsuariosAdmin";
import { ImportUsuarios } from "@/components/admin/ImportUsuarios";

export const metadata = { title: "Usuarios · Admin" };

export default async function UsuariosPage() {
  const [usuarios, farmacias] = await Promise.all([
    listUsuarios(),
    listFarmaciasOptions(),
  ]);
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="mb-5 text-2xl font-bold text-slate-800">Usuarios</h1>
        <UsuariosAdmin usuarios={usuarios} farmacias={farmacias} />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Alta masiva de farmacias</h2>
        <ImportUsuarios />
      </div>
    </div>
  );
}
