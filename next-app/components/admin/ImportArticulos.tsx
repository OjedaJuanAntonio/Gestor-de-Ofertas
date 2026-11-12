"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileUp, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import { parseArticulosCsv, type ParseResult } from "@/lib/import/articulos-csv";
import { leerArchivoCsv } from "@/lib/import/leer-archivo";
import { FILAS_POR_LOTE } from "@/lib/import/limites";
import { importarArticulosLote, finalizarImportArticulos } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

const EJEMPLO = `codigoBarra,descripcion,laboratorio
7791234599999,Ibuprofeno 600mg x10,Genéricos SA
7791234599998,Amoxicilina 500mg x16,Roche`;

// Un archivo más grande que esto no se vuelca al cuadro de texto (el maestro
// completo son ~10 MB: el navegador se arrastraría). Se muestra solo el resumen.
const MAX_TEXTO_EDITABLE = 200_000;

type Archivo = { nombre: string; datos: ParseResult; aviso: string | null };

type Estado =
  | { tipo: "idle" }
  | { tipo: "importando"; hechos: number; total: number }
  | { tipo: "ok"; guardados: number; rechazados: number; proveedoresNuevos: number }
  | { tipo: "error"; mensaje: string; guardados: number };

const nf = new Intl.NumberFormat("es-AR");

export function ImportArticulos() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "idle" });

  // Con un archivo grande se usa lo ya parseado; si no, se parsea lo tipeado.
  const datos = useMemo<ParseResult | null>(
    () => archivo?.datos ?? (texto.trim() ? parseArticulosCsv(texto) : null),
    [archivo, texto],
  );
  const importando = estado.tipo === "importando";

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setEstado({ tipo: "idle" });
    setLeyendo(true);
    try {
      const { texto: contenido, aviso: av } = await leerArchivoCsv(file);
      if (contenido.length <= MAX_TEXTO_EDITABLE) {
        setArchivo(null);
        setTexto(contenido);
        setAviso(av);
      } else {
        setTexto("");
        setAviso(null);
        setArchivo({ nombre: file.name, datos: parseArticulosCsv(contenido), aviso: av });
      }
    } catch {
      setEstado({ tipo: "error", mensaje: "No se pudo leer el archivo.", guardados: 0 });
    } finally {
      setLeyendo(false);
    }
  }

  function limpiar() {
    setArchivo(null);
    setTexto("");
    setAviso(null);
  }

  async function importar() {
    if (!datos || datos.validos.length === 0) return;
    const filas = datos.validos;
    let guardados = 0;
    let rechazados = 0;
    let proveedoresNuevos = 0;
    setEstado({ tipo: "importando", hechos: 0, total: filas.length });

    try {
      // El maestro completo no entra en un solo request: va por tandas. Cada
      // tanda es un "crear o actualizar", así que reintentar no duplica nada.
      for (let i = 0; i < filas.length; i += FILAS_POR_LOTE) {
        const res = await importarArticulosLote({ filas: filas.slice(i, i + FILAS_POR_LOTE) });
        if (!res.ok) {
          setEstado({ tipo: "error", mensaje: res.error, guardados });
          return;
        }
        guardados += res.guardados;
        rechazados += res.rechazados;
        proveedoresNuevos += res.proveedoresNuevos;
        setEstado({
          tipo: "importando",
          hechos: Math.min(i + FILAS_POR_LOTE, filas.length),
          total: filas.length,
        });
      }
      await finalizarImportArticulos({ guardados, proveedoresNuevos });
      setEstado({ tipo: "ok", guardados, rechazados, proveedoresNuevos });
      limpiar();
      router.refresh();
    } catch {
      // Error de red o del servidor (antes esto fallaba sin mostrar nada).
      setEstado({
        tipo: "error",
        mensaje: "Se cortó la conexión con el servidor durante la carga.",
        guardados,
      });
    }
  }

  const avisoActual = archivo?.aviso ?? aviso;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <label htmlFor="csv-articulos" className="text-base font-semibold text-slate-700">
            Pegá el CSV o subí un archivo
          </label>
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 ${importando ? "pointer-events-none opacity-50" : ""}`}
          >
            {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Subir archivo
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={onFile}
              disabled={importando}
              className="hidden"
            />
          </label>
        </div>

        {archivo ? (
          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-800">{archivo.nombre}</p>
              <p className="text-sm text-slate-600">
                Archivo grande: no se muestra su contenido, solo el resumen de abajo.
              </p>
            </div>
            <button
              type="button"
              onClick={limpiar}
              disabled={importando}
              aria-label="Quitar archivo"
              className="rounded p-1 text-slate-500 hover:bg-blue-100 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <textarea
            id="csv-articulos"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAviso(null);
            }}
            placeholder={EJEMPLO}
            rows={10}
            disabled={importando}
            className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
          />
        )}
        <p className="mt-2 text-xs text-slate-500">
          Columnas: codigoBarra, descripcion, laboratorio. El laboratorio se usa como proveedor (no
          distingue mayúsculas: &quot;BAYER&quot; y &quot;Bayer&quot; son el mismo). Acepta `;` o `,`
          y alias (EAN, lab). El archivo puede ser el maestro completo: se carga por tandas. Los
          artículos que ya existen se actualizan.
        </p>
        {avisoActual && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {avisoActual}
          </p>
        )}
      </div>

      {datos && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-base">
          <div className="flex flex-wrap gap-6">
            <span className="font-semibold text-green-700">{nf.format(datos.validos.length)} válidas</span>
            <span className={datos.errores.length ? "font-semibold text-red-600" : "text-slate-500"}>
              {nf.format(datos.errores.length)} con error
            </span>
          </div>
          {datos.errores.length > 0 && (
            <>
              <ul className="mt-3 max-h-40 overflow-y-auto text-sm text-red-600">
                {datos.errores.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    Línea {e.linea}: {e.motivo}
                  </li>
                ))}
              </ul>
              {datos.errores.length > 20 && (
                <p className="mt-1 text-sm text-slate-500">
                  …y {nf.format(datos.errores.length - 20)} más. Las filas con error no se importan.
                </p>
              )}
            </>
          )}
          <Button
            onClick={importar}
            disabled={importando || datos.validos.length === 0}
            className="mt-4 gap-2 bg-blue-600 hover:bg-blue-700"
          >
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar {nf.format(datos.validos.length)} artículo(s)
          </Button>
        </div>
      )}

      {estado.tipo === "importando" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900" role="status">
          <p className="font-medium">
            Cargando… {nf.format(estado.hechos)} de {nf.format(estado.total)}. No cierres esta pestaña.
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${Math.round((estado.hechos / estado.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {estado.tipo === "ok" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-green-800" role="status">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>
            Importados {nf.format(estado.guardados)} artículo(s)
            {estado.proveedoresNuevos > 0 && ` · ${nf.format(estado.proveedoresNuevos)} proveedor(es) nuevo(s)`}
            {estado.rechazados > 0 && ` · ${nf.format(estado.rechazados)} rechazados por el servidor`}.
          </span>
        </div>
      )}

      {estado.tipo === "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-700" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            {estado.mensaje}
            {estado.guardados > 0 &&
              ` Se llegaron a guardar ${nf.format(estado.guardados)} artículos; podés volver a importar el mismo archivo sin problema (no se duplican).`}
          </span>
        </div>
      )}
    </div>
  );
}
