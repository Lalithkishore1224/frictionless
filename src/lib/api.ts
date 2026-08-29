import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { SessionError } from "./auth";

export function apiError(status: number, message: string, details?: unknown) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status }
  );
}

export async function parseBody<T>(schema: ZodType<T>, request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiRequestError(400, "Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiRequestError(400, "Validation failed", result.error.flatten());
  }
  return result.data;
}

export class ApiRequestError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export interface ApiContext {
  params: Promise<Record<string, string>>;
}

export function handleApi(
  fn: (req: Request, ctx: ApiContext) => Promise<NextResponse>
): (req: Request, ctx: ApiContext) => Promise<NextResponse> {
  return (req, ctx) =>
    fn(req, ctx).catch((err: unknown) => {
      if (err instanceof SessionError) {
        const status = err.code === "FORBIDDEN" ? 403 : 401;
        return apiError(status, err.message);
      }
      if (err instanceof ApiRequestError) {
        return apiError(err.status, err.message, err.details);
      }
      if (err instanceof ZodError) {
        return apiError(400, "Validation failed", err.flatten());
      }
      if (err instanceof Error) {
        return apiError(500, err.message);
      }
      return apiError(500, "Unexpected server error");
    });
}
