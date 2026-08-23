import { afterEach, describe, expect, it, vi } from "vitest";

describe("PostgreSQL pool", () => {
  afterEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("registers an idle-client error listener so ETIMEDOUT does not crash the process", async () => {
    const on = vi.fn();
    class MockPool {
      on = on;
    }

    vi.doMock("pg", () => ({
      default: { Pool: MockPool },
    }));
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@localhost:5432/ironbark");
    vi.stubEnv("PGSSLMODE", "disable");

    const { getPool } = await import("./client.js");
    getPool();

    expect(on).toHaveBeenCalledWith("error", expect.any(Function));

    const listener = on.mock.calls.find(([event]) => event === "error")?.[1] as (
      error: Error,
    ) => void;
    expect(() => listener(new Error("read ETIMEDOUT"))).not.toThrow();
  });
});
