import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmarCargasERP } from "@/lib/actions/precios";
import { filtrarPendientesValidos } from "@/lib/data/precios";
import {
  COL_ID,
  COL_CARGADO,
  esMarcaCargado,
  idsMarcados,
  type FilaImport,
} from "@/lib/business/precios-xlsx";

// ─────────────────────────────────────────────────────────────
// POST /api/precios/import → recibe el Excel (bajado de /export) con
// la columna CARGADO completada y marca en lote como cargados en el
// ERP los ítems indicados (reusa confirmarCargasERP: cierra ciclos y
// encola el consolidado a la farmacia). Solo PRECIOS o ADMIN.
// ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "PRECIOS" && role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    /* body inválido */
  }
  if (!file) {
    return NextResponse.json({ ok: false, error: "Falta el archivo Excel." }, { status: 400 });
  }

  // Parseo del Excel.
  let filas: FilaImport[];
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) {
      return NextResponse.json({ ok: false, error: "El archivo no tiene hojas." }, { status: 400 });
    }

    // Mapea encabezado → número de columna (fila 1).
    const headerRow = ws.getRow(1);
    let colId = 0;
    let colCargado = 0;
    headerRow.eachCell((cell, col) => {
      const h = String(cell.text ?? "").trim().toUpperCase();
      if (h === COL_ID) colId = col;
      else if (h === COL_CARGADO) colCargado = col;
    });
    if (!colId || !colCargado) {
      return NextResponse.json(
        { ok: false, error: `El Excel debe tener las columnas ${COL_ID} y ${COL_CARGADO} (usá el archivo bajado desde Descargar Excel).` },
        { status: 400 },
      );
    }

    filas = [];
    for (let fila = 2; fila <= ws.rowCount; fila++) {
      const row = ws.getRow(fila);
      const id = String(row.getCell(colId).text ?? "").trim();
      if (!id) continue;
      filas.push({ id, cargado: esMarcaCargado(row.getCell(colCargado).text) });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo leer el Excel. ¿Es un .xlsx válido?" }, { status: 400 });
  }

  const marcados = idsMarcados(filas);
  if (marcados.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No hay filas marcadas como cargadas (columna CARGADO = SI)." },
      { status: 400 },
    );
  }

  // Solo los que siguen pendientes (ignora los ya cargados / inválidos).
  const validos = await filtrarPendientesValidos(marcados);
  const ignorados = marcados.length - validos.length;

  if (validos.length === 0) {
    return NextResponse.json({
      ok: true,
      cargados: 0,
      ignorados,
      solicitudesFinalizadas: 0,
      correosEncolados: 0,
      mensaje: "Todas las filas marcadas ya estaban cargadas o no corresponden.",
    });
  }

  const res = await confirmarCargasERP({ itemIds: validos });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    cargados: res.cargados,
    ignorados,
    solicitudesFinalizadas: res.solicitudesFinalizadas,
    correosEncolados: res.correosEncolados,
  });
}
