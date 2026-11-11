import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { randomInt } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// ─────────────────────────────────────────────────────────────
// Crea (o rehabilita) un usuario ADMIN con una clave temporal
// aleatoria, que se muestra UNA vez por consola y hay que cambiar
// en el primer ingreso. Es la forma de tener el administrador real
// en producción sin correr el seed (que crea usuarios demo).
//
//   npm run admin:crear -- juan@empresa.com "Juan Ojeda"
//
// Opcional, en el mismo paso: desactivar los usuarios demo del seed.
//
//   npm run admin:crear -- juan@empresa.com "Juan Ojeda" --desactivar-demo
// ─────────────────────────────────────────────────────────────

const EMAILS_DEMO = [
  "admin@drogueria.com",
  "farmacia@drogueria.com",
  "c1@drogueria.com",
  "s1@drogueria.com",
  "precios@drogueria.com",
];

const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
const DIAS_VIGENCIA = 14;

function claveTemporal(largo = 12): string {
  let out = "";
  for (let i = 0; i < largo; i++) out += ALFABETO[randomInt(ALFABETO.length)];
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const desactivarDemo = args.includes("--desactivar-demo");
  const [emailRaw, nombreRaw] = args.filter((a) => !a.startsWith("--"));
  const email = (emailRaw ?? "").trim().toLowerCase();
  const nombre = (nombreRaw ?? "").trim() || "Administrador";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Uso: npm run admin:crear -- <email> "<nombre>" [--desactivar-demo]');
    process.exit(1);
  }
  if (EMAILS_DEMO.includes(email)) {
    console.error("Ese email es de un usuario demo. Usá el email real del administrador.");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const clave = claveTemporal();
    const datos = {
      nombre,
      role: "ADMIN" as const,
      activo: true,
      password: await bcrypt.hash(clave, 10),
      mustChangePassword: true,
      claveTemporalVence: new Date(Date.now() + DIAS_VIGENCIA * 86_400_000),
    };
    await prisma.user.upsert({
      where: { email },
      update: datos,
      create: { email, ...datos },
    });

    console.log("\n✅ Administrador listo.");
    console.log("─".repeat(56));
    console.log(`  Email:           ${email}`);
    console.log(`  Clave temporal:  ${clave}`);
    console.log(`  Vence en ${DIAS_VIGENCIA} días. Al entrar se pide elegir una propia.`);
    console.log("─".repeat(56));
    console.log("  Anotala ahora: no se guarda y no se puede volver a ver.\n");

    if (desactivarDemo) {
      const r = await prisma.user.updateMany({
        where: { email: { in: EMAILS_DEMO }, activo: true },
        data: { activo: false },
      });
      console.log(`🔒 Usuarios demo desactivados: ${r.count}.`);
    } else {
      const demo = await prisma.user.count({
        where: { email: { in: EMAILS_DEMO }, activo: true },
      });
      if (demo > 0) {
        console.log(
          `⚠️  Hay ${demo} usuario(s) demo activo(s) con contraseña pública ("demo1234").\n` +
            "    Desactivalos cuando hayas entrado con tu admin:\n" +
            `      npm run admin:crear -- ${email} "${nombre}" --desactivar-demo\n` +
            "    (genera una clave nueva para vos), o uno por uno desde Usuarios.",
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
