import { listUsuarios, listFarmaciasOptions } from "@/lib/data/admin";
import { UsuariosAdmin } from "@/components/admin/UsuariosAdmin";

export const metadata = { title: "Usuarios · Admin" };

export default async function UsuariosPage() {
  const [usuarios, farmacias] = await Promise.all([
    listUsuarios(),
    listFarmaciasOptions(),
  ]);
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Usuarios</h1>
      <UsuariosAdmin usuarios={usuarios} farmacias={farmacias} />
    </div>
  );
}
