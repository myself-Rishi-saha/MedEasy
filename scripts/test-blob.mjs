import { put, list } from "@vercel/blob";

try {
  const result = await put(
    "medeasy/diagnostics/connection-test.txt",
    "Med Easy Blob connection test",
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
    }
  );

  console.log("UPLOAD SUCCESS:", result.pathname);

  const files = await list({
    prefix: "medeasy/diagnostics/",
  });

  console.log("BLOB LIST SUCCESS:", files.blobs.length);
} catch (error) {
  console.error("BLOB TEST FAILED:", error.message);
  process.exitCode = 1;
}