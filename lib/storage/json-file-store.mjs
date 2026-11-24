// import { randomUUID } from "node:crypto";
// import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
// import path from "node:path";

// export class JsonStoreError extends Error {
//   constructor(code, message) {
//     super(message);
//     this.name = "JsonStoreError";
//     this.code = code;
//   }
// }

// export class JsonFileStore {
//   constructor({ runtimeDir, seedDir, collections, validate }) {
//     this.runtimeDir = path.resolve(runtimeDir);
//     this.seedDir = path.resolve(seedDir);
//     this.collections = new Set(collections);
//     this.validate = validate;
//     this.locks = new Map();
//   }

//   #collectionFile(directory, collection) {
//     if (!this.collections.has(collection))
//       throw new JsonStoreError("INVALID_COLLECTION", "Unknown data collection");
//     const candidate = path.resolve(directory, `${collection}.json`);
//     if (!candidate.startsWith(`${directory}${path.sep}`))
//       throw new JsonStoreError("INVALID_COLLECTION", "Invalid data collection");
//     return candidate;
//   }

//   async #withLock(collection, operation) {
//     const previous = this.locks.get(collection) ?? Promise.resolve();
//     let release;
//     const current = new Promise((resolve) => {
//       release = resolve;
//     });
//     const queued = previous.then(() => current);
//     this.locks.set(collection, queued);
//     await previous;
//     try {
//       return await operation();
//     } finally {
//       release();
//       if (this.locks.get(collection) === queued) this.locks.delete(collection);
//     }
//   }

//   async #atomicWrite(filePath, value) {
//     await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
//     const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
//     let handle;
//     try {
//       handle = await open(temporaryPath, "wx", 0o600);
//       await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
//       await handle.sync();
//       await handle.close();
//       handle = undefined;
//       await rename(temporaryPath, filePath);
//     } catch (error) {
//       await handle?.close().catch(() => undefined);
//       await rm(temporaryPath, { force: true }).catch(() => undefined);
//       throw new JsonStoreError(
//         "STORAGE_WRITE_FAILED",
//         "Could not persist runtime data",
//       );
//     }
//   }

//   async #readJson(filePath, label) {
//     let raw;
//     try {
//       raw = await readFile(filePath, "utf8");
//     } catch {
//       throw new JsonStoreError(
//         "STORAGE_READ_FAILED",
//         `Could not read ${label} data`,
//       );
//     }
//     try {
//       return JSON.parse(raw);
//     } catch {
//       throw new JsonStoreError(
//         "STORAGE_INVALID_JSON",
//         `${label} data is not valid JSON`,
//       );
//     }
//   }

//   async #readUnlocked(collection) {
//     const runtimePath = this.#collectionFile(this.runtimeDir, collection);
//     await mkdir(this.runtimeDir, { recursive: true, mode: 0o700 });
//     try {
//       await stat(runtimePath);
//     } catch (error) {
//       if (error?.code !== "ENOENT")
//         throw new JsonStoreError(
//           "STORAGE_READ_FAILED",
//           "Could not inspect runtime data",
//         );
//       const seedPath = this.#collectionFile(this.seedDir, collection);
//       const seed = await this.#readJson(seedPath, "Seed");
//       let validSeed;
//       try {
//         validSeed = this.validate(collection, seed);
//       } catch {
//         throw new JsonStoreError(
//           "SEED_VALIDATION_FAILED",
//           "Seed data failed validation",
//         );
//       }
//       await this.#atomicWrite(runtimePath, validSeed);
//     }
//     const stored = await this.#readJson(runtimePath, "Runtime");
//     try {
//       return this.validate(collection, stored);
//     } catch {
//       throw new JsonStoreError(
//         "RUNTIME_VALIDATION_FAILED",
//         "Stored data failed validation",
//       );
//     }
//   }

//   async read(collection) {
//     return this.#withLock(collection, () => this.#readUnlocked(collection));
//   }

//   async update(collection, updater) {
//     return this.updateMany([collection], async (current) => ({
//       [collection]: await updater(current[collection]),
//     })).then((result) => result[collection]);
//   }

//   async updateMany(collections, updater) {
//     const names = [...new Set(collections)].sort();
//     if (names.length === 0)
//       throw new JsonStoreError(
//         "INVALID_COLLECTION",
//         "At least one collection is required",
//       );
//     const withLocks = async (index, operation) =>
//       index >= names.length
//         ? operation()
//         : this.#withLock(names[index], () => withLocks(index + 1, operation));

//     return withLocks(0, async () => {
//       const current = Object.fromEntries(
//         await Promise.all(
//           names.map(async (name) => [name, await this.#readUnlocked(name)]),
//         ),
//       );
//       const next = await updater(structuredClone(current));
//       const validated = {};
//       // try {
//       //   for (const name of names) validated[name] = this.validate(name, next[name] ?? current[name])
//       // } catch {
//       //   throw new JsonStoreError('RUNTIME_VALIDATION_FAILED', 'Updated data failed validation')
//       // }
//       try {
//         for (const name of names) {
//           validated[name] = this.validate(name, next[name] ?? current[name]);
//         }
//       } catch (error) {
//         console.error("JSON STORE VALIDATION ERROR:", error);

//         throw new JsonStoreError(
//           "RUNTIME_VALIDATION_FAILED",
//           error instanceof Error
//             ? `Updated data failed validation: ${error.message}`
//             : "Updated data failed validation",
//         );
//       }
//       const written = [];
//       try {
//         for (const name of names) {
//           if (JSON.stringify(validated[name]) === JSON.stringify(current[name]))
//             continue;
//           await this.#atomicWrite(
//             this.#collectionFile(this.runtimeDir, name),
//             validated[name],
//           );
//           written.push(name);
//         }
//       } catch (error) {
//         for (const name of written.reverse())
//           await this.#atomicWrite(
//             this.#collectionFile(this.runtimeDir, name),
//             current[name],
//           ).catch(() => undefined);
//         throw error;
//       }
//       return structuredClone(validated);
//     });
//   }

//   async resetToSeeds() {
//     const results = [];
//     for (const collection of this.collections) {
//       results.push(
//         await this.#withLock(collection, async () => {
//           const seed = await this.#readJson(
//             this.#collectionFile(this.seedDir, collection),
//             "Seed",
//           );
//           let validSeed;
//           try {
//             validSeed = this.validate(collection, seed);
//           } catch {
//             throw new JsonStoreError(
//               "SEED_VALIDATION_FAILED",
//               "Seed data failed validation",
//             );
//           }
//           await this.#atomicWrite(
//             this.#collectionFile(this.runtimeDir, collection),
//             validSeed,
//           );
//           return collection;
//         }),
//       );
//     }
//     return results;
//   }
// }

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { get, head, put } from "@vercel/blob";

function isBlobPreconditionError(error) {
  const message =
    error instanceof Error ? error.message : String(error);

  return (
    error?.name === "BlobPreconditionFailedError" ||
    error?.status === 412 ||
    error?.statusCode === 412 ||
    /precondition failed|etag mismatch/i.test(message)
  );
}

export class JsonStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "JsonStoreError";
    this.code = code;
  }
}

const BLOB_DATABASE_PATH = "medeasy/runtime/database.json";
const MAX_BLOB_RETRIES = 8;

export class JsonFileStore {
  static locks = new Map();

  constructor({
    runtimeDir,
    seedDir,
    collections,
    validate,
    blobPath = BLOB_DATABASE_PATH,
  }) {
    this.runtimeDir = path.resolve(runtimeDir);
    this.seedDir = path.resolve(seedDir);
    this.collections = new Set(collections);
    this.validate = validate;
    this.blobPath = blobPath;

    // Local development uses filesystem JSON.
    // Vercel production uses private Blob.
    this.useBlob =
      process.env.VERCEL === "1" ||
      process.env.MED_EASY_STORAGE === "blob";
  }

  #collectionFile(directory, collection) {
    if (!this.collections.has(collection)) {
      throw new JsonStoreError(
        "INVALID_COLLECTION",
        "Unknown data collection",
      );
    }

    const candidate = path.resolve(directory, `${collection}.json`);

    if (!candidate.startsWith(`${directory}${path.sep}`)) {
      throw new JsonStoreError(
        "INVALID_COLLECTION",
        "Invalid data collection",
      );
    }

    return candidate;
  }

  async #withLock(collection, operation) {
    // Blob stores all collections in one document,
    // so use one shared in-process lock.
    const lockKey = this.useBlob
      ? "__med_easy_blob_database__"
      : collection;

    const previous =
      JsonFileStore.locks.get(lockKey) ?? Promise.resolve();

    let release;

    const current = new Promise((resolve) => {
      release = resolve;
    });

    const queued = previous.then(() => current);

    JsonFileStore.locks.set(lockKey, queued);

    await previous;

    try {
      return await operation();
    } finally {
      release();

      if (JsonFileStore.locks.get(lockKey) === queued) {
        JsonFileStore.locks.delete(lockKey);
      }
    }
  }

  #validate(
    collection,
    value,
    errorCode = "RUNTIME_VALIDATION_FAILED",
  ) {
    try {
      return this.validate(collection, value);
    } catch (error) {
      console.error("JSON STORE VALIDATION ERROR:", error);

      throw new JsonStoreError(
        errorCode,
        error instanceof Error
          ? error.message
          : "Stored data failed validation",
      );
    }
  }

  async #readSeed(collection) {
    const seedPath = this.#collectionFile(
      this.seedDir,
      collection,
    );

    let raw;

    try {
      raw = await readFile(seedPath, "utf8");
    } catch {
      throw new JsonStoreError(
        "STORAGE_READ_FAILED",
        `Could not read seed data for ${collection}`,
      );
    }

    let seed;

    try {
      seed = JSON.parse(raw);
    } catch {
      throw new JsonStoreError(
        "STORAGE_INVALID_JSON",
        `Seed data for ${collection} is not valid JSON`,
      );
    }

    return this.#validate(
      collection,
      seed,
      "SEED_VALIDATION_FAILED",
    );
  }

  // ---------------------------------------------------------
  // LOCAL FILESYSTEM STORAGE
  // ---------------------------------------------------------

  async #atomicWrite(filePath, value) {
    await mkdir(path.dirname(filePath), {
      recursive: true,
      mode: 0o700,
    });

    const temporaryPath =
      `${filePath}.${process.pid}.${randomUUID()}.tmp`;

    let handle;

    try {
      handle = await open(temporaryPath, "wx", 0o600);

      await handle.writeFile(
        `${JSON.stringify(value, null, 2)}\n`,
        "utf8",
      );

      await handle.sync();
      await handle.close();
      handle = undefined;

      await rename(temporaryPath, filePath);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(
        () => undefined,
      );

      console.error("JSON FILE WRITE ERROR:", error);

      throw new JsonStoreError(
        "STORAGE_WRITE_FAILED",
        "Could not persist runtime data",
      );
    }
  }

  async #readJson(filePath, label) {
    let raw;

    try {
      raw = await readFile(filePath, "utf8");
    } catch {
      throw new JsonStoreError(
        "STORAGE_READ_FAILED",
        `Could not read ${label} data`,
      );
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw new JsonStoreError(
        "STORAGE_INVALID_JSON",
        `${label} data is not valid JSON`,
      );
    }
  }

  async #readLocalUnlocked(collection) {
    const runtimePath = this.#collectionFile(
      this.runtimeDir,
      collection,
    );

    await mkdir(this.runtimeDir, {
      recursive: true,
      mode: 0o700,
    });

    try {
      await stat(runtimePath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new JsonStoreError(
          "STORAGE_READ_FAILED",
          "Could not inspect runtime data",
        );
      }

      const seed = await this.#readSeed(collection);

      await this.#atomicWrite(runtimePath, seed);
    }

    const stored = await this.#readJson(
      runtimePath,
      "Runtime",
    );

    return this.#validate(collection, stored);
  }

  // ---------------------------------------------------------
  // PRIVATE VERCEL BLOB STORAGE
  // ---------------------------------------------------------

async #loadBlobDatabase() {
  try {
    for (let readAttempt = 1; readAttempt <= 3; readAttempt++) {
      const metadata = await head(this.blobPath, {
        access: "private",
      });

      const result = await get(this.blobPath, {
        access: "private",
        useCache: false,
      });

      if (!result || result.statusCode !== 200 || !result.stream) {
        return {
          database: { version: 1, collections: {} },
          etag: null,
        };
      }

      const raw = await new Response(result.stream).text();
      const database = JSON.parse(raw);

      if (
        !database ||
        database.version !== 1 ||
        !database.collections ||
        typeof database.collections !== "object" ||
        Array.isArray(database.collections)
      ) {
        throw new Error("Invalid Blob database structure.");
      }

      const getEtag = result.blob?.etag;
      const headEtag = metadata.etag;

      // Compare the opaque ETag value, ignoring only the weak prefix.
      const normalizeEtag = (value) =>
        typeof value === "string"
          ? value.replace(/^W\//, "")
          : null;

      if (
        getEtag &&
        headEtag &&
        normalizeEtag(getEtag) === normalizeEtag(headEtag)
      ) {
        console.log("[BLOB TRACE] Consistent Blob read:", {
          path: this.blobPath,
          readAttempt,
          getEtag,
          headEtag,
          usingEtag: headEtag,
        });

        return {
          database,
          etag: headEtag,
        };
      }

      console.warn("[BLOB TRACE] Blob changed during read:", {
        path: this.blobPath,
        readAttempt,
        getEtag,
        headEtag,
      });
    }

    throw new JsonStoreError(
      "Blob changed repeatedly while reading. Please retry.",
      "STORAGE_CONFLICT"
    );
  } catch (error) {
    if (error instanceof JsonStoreError) {
      throw error;
    }

    console.error("[BLOB TRACE] Blob read failed:", error);

    throw new JsonStoreError(
      "Unable to read Blob database.",
      "STORAGE_READ_FAILED"
    );
  }
}

  async #saveBlobDatabase(database, etag) {
    const body =
      `${JSON.stringify(database, null, 2)}\n`;

    try {
      const options = {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      };

      if (etag) {
        await put(this.blobPath, body, {
          ...options,
          ifMatch: etag,
        });
      } else {
        await put(this.blobPath, body, {
          ...options,
          allowOverwrite: false,
        });
      }

      return true;
    } catch (error) {
      if (
        isBlobPreconditionError(error) ||
        error?.name === "BlobAlreadyExistsError"
      ) {
        console.warn(
          "[JSON STORE] Blob changed during write. Reloading latest version.",
        );

        return false;
      }

      console.error("BLOB WRITE ERROR:", error);

      throw new JsonStoreError(
        "STORAGE_WRITE_FAILED",
        "Could not persist private Blob database",
      );
    }
  }

  // ---------------------------------------------------------
  // BLOB DATABASE UPDATE WITH DIAGNOSTICS
  // ---------------------------------------------------------

  async #updateBlobDatabase(updater) {
    for (
      let attempt = 1;
      attempt <= MAX_BLOB_RETRIES;
      attempt++
    ) {
      const { database, etag } =
        await this.#loadBlobDatabase();

      console.log("[BLOB TRACE] Database loaded:", {
        path: this.blobPath,
        attempt,
        hasEtag: Boolean(etag),
        etag,
        collections: Object.keys(database.collections),
      });

      // Keep an untouched snapshot for change detection.
      const original = structuredClone(database);
      const working = structuredClone(database);

      const next = await updater(working);

      const unchanged =
        JSON.stringify(next) === JSON.stringify(original);

      console.log("[BLOB TRACE] Update comparison:", {
        attempt,
        hasEtag: Boolean(etag),
        unchanged,
        originalCollections: Object.keys(original.collections),
        nextCollections: Object.keys(next.collections),
      });

      // Do not upload when an existing database has not changed.
      if (etag && unchanged) {
        console.log(
          "[BLOB TRACE] No changes detected. Skipping Blob write.",
          { attempt },
        );

        return structuredClone(next);
      }

      console.log("[BLOB TRACE] Attempting write:", {
        path: this.blobPath,
        attempt,
        hasEtag: Boolean(etag),
        etag,
      });

      const saved = await this.#saveBlobDatabase(
        next,
        etag,
      );

      if (saved) {
        console.log("[BLOB TRACE] Write successful:", {
          attempt,
        });

        return structuredClone(next);
      }

      console.warn("[BLOB TRACE] Write conflict:", {
        attempt,
        etag,
      });
    }

    throw new JsonStoreError(
      "STORAGE_CONFLICT",
      "Database changed repeatedly. Please retry the operation.",
    );
  }

  // ---------------------------------------------------------
  // BLOB COLLECTION READ
  // ---------------------------------------------------------

  async #readBlobUnlocked(collection) {
    let result;

    await this.#updateBlobDatabase(async (database) => {
      if (
        Object.prototype.hasOwnProperty.call(
          database.collections,
          collection,
        )
      ) {
        console.log(
          "[BLOB TRACE] Collection already exists:",
          {
            collection,
            count: Array.isArray(
              database.collections[collection],
            )
              ? database.collections[collection].length
              : "not-array",
          },
        );

        result = this.#validate(
          collection,
          database.collections[collection],
        );

        return database;
      }

      // Initialize only this missing collection from its seed.
      console.log(
        "[BLOB TRACE] Collection missing. Loading seed:",
        { collection },
      );

      const seed = await this.#readSeed(collection);

      database.collections[collection] = seed;

      result = seed;

      return database;
    });

    return structuredClone(result);
  }

  // ---------------------------------------------------------
  // PUBLIC STORAGE API
  // ---------------------------------------------------------

  async read(collection) {
    return this.#withLock(collection, () =>
      this.useBlob
        ? this.#readBlobUnlocked(collection)
        : this.#readLocalUnlocked(collection),
    );
  }

  async update(collection, updater) {
    const result = await this.updateMany(
      [collection],
      async (current) => ({
        [collection]: await updater(current[collection]),
      }),
    );

    return result[collection];
  }

  async updateMany(collections, updater) {
    const names = [...new Set(collections)].sort();

    if (names.length === 0) {
      throw new JsonStoreError(
        "INVALID_COLLECTION",
        "At least one collection is required",
      );
    }

    for (const name of names) {
      if (!this.collections.has(name)) {
        throw new JsonStoreError(
          "INVALID_COLLECTION",
          "Unknown data collection",
        );
      }
    }

    // Vercel Blob: acquire the shared database lock once.
    if (this.useBlob) {
      return this.#withLock(names[0], async () => {
        const database = await this.#updateBlobDatabase(
          async (database) => {
            const current = {};

            for (const name of names) {
              if (
                !Object.prototype.hasOwnProperty.call(
                  database.collections,
                  name,
                )
              ) {
                database.collections[name] =
                  await this.#readSeed(name);
              }

              current[name] = this.#validate(
                name,
                database.collections[name],
              );
            }

            const next = await updater(
              structuredClone(current),
            );

            for (const name of names) {
              database.collections[name] = this.#validate(
                name,
                next?.[name] ?? current[name],
              );
            }

            return database;
          },
        );

        return structuredClone(
          Object.fromEntries(
            names.map((name) => [
              name,
              database.collections[name],
            ]),
          ),
        );
      });
    }

    // Local filesystem: retain per-collection locks.
    const withLocks = async (index, operation) => {
      if (index >= names.length) {
        return operation();
      }

      return this.#withLock(
        names[index],
        () => withLocks(index + 1, operation),
      );
    };

    return withLocks(0, async () => {
      const current = Object.fromEntries(
        await Promise.all(
          names.map(async (name) => [
            name,
            await this.#readLocalUnlocked(name),
          ]),
        ),
      );

      const next = await updater(
        structuredClone(current),
      );

      const validated = {};

      for (const name of names) {
        validated[name] = this.#validate(
          name,
          next?.[name] ?? current[name],
        );
      }

      const written = [];

      try {
        for (const name of names) {
          if (
            JSON.stringify(validated[name]) ===
            JSON.stringify(current[name])
          ) {
            continue;
          }

          await this.#atomicWrite(
            this.#collectionFile(this.runtimeDir, name),
            validated[name],
          );

          written.push(name);
        }
      } catch (error) {
        for (const name of written.reverse()) {
          await this.#atomicWrite(
            this.#collectionFile(this.runtimeDir, name),
            current[name],
          ).catch(() => undefined);
        }

        throw error;
      }

      return structuredClone(validated);
    });
  }

  async resetToSeeds() {
    if (this.useBlob) {
      await this.#updateBlobDatabase(async (database) => {
        for (const collection of this.collections) {
          database.collections[collection] =
            await this.#readSeed(collection);
        }

        return database;
      });

      return [...this.collections];
    }

    const results = [];

    for (const collection of this.collections) {
      results.push(
        await this.#withLock(collection, async () => {
          const seed = await this.#readSeed(collection);

          await this.#atomicWrite(
            this.#collectionFile(this.runtimeDir, collection),
            seed,
          );

          return collection;
        }),
      );
    }

    return results;
  }
}
