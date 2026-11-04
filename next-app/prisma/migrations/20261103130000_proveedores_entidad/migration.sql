-- Proveedor (laboratorio) como entidad con clave foránea.
-- Migración que PRESERVA los datos: crea un proveedor por cada laboratorio
-- distinto (de artículos y de las asignaciones de comprador), reconecta los
-- artículos por FK y pasa el comprador responsable de cada laboratorio.

-- 1) Tabla proveedores
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "compradorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "proveedores_nombre_key" ON "proveedores"("nombre");
CREATE INDEX "proveedores_compradorId_idx" ON "proveedores"("compradorId");
CREATE INDEX "proveedores_activo_idx" ON "proveedores"("activo");
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_compradorId_fkey"
    FOREIGN KEY ("compradorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Poblar proveedores desde los laboratorios existentes
INSERT INTO "proveedores" ("nombre", "updatedAt")
SELECT DISTINCT lab, CURRENT_TIMESTAMP
FROM (
    SELECT "laboratorio" AS lab FROM "articulos"
    UNION
    SELECT "laboratorio" AS lab FROM "laboratorio_comprador"
) s
WHERE lab IS NOT NULL AND lab <> '';

-- 3) Comprador responsable (uno por laboratorio: el primero)
UPDATE "proveedores" p
SET "compradorId" = sub."userId"
FROM (
    SELECT DISTINCT ON ("laboratorio") "laboratorio", "userId"
    FROM "laboratorio_comprador"
    ORDER BY "laboratorio", "userId"
) sub
WHERE p."nombre" = sub."laboratorio";

-- 4) Articulo.proveedorId (FK)
ALTER TABLE "articulos" ADD COLUMN "proveedorId" INTEGER;
UPDATE "articulos" a
SET "proveedorId" = p."id"
FROM "proveedores" p
WHERE a."laboratorio" = p."nombre";
ALTER TABLE "articulos" ALTER COLUMN "proveedorId" SET NOT NULL;
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) Limpieza del modelo viejo
DROP INDEX IF EXISTS "articulos_laboratorio_idx";
CREATE INDEX "articulos_proveedorId_idx" ON "articulos"("proveedorId");
ALTER TABLE "articulos" DROP COLUMN "laboratorio";
DROP TABLE "laboratorio_comprador";
