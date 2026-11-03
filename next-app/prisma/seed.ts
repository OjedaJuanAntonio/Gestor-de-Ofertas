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
    { id: "3303", nombre: "Farmacia Central 3303", email: "central3303@farma.com" },
    { id: "1102", nombre: "Farmacia del Pueblo 1102", email: "pueblo1102@farma.com" },
    { id: "4501", nombre: "Farmacia San Martín 4501", email: "sanmartin4501@farma.com" },
    { id: "9000", nombre: "Farmacia Sin Mail 9000", email: null }, // caso SIN_MAIL
  ];
  const farmacias = [];
  for (const f of farmaciasData) {
    farmacias.push(
      await prisma.farmacia.upsert({
        where: { id: f.id },
        update: { nombre: f.nombre, email: f.email },
        create: f,
      }),
    );
  }

  // ── Compradores ────────────────────────────────────────────
  const compradoresData = [
    { email: "c1@drogueria.com", nombre: "Claudio Acevedo" },
    { email: "s1@drogueria.com", nombre: "Sandra Ibáñez" },
  ];
  const compradorId: Record<string, string> = {};
  for (const c of compradoresData) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: { nombre: c.nombre, role: "COMPRADOR", password: hash, activo: true },
      create: { email: c.email, nombre: c.nombre, role: "COMPRADOR", password: hash },
    });
    compradorId[c.email] = user.id;
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

  // ── Proveedores (laboratorios) y su comprador responsable ──
  // "Genéricos SA" queda SIN comprador a propósito (camino "sinComprador").
  const proveedoresData = [
    { nombre: "Bayer", comprador: compradorId["c1@drogueria.com"] },
    { nombre: "Roche", comprador: compradorId["c1@drogueria.com"] },
    { nombre: "Pfizer", comprador: compradorId["s1@drogueria.com"] },
    { nombre: "Sanofi", comprador: compradorId["s1@drogueria.com"] },
    { nombre: "Genéricos SA", comprador: null as string | null },
  ];
  const proveedorId: Record<string, number> = {};
  for (const p of proveedoresData) {
    const prov = await prisma.proveedor.upsert({
      where: { nombre: p.nombre },
      update: { compradorId: p.comprador ?? null },
      create: { nombre: p.nombre, compradorId: p.comprador ?? null },
    });
    proveedorId[p.nombre] = prov.id;
  }

  // ── Artículos (maestro) ────────────────────────────────────
  const articulos = [
    { codigoBarra: "7791234500011", descripcion: "Aspirina 500mg x20", laboratorio: "Bayer" },
    { codigoBarra: "7791234500028", descripcion: "Bepanthen Crema 30g", laboratorio: "Bayer" },
    { codigoBarra: "7791234500035", descripcion: "Redoxon Naranja x10", laboratorio: "Bayer" },
    { codigoBarra: "7791234500042", descripcion: "Rivotral 0.5mg x30", laboratorio: "Roche" },
    { codigoBarra: "7791234500059", descripcion: "Bactrim Forte x14", laboratorio: "Roche" },
    { codigoBarra: "7791234500066", descripcion: "Lipitor 20mg x30", laboratorio: "Pfizer" },
    { codigoBarra: "7791234500073", descripcion: "Viagra 50mg x4", laboratorio: "Pfizer" },
    { codigoBarra: "7791234500080", descripcion: "Lyrica 75mg x14", laboratorio: "Pfizer" },
    { codigoBarra: "7791234500097", descripcion: "Novalgina 500mg x10", laboratorio: "Sanofi" },
    { codigoBarra: "7791234500103", descripcion: "Buscapina Compositum x20", laboratorio: "Sanofi" },
    { codigoBarra: "7791234500110", descripcion: "Paracetamol Genérico 500mg x16", laboratorio: "Genéricos SA" },
    { codigoBarra: "7791234500127", descripcion: "Ibuprofeno Genérico 400mg x20", laboratorio: "Genéricos SA" },
  ];
  for (const a of articulos) {
    const { laboratorio, ...rest } = a;
    const data = { ...rest, proveedorId: proveedorId[laboratorio] };
    await prisma.articulo.upsert({
      where: { codigoBarra: a.codigoBarra },
      update: data,
      create: data,
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
