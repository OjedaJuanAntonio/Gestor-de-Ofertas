import { Download } from "lucide-react";
import { getRegistrosMetrica } from "@/lib/data/analytics";
import {
  tiempoRespuestaComprador,
  tiempoCargaPrecios,
  tasaEfectividadPorComprador,
  tasaEfectividadPorLaboratorio,
  volumenDiario,
} from "@/lib/analytics/metrics";
import { KpiCard, BarList, ColumnChart } from "@/components/analytics/Charts";

export const metadata = { title: "Reportes · Gerencial" };

const fmtHoras = (h: number) =>
  h >= 24 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`;

export default async function AnalyticsPage() {
  const registros = await getRegistrosMetrica();

  const resp = tiempoRespuestaComprador(registros);
  const carga = tiempoCargaPrecios(registros);
  const porComprador = tasaEfectividadPorComprador(registros);
  const porLab = tasaEfectividadPorLaboratorio(registros);
  const volumen = volumenDiario(registros);

  const decididos = registros.filter((r) => r.estadoDecision !== "PENDIENTE");
  const aprobados = registros.filter((r) => r.estadoDecision === "APROBADO").length;
  const pctAprob = decididos.length
    ? Math.round((aprobados / decididos.length) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reportes gerenciales</h1>
          <p className="mt-1 text-base text-slate-600">
            Auditoría del proceso: tiempos, efectividad y volumen.
          </p>
        </div>
        <a
          href="/api/export/analytics"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-base font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          titulo="Tiempo de respuesta (comprador)"
          valor={fmtHoras(resp.promedioHoras)}
          sub={`mediana ${fmtHoras(resp.medianaHoras)} · ${resp.muestras} muestras`}
        />
        <KpiCard
          titulo="Tiempo de carga (Precios)"
          valor={fmtHoras(carga.promedioHoras)}
          sub={`mediana ${fmtHoras(carga.medianaHoras)} · ${carga.muestras} muestras`}
        />
        <KpiCard
          titulo="Ítems totales"
          valor={String(registros.length)}
          sub={`${decididos.length} decididos`}
        />
        <KpiCard titulo="Tasa de aprobación" valor={`${pctAprob}%`} sub={`${aprobados} aprobados`} />
      </div>

      <ColumnChart
        titulo="Volumen de ítems por día"
        data={volumen.map((v) => ({ label: v.fecha, value: v.cantidad }))}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          titulo="Efectividad por comprador"
          data={porComprador.map((t) => ({
            label: t.clave,
            value: t.pctAprobacion,
            sub: `${t.pctAprobacion}% (${t.aprobados}/${t.total})`,
          }))}
        />
        <BarList
          titulo="Efectividad por laboratorio"
          data={porLab.map((t) => ({
            label: t.clave,
            value: t.pctAprobacion,
            sub: `${t.pctAprobacion}% (${t.aprobados}/${t.total})`,
          }))}
        />
      </div>
    </div>
  );
}
