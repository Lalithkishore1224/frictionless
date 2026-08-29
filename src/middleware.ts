import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = () =>
  new TextEncoder().encode(
    process.env.SESSION_SECRET ?? "servelless-insecure-dev-secret"
  );

async function getSession(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET(), {
      algorithms: ["HS256"]
    });
    return payload;
  } catch {
    return null;
  }
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await getSession(req);

  if (pathname.startsWith("/admin")) {
    const admins = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const email = (session?.email as string | undefined) ?? "";
    if (!session || !admins.includes(email.toLowerCase())) {
      return redirectToLogin(req);
    }
  }

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/developers")) {
    if (!session) return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/developers/:path*"]
};
