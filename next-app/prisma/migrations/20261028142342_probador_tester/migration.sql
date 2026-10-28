-- AlterEnum
ALTER TYPE "MotivoSolicitud" ADD VALUE 'PROBADOR';

-- AlterTable
ALTER TABLE "items_solicitud" ADD COLUMN     "fechaTesterEnviado" TIMESTAMP(3),
ADD COLUMN     "testerEnviado" BOOLEAN NOT NULL DEFAULT false;
