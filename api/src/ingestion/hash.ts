import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function sha256File(absolutePath: string): Promise<string> {
  const content = await readFile(absolutePath);
  return createHash("sha256").update(content).digest("hex");
}
