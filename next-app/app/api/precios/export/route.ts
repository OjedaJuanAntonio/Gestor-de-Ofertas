import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { getTodosPendientesPrecios } from "@/lib/data/precios";
import { COL_ID, COL_CARGADO } from "@/lib/business/precios-xlsx";

// ─────────────────────────────────────────────────────────────
// GET /api/precios/export → Excel (.xlsx) de los ítems aprobados
// pendientes de carga en el ERP. Incluye la columna ID (para poder
// re-subir el archivo y marcar en lote) y una columna CARGADO vacía
// con desplegable SI/NO. Solo PRECIOS o ADMIN.
// ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "PRECIOS" && role !== "ADMIN") {
    return new Response("No autorizado", { status: 401 });
  }

  const items = await getTodosPendientesPrecios();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestor de Ofertas";
  wb.created = new Date();
  const ws = wb.addWorksheet("Pendientes de carga");

  // IMPORTANTE: CODIGO_BARRA (EAN) y CONDICION van PEGADAS, con CONDICION
  // inmediatamente a la DERECHA del EAN. La macro del ERP (externa a esta app)
  // selecciona la celda del EAN y toma el descuento de la celda contigua a la
  // derecha; no mover ni intercalar columnas entre ambas.
  ws.columns = [
    { header: COL_ID, key: "id", width: 28 },
    { header: "SOLICITUD", key: "solicitud", width: 22 },
    { header: "FARMACIA", key: "farmacia", width: 26 },
    { header: "CODIGO_BARRA", key: "codigoBarra", width: 16 },
    { header: "CONDICION", key: "condicion", width: 14 },
    { header: "DESCRIPCION", key: "descripcion", width: 40 },
    { header: "LABORATORIO", key: "laboratorio", width: 18 },
    { header: "CANTIDAD", key: "cantidad", width: 10 },
    { header: "FECHA_APROBACION", key: "fechaAprobacion", width: 18 },
    { header: COL_CARGADO, key: "cargado", width: 12 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const it of items) {
    ws.addRow({
      id: it.id,
      solicitud: it.solicitudCodigo,
      farmacia: it.farmaciaNombre,
      codigoBarra: it.codigoBarra,
      descripcion: it.descripcion,
      laboratorio: it.laboratorio,
      cantidad: it.cantidad,
      condicion: it.condicionAutorizada ?? "",
      fechaAprobacion: it.fechaAprobacion
        ? new Intl.DateTimeFormat("es-AR").format(new Date(it.fechaAprobacion))
        : "",
      cargado: "",
    });
  }

  // Desplegable SI/NO en la columna CARGADO (filas de datos).
  const colCargado = ws.getColumn("cargado").number;
  for (let fila = 2; fila <= items.length + 1; fila++) {
    ws.getCell(fila, colCargado).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"SI,NO"'],
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pendientes-carga-${fecha}.xlsx"`,
    },
  });
}
