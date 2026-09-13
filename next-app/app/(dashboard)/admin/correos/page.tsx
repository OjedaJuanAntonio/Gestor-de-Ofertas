import { listCorreosProblema } from "@/lib/data/admin";
import { CorreosAdmin } from "@/components/admin/CorreosAdmin";

export const metadata = { title: "Correos · Admin" };

export default async function CorreosPage() {
  const correos = await listCorreosProblema();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Correos con problemas</h1>
      <p className="mb-5 text-base text-slate-600">
        Notificaciones fallidas o en dead-letter (ej. farmacias sin mail). Reintentá o cancelá.
      </p>
      <CorreosAdmin correos={correos} />
    </div>
  );
}
