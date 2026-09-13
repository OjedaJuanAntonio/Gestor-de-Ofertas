import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// ─────────────────────────────────────────────────────────────
// Seed de desarrollo: maestros + usuarios + solicitudes demo.
// Idempotente: usa upsert por claves naturales.
// ─────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "demo1234";

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Farmacias ──────────────────────────────────────────────
  const farmaciasData = [
    { nombre: "Farmacia Central 3303", email: "central3303@farma.com" },
    { nombre: "Farmacia del Pueblo 1102", email: "pueblo1102@farma.com" },
    { nombre: "Farmacia San Martín 4501", email: "sanmartin4501@farma.com" },
    { nombre: "Farmacia Sin Mail 9000", email: null }, // caso SIN_MAIL
  ];
  const farmacias = [];
  for (const f of farmaciasData) {
    farmacias.push(
      await prisma.farmacia.upsert({
        where: { nombre: f.nombre },
        update: { email: f.email },
        create: f,
      }),
    );
  }

  // ── Compradores y sus laboratorios ─────────────────────────
  // Un comprador maneja N laboratorios (corrección clave del modelo).
  const compradoresData = [
    {
      email: "c1@drogueria.com",
      nombre: "Claudio Acevedo",
      labs: ["Bayer", "Roche"],
    },
    {
      email: "s1@drogueria.com",
      nombre: "Sandra Ibáñez",
      labs: ["Pfizer", "Sanofi"],
    },
  ];

  for (const c of compradoresData) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: { nombre: c.nombre, role: "COMPRADOR", password: hash, activo: true },
      create: {
        email: c.email,
        nombre: c.nombre,
        role: "COMPRADOR",
        password: hash,
      },
    });
    for (const lab of c.labs) {
      await prisma.laboratorioComprador.upsert({
        where: { userId_laboratorio: { userId: user.id, laboratorio: lab } },
        update: {},
        create: { userId: user.id, laboratorio: lab },
      });
    }
  }

  // ── Admin, operador de farmacia, precios ───────────────────
  await prisma.user.upsert({
    where: { email: "admin@drogueria.com" },
    update: { password: hash, role: "ADMIN", activo: true },
    create: {
      email: "admin@drogueria.com",
      nombre: "Administrador",
      role: "ADMIN",
      password: hash,
    },
  });

  await prisma.user.upsert({
    where: { email: "farmacia@drogueria.com" },
    update: { password: hash, role: "FARMACIA", farmaciaId: farmacias[0].id, activo: true },
    create: {
      email: "farmacia@drogueria.com",
      nombre: "Operador Farmacia Central",
      role: "FARMACIA",
      password: hash,
      farmaciaId: farmacias[0].id,
    },
  });

  await prisma.user.upsert({
    where: { email: "precios@drogueria.com" },
    update: { password: hash, role: "PRECIOS", activo: true },
    create: {
      email: "precios@drogueria.com",
      nombre: "Equipo de Precios",
      role: "PRECIOS",
      password: hash,
    },
  });

  // ── Artículos (maestro) ────────────────────────────────────
  // Incluye un laboratorio SIN comprador asignado ("Genéricos SA")
  // para ejercitar el camino "sinComprador".
  const articulos = [
    { codigoBarra: "7791234500011", descripcion: "Aspirina 500mg x20", laboratorio: "Bayer", categoria: "Analgésicos", stockReferencia: 320 },
    { codigoBarra: "7791234500028", descripcion: "Bepanthen Crema 30g", laboratorio: "Bayer", categoria: "Dermatología", stockReferencia: 75 },
    { codigoBarra: "7791234500035", descripcion: "Redoxon Naranja x10", laboratorio: "Bayer", categoria: "Vitaminas", stockReferencia: 12 },
    { codigoBarra: "7791234500042", descripcion: "Rivotral 0.5mg x30", laboratorio: "Roche", categoria: "Neurología", stockReferencia: 8 },
    { codigoBarra: "7791234500059", descripcion: "Bactrim Forte x14", laboratorio: "Roche", categoria: "Antibióticos", stockReferencia: 140 },
    { codigoBarra: "7791234500066", descripcion: "Lipitor 20mg x30", laboratorio: "Pfizer", categoria: "Cardiología", stockReferencia: 200 },
    { codigoBarra: "7791234500073", descripcion: "Viagra 50mg x4", laboratorio: "Pfizer", categoria: "Urología", stockReferencia: 45 },
    { codigoBarra: "7791234500080", descripcion: "Lyrica 75mg x14", laboratorio: "Pfizer", categoria: "Neurología", stockReferencia: 30 },
    { codigoBarra: "7791234500097", descripcion: "Novalgina 500mg x10", laboratorio: "Sanofi", categoria: "Analgésicos", stockReferencia: 500 },
    { codigoBarra: "7791234500103", descripcion: "Buscapina Compositum x20", laboratorio: "Sanofi", categoria: "Antiespasmódicos", stockReferencia: 90 },
    { codigoBarra: "7791234500110", descripcion: "Paracetamol Genérico 500mg x16", laboratorio: "Genéricos SA", categoria: "Analgésicos", stockReferencia: 1000 },
    { codigoBarra: "7791234500127", descripcion: "Ibuprofeno Genérico 400mg x20", laboratorio: "Genéricos SA", categoria: "Analgésicos", stockReferencia: 850 },
  ];
  for (const a of articulos) {
    await prisma.articulo.upsert({
      where: { codigoBarra: a.codigoBarra },
      update: a,
      create: a,
    });
  }

  console.log("\n✅ Seed completado.");
  console.log("─".repeat(56));
  console.log("Usuarios (contraseña para todos: " + DEMO_PASSWORD + ")");
  console.log("  admin@drogueria.com      → ADMIN");
  console.log("  farmacia@drogueria.com   → FARMACIA (Central 3303)");
  console.log("  c1@drogueria.com         → COMPRADOR (Bayer, Roche)");
  console.log("  s1@drogueria.com         → COMPRADOR (Pfizer, Sanofi)");
  console.log("  precios@drogueria.com    → PRECIOS");
  console.log("─".repeat(56));
  console.log(`Farmacias: ${farmacias.length} · Artículos: ${articulos.length}`);
  console.log("Lab sin comprador asignado: Genéricos SA (camino 'sinComprador')");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Error en el seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
