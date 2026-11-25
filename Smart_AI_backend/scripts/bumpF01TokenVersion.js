"use strict";

/**
 * One-off F-01 Wave 1 migration.
 *
 * Wave 1 stops storing raw refresh tokens and adds a single-session
 * `tokenVersion` contract. Every pre-existing access/refresh token must be
 * invalidated exactly once. This script:
 *   - bumps `tokenVersion` for every user that has not been migrated,
 *   - clears all refresh-session fields,
 *   - removes the legacy raw `refreshToken` field,
 *   - writes a per-user audit marker AND a global migration marker so a later
 *     rerun cannot touch users created after the first successful apply.
 *
 * Recovery uses a lease/heartbeat:
 *   - the active owner renews `heartbeatAt` periodically;
 *   - takeover is only allowed when the heartbeat is valid and stale, and the
 *     atomic claim matches the previously observed runId + heartbeatAt;
 *   - a missing/invalid heartbeat never proves abandonment;
 *   - per-user markers make resuming idempotent.
 *
 * It never runs at application startup and must be run manually by a
 * developer against an approved database.
 *
 * Usage (dry-run is the default and never writes):
 *   node scripts/bumpF01TokenVersion.js
 *   node scripts/bumpF01TokenVersion.js --dry-run
 *   node scripts/bumpF01TokenVersion.js --apply
 *   node scripts/bumpF01TokenVersion.js --resume   # or --recover
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const logger = require("../utils/logger");
const User = require("../models/User");

const MARKER = "f01-token-version-bump";
const MARKER_FIELD = "f01TokenVersionBumpMarker";
const BUMPED_AT_FIELD = "f01TokenVersionBumpedAt";
const MARKER_COLLECTION = "migrations";
const MARKER_STATUS_RUNNING = "running";
const MARKER_STATUS_COMPLETED = "completed";
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;
const DEFAULT_LEASE_TTL_MS = 30 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 1000;

function buildFilter() {
  return { [MARKER_FIELD]: { $ne: MARKER } };
}

function buildUpdate(now = new Date()) {
  return {
    $inc: { tokenVersion: 1 },
    $set: {
      [MARKER_FIELD]: MARKER,
      [BUMPED_AT_FIELD]: now,
      refreshTokenHash: null,
      refreshTokenPrevHash: null,
      refreshTokenSessionId: null,
      refreshTokenRotatedAt: null,
    },
    $unset: { refreshToken: "" },
  };
}

function planBump({ dryRun = true, now = new Date() } = {}) {
  return {
    marker: MARKER,
    dryRun: !!dryRun,
    filter: buildFilter(),
    update: buildUpdate(now),
  };
}

function parseArgs(argv = []) {
  const args = argv.slice(2);
  const hasApply = args.includes("--apply");
  const hasDryRun = args.includes("--dry-run");
  const hasResume = args.includes("--resume") || args.includes("--recover");
  const unknown = args.filter(
    (arg) =>
      arg !== "--apply" &&
      arg !== "--dry-run" &&
      arg !== "--resume" &&
      arg !== "--recover",
  );

  if (hasApply && hasDryRun) {
    throw new Error("Use either --dry-run or --apply, not both");
  }

  if (hasResume && hasDryRun) {
    throw new Error("Use either --dry-run or --resume, not both");
  }

  if (hasApply && hasResume) {
    throw new Error("Use either --apply or --resume, not both");
  }

  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  }

  return { dryRun: !hasApply && !hasResume, resume: hasResume };
}

function createMongoMarkerStore(connection = mongoose.connection) {
  const collection = connection.collection(MARKER_COLLECTION);

  return {
    async claim({
      marker,
      runId,
      now,
      resume = false,
      staleAfterMs = DEFAULT_STALE_AFTER_MS,
      leaseTtlMs = DEFAULT_LEASE_TTL_MS,
    }) {
      try {
        await collection.insertOne({
          _id: marker,
          marker,
          status: MARKER_STATUS_RUNNING,
          runId,
          startedAt: now,
          heartbeatAt: now,
        });
        return { claimed: true, status: MARKER_STATUS_RUNNING };
      } catch (err) {
        if (!err || err.code !== 11000) {
          throw err;
        }

        const existing = await collection.findOne({ _id: marker });
        if (!existing) {
          return { claimed: false, status: "unknown" };
        }

        if (existing.status === MARKER_STATUS_COMPLETED) {
          return { claimed: false, status: MARKER_STATUS_COMPLETED };
        }

        if (existing.status !== MARKER_STATUS_RUNNING) {
          return { claimed: false, status: existing.status };
        }

        const heartbeatMs = existing.heartbeatAt
          ? new Date(existing.heartbeatAt).getTime()
          : NaN;
        const heartbeatValid = Number.isFinite(heartbeatMs);

        if (!heartbeatValid) {
          return {
            claimed: false,
            status: MARKER_STATUS_RUNNING,
            invalidHeartbeat: true,
          };
        }

        if (!resume) {
          return { claimed: false, status: MARKER_STATUS_RUNNING };
        }

        if (now.getTime() - heartbeatMs < leaseTtlMs) {
          return {
            claimed: false,
            status: MARKER_STATUS_RUNNING,
            active: true,
          };
        }

        const takeover = await collection.findOneAndUpdate(
          {
            _id: marker,
            status: MARKER_STATUS_RUNNING,
            runId: existing.runId,
            heartbeatAt: existing.heartbeatAt,
          },
          {
            $set: {
              runId,
              startedAt: now,
              heartbeatAt: now,
            },
          },
          { returnDocument: "after" },
        );

        if (!takeover) {
          return {
            claimed: false,
            status: MARKER_STATUS_RUNNING,
            active: true,
          };
        }

        return { claimed: true, status: MARKER_STATUS_RUNNING, resumed: true };
      }
    },

    async renew({ marker, runId, now }) {
      const result = await collection.updateOne(
        { _id: marker, runId, status: MARKER_STATUS_RUNNING },
        { $set: { heartbeatAt: now } },
      );

      const modified = result && (result.modifiedCount ?? result.nModified ?? 0);
      return modified === 1;
    },

    async complete({ marker, runId, now }) {
      const result = await collection.updateOne(
        { _id: marker, runId, status: MARKER_STATUS_RUNNING },
        { $set: { status: MARKER_STATUS_COMPLETED, completedAt: now } },
      );

      const modified = result && (result.modifiedCount ?? result.nModified ?? 0);
      return modified === 1;
    },

    async getStatus({ marker }) {
      const existing = await collection.findOne({ _id: marker });
      return existing ? existing.status : null;
    },
  };
}

async function runBump({
  model = User,
  markers = createMongoMarkerStore(),
  dryRun = true,
  now = new Date(),
  runId = crypto.randomUUID(),
  resume = false,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  leaseTtlMs = DEFAULT_LEASE_TTL_MS,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
} = {}) {
  const filter = buildFilter();

  if (dryRun) {
    const status = await markers.getStatus({ marker: MARKER });
    const candidates = await model.countDocuments(filter);

    return {
      marker: MARKER,
      dryRun: true,
      alreadyApplied: status === MARKER_STATUS_COMPLETED,
      candidates,
      matched: 0,
      modified: 0,
    };
  }

  const claim = await markers.claim({
    marker: MARKER,
    runId,
    now,
    resume,
    staleAfterMs,
    leaseTtlMs,
  });

  if (!claim.claimed) {
    if (claim.status === MARKER_STATUS_COMPLETED) {
      return {
        marker: MARKER,
        dryRun: false,
        alreadyApplied: true,
        candidates: 0,
        matched: 0,
        modified: 0,
        resumed: false,
      };
    }

    if (claim.invalidHeartbeat) {
      throw new Error(
        "F-01 migration recovery refused: heartbeat is missing or invalid; manual inspection required",
      );
    }

    if (claim.active) {
      throw new Error(
        "F-01 migration is currently running in another invocation; refusing to take over an active run",
      );
    }

    if (resume) {
      throw new Error(
        "F-01 migration recovery refused: the interrupted run is not old enough to be considered abandoned",
      );
    }

    throw new Error(
      "F-01 migration is already running in another invocation; refusing to write",
    );
  }

  let lostOwnership = false;
  const heartbeatTimer = setInterval(async () => {
    try {
      const ok = await markers.renew({
        marker: MARKER,
        runId,
        now: new Date(),
      });
      if (!ok) {
        lostOwnership = true;
        clearInterval(heartbeatTimer);
      }
    } catch (err) {
      lostOwnership = true;
      clearInterval(heartbeatTimer);
    }
  }, heartbeatIntervalMs);

  // Keep the event loop alive for the interval but do not block exit.
  if (typeof heartbeatTimer.unref === "function") {
    heartbeatTimer.unref();
  }

  try {
    const result = await model.updateMany(filter, buildUpdate(now));
    const matched = result && (result.matchedCount ?? result.n ?? 0);
    const modified = result && (result.modifiedCount ?? result.nModified ?? 0);

    if (lostOwnership) {
      throw new Error(
        "F-01 migration lost ownership during execution; stopping without marking completed",
      );
    }

    const completed = await markers.complete({
      marker: MARKER,
      runId,
      now: new Date(),
    });

    if (!completed) {
      throw new Error(
        "F-01 migration marker could not be completed; inspect the migrations collection before rerunning",
      );
    }

    if (lostOwnership) {
      throw new Error(
        "F-01 migration lost ownership before completion; stopping without marking completed",
      );
    }

    return {
      marker: MARKER,
      dryRun: false,
      alreadyApplied: false,
      candidates: matched,
      matched,
      modified,
      resumed: !!claim.resumed,
    };
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv);
  } catch (err) {
    logger.error({ err: err.message }, "Invalid migration arguments");
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.MONGO_CONNECTION_STRING;
  if (!connectionString) {
    logger.error("MONGO_CONNECTION_STRING is not set");
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(connectionString, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  } catch (err) {
    logger.error({ err: err.message }, "MongoDB connection failed");
    process.exitCode = 1;
    return;
  }

  logger.info(
    options.dryRun
      ? "Connected to MongoDB — DRY RUN (no writes)"
      : "Connected to MongoDB — APPLY (writes enabled)",
  );

  try {
    const result = await runBump({ dryRun: options.dryRun, resume: options.resume });
    logger.info(result, "F-01 tokenVersion migration result");

    if (!options.dryRun && result.alreadyApplied) {
      logger.info("Migration already applied; no users were modified.");
    } else if (!options.dryRun && result.resumed) {
      logger.info("Interrupted migration resumed safely; already-migrated users were not bumped again.");
    } else if (!options.dryRun) {
      logger.info(
        "Migration applied. Existing browser sessions must sign in again; cookies were not modified.",
      );
    }
  } catch (err) {
    logger.error({ err: err.message }, "F-01 tokenVersion migration failed");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
}

module.exports = {
  MARKER,
  MARKER_FIELD,
  BUMPED_AT_FIELD,
  MARKER_COLLECTION,
  MARKER_STATUS_RUNNING,
  MARKER_STATUS_COMPLETED,
  DEFAULT_STALE_AFTER_MS,
  DEFAULT_LEASE_TTL_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  buildFilter,
  buildUpdate,
  planBump,
  parseArgs,
  createMongoMarkerStore,
  runBump,
  main,
};

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err: err.message }, "F-01 tokenVersion migration failed");
    process.exitCode = 1;
  });
}