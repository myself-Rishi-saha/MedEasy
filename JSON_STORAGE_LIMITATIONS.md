# JSON storage limitations

Med Easy currently stores application records as JSON files. This is a development/demo storage mode, not a substitute for a transactional database or a durable production datastore.

## Process-local write serialization

`JsonFileStore` serializes reads and writes per collection inside one Node.js process. It writes a temporary file, flushes it, and renames it over the collection file. These measures reduce torn single-file writes and prevent concurrent updates within that process from overwriting one another.

The lock is held in process memory. It does not coordinate separate Node.js workers, serverless functions, containers, or deployments. Two instances can read the same old file and race to replace it; each can report success while one update overwrites the other. Stock-adjustment idempotency and recovery are likewise guaranteed only within the supported single-process model. Do not claim cross-instance atomicity or exactly-once delivery across multiple instances.

## Partial writes across files

A stock adjustment and its movement records are separate JSON collections. The service stores the adjustment, including its idempotency key, request fingerprint, and expected movement result, before appending movements. It rolls back the adjustment if movement persistence fails. If rollback itself fails or the process stops between writes, the adjustment record acts as a recovery journal; a later adjustment request in that process can restore missing movement records. A failure may still leave a temporary cross-file inconsistency until recovery runs, and independent readers do not participate in a multi-file transaction.

## Backups and recovery

- Back up the complete runtime data directory as a consistent set, not individual files at unrelated times.
- Keep backups outside the application deployment and restrict access because they contain business and account data.
- Before restoring, stop all application writers, restore the full directory, and verify each JSON file parses and validates against its schema.
- Keep a known-good backup before manual edits or reset operations. Never treat seed data as a backup of runtime changes.
- For suspected adjustment inconsistencies, preserve a copy of the runtime directory before recovery; compare adjustment records and movement records by adjustment/source ID, then run the application’s JSON validation checks.

## Intended use

JSON files are currently used to keep development and demo setup simple. They lack database transactions, cross-instance locking, operational backup automation, high-availability guarantees, and scalable query/index behavior. Do not use this storage mode for multi-instance production traffic or as the sole durable system of record without adding external coordination and a recovery plan. This document describes the current behavior and limitations; it does not add a database connection or change the storage backend.
