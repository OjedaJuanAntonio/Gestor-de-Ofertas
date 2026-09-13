# Gestor de Ofertas · Droguería Central

Sistema web para gestionar **solicitudes de ofertas comerciales** entre ~140 farmacias
y la droguería central (stock inmovilizado, sobrestock o vencimiento próximo). Reemplaza
un flujo basado en Google Sheets, con ~1500 ítems diarios.

Flujo: **Carga (farmacia) → Aprobación (comprador) → Cierre (Precios)**, 100% trazable en
base de datos (sin WhatsApp ni llamadas).

## Stack

- **Next.js 16** (App Router, React Server Components) + **React 19**
- **PostgreSQL** + **Prisma 7** (driver adapter `pg`)
- **Auth.js (NextAuth v5)** con RBAC por rol (ADMIN / FARMACIA / COMPRADOR / PRECIOS)
- **Tailwind CSS 4** + Radix UI (UI accesible: fuentes grandes, alto contraste, teclado)
- Correos transaccionales vía **Resend** (con modo dry-run) y cola con dead-letter
- Tests: **Vitest** (unitarios + integración) y **Playwright** (E2E + accesibilidad con axe)

## Requisitos

- Node.js 20+ (probado con 24)
- Docker (para Postgres local) **o** una base PostgreSQL (Neon/Supabase)

## Puesta en marcha (local)

```bash
cd next-app
cp .env.example .env.local        # ya viene apuntado al Postgres de docker-compose

npm install
docker compose up -d              # levanta Postgres en localhost:5432
npx prisma migrate dev            # crea el esquema
npx prisma db seed                # usuarios + farmacias + compradores + artículos
npx tsx prisma/seed-demo.ts       # (opcional) solicitudes demo para el dashboard

npm run dev                       # http://localhost:3000
```

### Usuarios de prueba (contraseña: `demo1234`)

| Email | Rol | Acceso |
|-------|-----|--------|
| `admin@drogueria.com` | ADMIN | Todo + reportes + maestros |
| `farmacia@drogueria.com` | FARMACIA | Carga de solicitudes (Central 3303) |
| `c1@drogueria.com` | COMPRADOR | Bandeja (labs Bayer, Roche) |
| `s1@drogueria.com` | COMPRADOR | Bandeja (labs Pfizer, Sanofi) |
| `precios@drogueria.com` | PRECIOS | Carga ERP / cierre |

## Tests

```bash
npm test            # Vitest: lógica de negocio + integración contra Postgres
npm run test:e2e    # Playwright: flujo completo carga→aprobación→cierre + accesibilidad
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```

## Arquitectura

```
app/                      Rutas (App Router)
  (auth)/login            Login
  (dashboard)/farmacia    Módulo 1: carga (grilla tipo Excel) + mis-solicitudes
  (dashboard)/comprador   Módulo 2: bandeja de aprobaciones (bulk)
  (dashboard)/precios     Módulo 3: carga ERP + cierre
  (dashboard)/admin       Reportes, usuarios, farmacias, artículos/CSV, correos
  api/articulos/lookup    Autocompletado de EAN (cache + rate limit)
  api/cron/outbox         Procesa la cola de correos (Bearer CRON_SECRET o admin)
  api/export/analytics    Export CSV
lib/
  business/               Reglas puras y testeadas (validación, cierre, multicomprador)
  actions/                Server Actions transaccionales (envío, decisiones, cierre, admin)
  data/                   Consultas (lookup, bandejas, métricas, badges)
  email/                  Plantillas + sender Resend + procesador de outbox
  analytics/              Métricas gerenciales
prisma/                   schema.prisma + seed
tests/                    Vitest (unit/integration) + Playwright (e2e)
```

### Reglas de negocio destacadas (con correcciones aplicadas)

- **Un comprador maneja N laboratorios** (tabla `LaboratorioComprador`).
- **Envío transaccional e idempotente**: cabecera + ítems + notificaciones en una sola
  transacción; `idempotencyKey` evita duplicar lotes ante reintentos.
- **Snapshots históricos** de farmacia y comprador (trazabilidad si el maestro cambia).
- **Distribución multicomprador**: un correo por comprador; ítems de un laboratorio sin
  comprador asignado se aíslan y se avisan (no se pierden).
- **Cierre de ciclo**: una solicitud se finaliza cuando todos sus aprobados se cargan en
  el ERP (→ correo **consolidado** a la farmacia) o cuando es **100% rechazada**
  (→ correo de **rechazo total**, corrige el caso donde antes la farmacia nunca se
  enteraba). Flag anti-duplicado de notificación.
- **Outbox con reintentos + backoff + dead-letter**; destinatarios inválidos (`SIN_MAIL`)
  van a revisión manual en `/admin/correos`.

## Producción

1. **Base de datos**: reemplazá `DATABASE_URL` / `DIRECT_URL` por las de Neon o Supabase
   (pooler en `DATABASE_URL`, conexión directa en `DIRECT_URL`). Corré
   `npx prisma migrate deploy`.
2. **Auth**: generá `AUTH_SECRET` con `openssl rand -base64 32` y seteá `AUTH_URL`.
3. **Correos**: poné `RESEND_API_KEY`, `RESEND_FROM_EMAIL` y `EMAIL_DRY_RUN=false`.
4. **Cron de la cola**: configurá un cron (Vercel Cron, QStash, GitHub Action) que llame
   `POST /api/cron/outbox` cada 1-2 min con `Authorization: Bearer <CRON_SECRET>`.
