import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const dataDir =
    process.env.MED_EASY_DATA_DIR ||
    path.resolve(process.cwd(), "data/runtime");

  const files = [
    "accounts.json",
    "users.json",
  ];

  const result: Record<string, unknown> = {};

  console.log("========== RUNTIME DATA DEBUG ==========");
  console.log("Data directory:", dataDir);
  console.log("Directory exists:", fs.existsSync(dataDir));

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const exists = fs.existsSync(filePath);

    if (exists) {
      const content = fs.readFileSync(filePath, "utf8");

      console.log(`\n========== ${file} ==========`);
      console.log(content);

      result[file] = {
        exists: true,
        size: Buffer.byteLength(content, "utf8"),
        content: JSON.parse(content),
      };
    } else {
      console.log(`${file}: NOT FOUND`);

      result[file] = {
        exists: false,
        path: filePath,
      };
    }
  }

  return NextResponse.json(result);
}