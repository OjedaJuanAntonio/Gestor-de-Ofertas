-- AlterEnum: quita el valor muerto NOTIF_COMPRADOR de EmailTipo.
-- No se notifica por mail a los compradores (ven sus ítems en la bandeja),
-- así que ninguna fila de email_outbox usa este valor. Patrón estándar de
-- Prisma para eliminar un valor de enum en Postgres.
BEGIN;
CREATE TYPE "EmailTipo_new" AS ENUM ('CONSOLIDADO_FARMACIA', 'RECHAZO_TOTAL_FARMACIA');
ALTER TABLE "email_outbox" ALTER COLUMN "tipo" TYPE "EmailTipo_new" USING ("tipo"::text::"EmailTipo_new");
ALTER TYPE "EmailTipo" RENAME TO "EmailTipo_old";
ALTER TYPE "EmailTipo_new" RENAME TO "EmailTipo";
DROP TYPE "EmailTipo_old";
COMMIT;
