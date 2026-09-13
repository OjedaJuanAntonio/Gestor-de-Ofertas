import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ─────────────────────────────────────────────────────────────
// Datos transaccionales DEMO para poblar el dashboard de analytics.
// Re-ejecutable: borra las SOL-DEMO-* previas y las recrea.
// ─────────────────────────────────────────────────────────────

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const hAtras = (h: number) => new Date(Date.now() - h * 3600_000);

async function main() {
  await prisma.solicitud.deleteMany({ where: { codigo: { startsWith: "SOL-DEMO-" } } });

  const c1 = await prisma.user.findUniqueOrThrow({ where: { email: "c1@drogueria.com" } });
  const s1 = await prisma.user.findUniqueOrThrow({ where: { email: "s1@drogueria.com" } });
  const farmacias = await prisma.farmacia.findMany({ orderBy: { id: "asc" }, take: 3 });

  // SOL-DEMO-1: mixto y finalizado (2 aprob+cargado, 1 rechazado)
  await prisma.solicitud.create({
    data: {
      codigo: "SOL-DEMO-1",
      idempotencyKey: "SOL-DEMO-1",
      estado: "FINALIZADA",
      fechaEnvio: hAtras(72),
      farmaciaId: farmacias[0].id,
      nombreFarmaciaHistorico: farmacias[0].nombre,
      emailFarmaciaHistorico: farmacias[0].email ?? "SIN_MAIL",
      mailFarmaciaEnviado: true,
      mailFarmaciaEnviadoAt: hAtras(20),
      items: {
        create: [
          {
            codigoBarra: "7791234500011", cantidad: 10, motivo: "SOBRESTOCK",
            estadoDecision: "APROBADO", condicionAutorizada: "50%",
            compradorId: c1.id, aprobadorId: c1.id, aprobadorMail: c1.email,
            fechaAprobacion: hAtras(68), cargadoERP: true, fechaCargaERP: hAtras(20),
            compradorMailHistorico: c1.email, laboratorioHistorico: "Bayer",
          },
          {
            codigoBarra: "7791234500028", cantidad: 5, motivo: "STOCK_INMOVILIZADO",
            estadoDecision: "APROBADO", condicionAutorizada: "2x1",
            compradorId: c1.id, aprobadorId: c1.id, aprobadorMail: c1.email,
            fechaAprobacion: hAtras(68), cargadoERP: true, fechaCargaERP: hAtras(20),
            compradorMailHistorico: c1.email, laboratorioHistorico: "Bayer",
          },
          {
            codigoBarra: "7791234500042", cantidad: 3, motivo: "VENCIMIENTO_PROXIMO",
            fechaVencimiento: "08/26", estadoDecision: "RECHAZADO", motivoRechazo: "Vence muy pronto",
            compradorId: c1.id, aprobadorId: c1.id, aprobadorMail: c1.email,
            fechaAprobacion: hAtras(68),
            compradorMailHistorico: c1.email, laboratorioHistorico: "Roche",
          },
        ],
      },
    },
  });

  // SOL-DEMO-2: aprobados pendientes de carga (Precios)
  await prisma.solicitud.create({
    data: {
      codigo: "SOL-DEMO-2",
      idempotencyKey: "SOL-DEMO-2",
      estado: "EN_PROCESO",
      fechaEnvio: hAtras(30),
      farmaciaId: farmacias[1].id,
      nombreFarmaciaHistorico: farmacias[1].nombre,
      emailFarmaciaHistorico: farmacias[1].email ?? "SIN_MAIL",
      items: {
        create: [
          {
            codigoBarra: "7791234500066", cantidad: 20, motivo: "SOBRESTOCK",
            estadoDecision: "APROBADO", condicionAutorizada: "30%",
            compradorId: s1.id, aprobadorId: s1.id, aprobadorMail: s1.email,
            fechaAprobacion: hAtras(26),
            compradorMailHistorico: s1.email, laboratorioHistorico: "Pfizer",
          },
          {
            codigoBarra: "7791234500097", cantidad: 8, motivo: "STOCK_INMOVILIZADO",
            estadoDecision: "APROBADO", condicionAutorizada: "15%",
            compradorId: s1.id, aprobadorId: s1.id, aprobadorMail: s1.email,
            fechaAprobacion: hAtras(26),
            compradorMailHistorico: s1.email, laboratorioHistorico: "Sanofi",
          },
        ],
      },
    },
  });

  // SOL-DEMO-3: recién enviada, pendiente del comprador
  await prisma.solicitud.create({
    data: {
      codigo: "SOL-DEMO-3",
      idempotencyKey: "SOL-DEMO-3",
      estado: "PENDIENTE",
      fechaEnvio: hAtras(4),
      farmaciaId: farmacias[2].id,
      nombreFarmaciaHistorico: farmacias[2].nombre,
      emailFarmaciaHistorico: farmacias[2].email ?? "SIN_MAIL",
      items: {
        create: [
          {
            codigoBarra: "7791234500073", cantidad: 6, motivo: "SOBRESTOCK",
            compradorId: s1.id,
            compradorMailHistorico: s1.email, laboratorioHistorico: "Pfizer",
          },
        ],
      },
    },
  });

  console.log("✅ Datos demo creados (SOL-DEMO-1/2/3).");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌", e);
    await prisma.$disconnect();
    process.exit(1);
  });
