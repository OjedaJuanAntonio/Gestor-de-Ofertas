-- Limpieza del maestro de artículos (sacar categoría y stock, sin uso en el
-- sistema) y Farmacia con código propio como id (texto que carga el usuario),
-- en vez de un id autoincremental. Preserva los datos existentes (los ids
-- numéricos de farmacia se convierten a texto).

-- 1) Artículos: columnas sin uso
ALTER TABLE "articulos" DROP COLUMN "categoria";
ALTER TABLE "articulos" DROP COLUMN "stockReferencia";

-- 2) Farmacia: id autoincremental → texto (el código interno)
-- Soltamos las FK que la referencian.
ALTER TABLE "users" DROP CONSTRAINT "users_farmaciaId_fkey";
ALTER TABLE "solicitudes" DROP CONSTRAINT "solicitudes_farmaciaId_fkey";

-- Cambiamos la PK a texto y soltamos la secuencia del autoincremental.
ALTER TABLE "farmacias" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "farmacias" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
DROP SEQUENCE IF EXISTS "farmacias_id_seq";

-- Las FK al mismo tipo.
ALTER TABLE "users" ALTER COLUMN "farmaciaId" TYPE TEXT USING "farmaciaId"::text;
ALTER TABLE "solicitudes" ALTER COLUMN "farmaciaId" TYPE TEXT USING "farmaciaId"::text;

-- Recreamos las FK.
ALTER TABLE "users" ADD CONSTRAINT "users_farmaciaId_fkey"
    FOREIGN KEY ("farmaciaId") REFERENCES "farmacias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_farmaciaId_fkey"
    FOREIGN KEY ("farmaciaId") REFERENCES "farmacias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
