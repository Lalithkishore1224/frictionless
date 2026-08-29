import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processSubmission } from "@/lib/submissionWorker";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

// Submissions in an active state older than this are treated as abandoned
// (a previous worker run was interrupted) and re-processed.
const STALE_MS = 12 * 60 * 1000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.WORKER_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "WORKER_TOKEN not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_MS);

  // A PENDING row is unclaimed (processSubmission flips it to CHECKING at the
  // start of processing), so pick the oldest one.
  const queued = await prisma.appSubmission.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" }
  });

  let processed: string | null = null;
  let skipped = 0;

  if (queued) {
    await processSubmission(queued.id);
    processed = queued.id;
  } else {
    // Nothing newly queued. If a worker died mid-verification, a submission
    // may be stuck in CHECKING with no recent update — recover it.
    const stuck = await prisma.appSubmission.findFirst({
      where: { status: "CHECKING", updatedAt: { lt: cutoff } },
      orderBy: { updatedAt: "asc" }
    });
    if (stuck) {
      await processSubmission(stuck.id);
      processed = stuck.id;
    } else {
      const activePending = await prisma.appSubmission.count({ where: { status: "PENDING" } });
      const activeChecking = await prisma.appSubmission.count({ where: { status: "CHECKING" } });
      skipped = activePending + activeChecking;
    }
  }

  return NextResponse.json({ ok: true, processed, skipped });
}
