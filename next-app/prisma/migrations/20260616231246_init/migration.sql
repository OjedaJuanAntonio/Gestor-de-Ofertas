-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'FARMACIA', 'COMPRADOR', 'PRECIOS');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "EstadoDecision" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "MotivoSolicitud" AS ENUM ('VENCIMIENTO_PROXIMO', 'STOCK_INMOVILIZADO', 'SOBRESTOCK');

-- CreateEnum
CREATE TYPE "EmailTipo" AS ENUM ('NOTIF_COMPRADOR', 'CONSOLIDADO_FARMACIA', 'RECHAZO_TOTAL_FARMACIA');

-- CreateEnum
CREATE TYPE "EmailEstado" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO', 'DEAD', 'CANCELADO');

-- CreateTable
CREATE TABLE "farmacias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farmacias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "farmaciaId" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laboratorio_comprador" (
    "id" SERIAL NOT NULL,
    "laboratorio" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "laboratorio_comprador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articulos" (
    "codigoBarra" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "laboratorio" TEXT NOT NULL,
    "categoria" TEXT,
    "stockReferencia" INTEGER DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articulos_pkey" PRIMARY KEY ("codigoBarra")
);

-- CreateTable
CREATE TABLE "solicitudes" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "fechaEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "farmaciaId" INTEGER NOT NULL,
    "nombreFarmaciaHistorico" TEXT NOT NULL,
    "emailFarmaciaHistorico" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "creadoPorId" TEXT,
    "mailFarmaciaEnviado" BOOLEAN NOT NULL DEFAULT false,
    "mailFarmaciaEnviadoAt" TIMESTAMP(3),

    CONSTRAINT "solicitudes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_solicitud" (
    "id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" "MotivoSolicitud" NOT NULL,
    "fechaVencimiento" TEXT,
    "observaciones" TEXT,
    "estadoDecision" "EstadoDecision" NOT NULL DEFAULT 'PENDIENTE',
    "condicionAutorizada" TEXT,
    "motivoRechazo" TEXT,
    "fechaAprobacion" TIMESTAMP(3),
    "cargadoERP" BOOLEAN NOT NULL DEFAULT false,
    "fechaCargaERP" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "codigoBarra" TEXT NOT NULL,
    "compradorId" TEXT,
    "compradorMailHistorico" TEXT NOT NULL,
    "laboratorioHistorico" TEXT NOT NULL,
    "aprobadorId" TEXT,
    "aprobadorMail" TEXT,

    CONSTRAINT "items_solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "tipo" "EmailTipo" NOT NULL,
    "destinatario" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" "EmailEstado" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "maxIntentos" INTEGER NOT NULL DEFAULT 5,
    "ultimoError" TEXT,
    "dedupKey" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farmacias_nombre_key" ON "farmacias"("nombre");

-- CreateIndex
CREATE INDEX "farmacias_activa_idx" ON "farmacias"("activa");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_farmaciaId_idx" ON "users"("farmaciaId");

-- CreateIndex
CREATE INDEX "laboratorio_comprador_laboratorio_idx" ON "laboratorio_comprador"("laboratorio");

-- CreateIndex
CREATE UNIQUE INDEX "laboratorio_comprador_userId_laboratorio_key" ON "laboratorio_comprador"("userId", "laboratorio");

-- CreateIndex
CREATE INDEX "articulos_laboratorio_idx" ON "articulos"("laboratorio");

-- CreateIndex
CREATE INDEX "articulos_descripcion_idx" ON "articulos"("descripcion");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_codigo_key" ON "solicitudes"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_idempotencyKey_key" ON "solicitudes"("idempotencyKey");

-- CreateIndex
CREATE INDEX "solicitudes_farmaciaId_idx" ON "solicitudes"("farmaciaId");

-- CreateIndex
CREATE INDEX "solicitudes_estado_idx" ON "solicitudes"("estado");

-- CreateIndex
CREATE INDEX "solicitudes_fechaEnvio_idx" ON "solicitudes"("fechaEnvio");

-- CreateIndex
CREATE INDEX "items_solicitud_estadoDecision_idx" ON "items_solicitud"("estadoDecision");

-- CreateIndex
CREATE INDEX "items_solicitud_cargadoERP_estadoDecision_idx" ON "items_solicitud"("cargadoERP", "estadoDecision");

-- CreateIndex
CREATE INDEX "items_solicitud_compradorId_estadoDecision_idx" ON "items_solicitud"("compradorId", "estadoDecision");

-- CreateIndex
CREATE INDEX "items_solicitud_solicitudId_idx" ON "items_solicitud"("solicitudId");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_actorId_idx" ON "audit_log"("actorId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_dedupKey_key" ON "email_outbox"("dedupKey");

-- CreateIndex
CREATE INDEX "email_outbox_estado_scheduledAt_idx" ON "email_outbox"("estado", "scheduledAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "farmacias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratorio_comprador" ADD CONSTRAINT "laboratorio_comprador_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "farmacias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_solicitud" ADD CONSTRAINT "items_solicitud_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "solicitudes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_solicitud" ADD CONSTRAINT "items_solicitud_codigoBarra_fkey" FOREIGN KEY ("codigoBarra") REFERENCES "articulos"("codigoBarra") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_solicitud" ADD CONSTRAINT "items_solicitud_compradorId_fkey" FOREIGN KEY ("compradorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_solicitud" ADD CONSTRAINT "items_solicitud_aprobadorId_fkey" FOREIGN KEY ("aprobadorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
