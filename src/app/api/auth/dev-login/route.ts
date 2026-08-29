import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie, isDevLoginEnabled } from "@/lib/auth";
import { apiError, handleApi, parseBody } from "@/lib/api";

const devLoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address")
});

export const dynamic = "force-dynamic";

export const POST = handleApi(async (req) => {
  if (!isDevLoginEnabled()) {
    return apiError(403, "Dev login is disabled in this environment");
  }
  const { email } = await parseBody(devLoginSchema, req);
  const user = await createSessionCookie(email);
  return NextResponse.json({
    user: { id: user.id, email: user.email }
  });
});
