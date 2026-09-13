import { config } from "dotenv";

// Carga el entorno local para que los tests de integración accedan a la DB.
config({ path: ".env.local" });
config({ path: ".env" });
