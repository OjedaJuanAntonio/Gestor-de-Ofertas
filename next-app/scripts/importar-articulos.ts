import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decodificarCsv } from "../lib/import/decodificar";
import { parseArticulosCsv } from "../lib/import/articulos-csv";
import { guardarArticulos, claveProveedor } from "../lib/import/articulos-bulk";

// ─────────────────────────────────────────────────────────────
// Carga del maestro de artículos desde la consola.
//
//   npm run articulos:importar -- maestro.csv --probar
//   npm run articulos:importar -- maestro.csv
//   npm run articulos:importar -- maestro.csv --desactivar-faltantes
//
// --probar                 Solo valida el archivo y muestra el resumen.
// --desactivar-faltantes   Marca como inactivos los artículos que están en
//                          la base pero NO en el archivo (sincronización
//                          completa). No borra nada.
//
// Usa DIRECT_URL (conexión directa) si está; si no, DATABASE_URL.
// Detecta solo la codificación (UTF-8 o la de Excel en Windows).
// ─────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("es-AR");

async function main() {
  const args = process.argv.slice(2);
  const probar = args.includes("--probar") || args.includes("--dry-run");
  const desactivarFaltantes = args.includes("--desactivar-faltantes");
  const ruta = args.find((a) => !a.startsWith("--"));
  if (!ruta) {
    console.error("Uso: npm run articulos:importar -- <archivo.csv> [--probar] [--desactivar-faltantes]");
    process.exit(1);
  }

  const { texto, codificacion } = decodificarCsv(readFileSync(ruta));
  const { validos, errores } = parseArticulosCsv(texto);
  const proveedores = new Set(validos.map((v) => claveProveedor(v.laboratorio)));

  console.log(`\nArchivo:        ${ruta}`);
  console.log(`Codificación:   ${codificacion}${codificacion === "utf-8" ? "" : " (convertida)"}`);
  console.log(`Filas válidas:  ${nf.format(validos.length)}`);
  console.log(`Con error:      ${nf.format(errores.length)}`);
  console.log(`Proveedores:    ${nf.format(proveedores.size)} distintos`);

  if (errores.length > 0) {
    const salida = `${ruta}.errores.csv`;
    writeFileSync(
      salida,
      "linea;motivo\n" + errores.map((e) => `${e.linea};${e.motivo.replace(/;/g, ",")}`).join("\n") + "\n",
      "utf8",
    );
    console.log(`\nPrimeros errores (el detalle completo quedó en ${salida}):`);
    for (const e of errores.slice(0, 10)) console.log(`  línea ${e.linea}: ${e.motivo}`);
  }

  if (validos.length === 0) {
    console.error("\n❌ No hay filas válidas. ¿La primera fila tiene codigoBarra, descripcion, laboratorio?");
    process.exit(1);
  }
  if (probar) {
    console.log("\n(--probar) No se guardó nada.");
    return;
  }

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("\n❌ Falta DIRECT_URL / DATABASE_URL en el entorno.");
    process.exit(1);
  }
  console.log(`\nBase de datos:  ${new URL(url).hostname}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const [{ inicio }] = await prisma.$queryRaw<{ inicio: Date }[]>`SELECT (now() AT TIME ZONE 'UTC') AS inicio`;
    const antes = await prisma.articulo.count();
    const t0 = Date.now();

    const { guardados, proveedoresNuevos } = await guardarArticulos(prisma, validos, {
      onProgreso: (hechos, total) =>
        process.stdout.write(`\rGuardando…      ${nf.format(hechos)} / ${nf.format(total)}`),
    });
    process.stdout.write("\n");

    const despues = await prisma.articulo.count();
    console.log(`\n✅ Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
    console.log(`   Artículos guardados:   ${nf.format(guardados)} (${nf.format(despues - antes)} nuevos)`);
    console.log(`   Proveedores nuevos:    ${nf.format(proveedoresNuevos)}`);
    console.log(`   Total en el maestro:   ${nf.format(despues)}`);

    if (desactivarFaltantes) {
      // Todo lo que vino en el archivo quedó con updatedAt >= inicio.
      const r = await prisma.articulo.updateMany({
        where: { activo: true, updatedAt: { lt: inicio } },
        data: { activo: false },
      });
      console.log(`   Desactivados (no estaban en el archivo): ${nf.format(r.count)}`);
    }

    const sinComprador = await prisma.proveedor.count({ where: { compradorId: null, activo: true } });
    if (sinComprador > 0) {
      console.log(
        `\n⚠️  ${nf.format(sinComprador)} proveedor(es) sin comprador responsable. Asignalos en Admin → Proveedores:` +
          "\n   hasta entonces sus artículos caen en \"Sin asignar\".",
      );
    }
    console.log("\nSi la app está corriendo, puede tardar en ver los cambios (caché de búsqueda).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\n❌ Error:", e);
  process.exit(1);
});
