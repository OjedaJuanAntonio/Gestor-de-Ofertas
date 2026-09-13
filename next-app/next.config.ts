import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Hay otro package-lock.json en el home del usuario; fijamos la raíz
  // del workspace a este proyecto para que Turbopack resuelva bien.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
