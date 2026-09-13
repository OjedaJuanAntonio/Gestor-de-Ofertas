import { auth } from "@/lib/auth";
import { getRegistrosMetrica } from "@/lib/data/analytics";
import { tasaEfectividadPorComprador, type TasaEfectividad } from "@/lib/analytics/metrics";
import { toCsv } from "@/lib/export/csv";

// GET /api/export/analytics → CSV de efectividad por comprador (solo ADMIN).
export async function GET() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "ADMIN") {
    return new Response("No autorizado", { status: 401 });
  }

  const registros = await getRegistrosMetrica();
  const tabla = tasaEfectividadPorComprador(registros);

  const csv = toCsv<TasaEfectividad>(
    tabla,
    [
      { header: "Comprador", value: (r) => r.clave },
      { header: "Aprobados", value: (r) => r.aprobados },
      { header: "Rechazados", value: (r) => r.rechazados },
      { header: "Total", value: (r) => r.total },
      { header: "% Aprobación", value: (r) => r.pctAprobacion },
    ],
    { bom: true },
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="efectividad-compradores.csv"`,
    },
  });
}
