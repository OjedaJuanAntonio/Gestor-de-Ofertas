-- Cuentas: vencimiento de la clave temporal + contadores de intentos de login.

-- 1) Vencimiento de la clave temporal.
ALTER TABLE "users" ADD COLUMN "claveTemporalVence" TIMESTAMP(3);

-- Las cuentas que hoy siguen pendientes de cambio de clave tienen la clave
-- temporal COMPARTIDA anterior ("123456", pública). Se marcan como vencidas:
-- no pueden entrar con ella y el admin debe generarles una nueva (aleatoria)
-- desde Usuarios → "Clave temporal". No afecta a quien ya eligió su contraseña.
UPDATE "users"
   SET "claveTemporalVence" = CURRENT_TIMESTAMP
 WHERE "mustChangePassword" = true;

-- 2) Freno a la fuerza bruta compartido entre instancias.
CREATE TABLE "login_intentos" (
    "clave" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "venceAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_intentos_pkey" PRIMARY KEY ("clave")
);

CREATE INDEX "login_intentos_venceAt_idx" ON "login_intentos"("venceAt");
