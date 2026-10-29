import { describe, it, expect, afterAll } from "vitest";
import { GET } from "@/app/api/health/route";
import { prisma } from "@/lib/prisma";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/health (integración)", () => {
  it("responde 200 ok cuando la DB está arriba", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; db: string };
    expect(data.ok).toBe(true);
    expect(data.db).toBe("up");
  });
});
