import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/auth", "/api/auth/login", "/api/auth/signup", "/api/health", "/api/internal/sheets-sync"];

export function proxy(request) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
  const isAsset = pathname.startsWith("/_next") || pathname.includes(".");
  const isApi = pathname.startsWith("/api/");
  const hasSession = request.cookies.has("pulse_session");

  if (isApi) {
    return NextResponse.next();
  }

  if (!isPublic && !isAsset && !hasSession) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  if (pathname === "/auth" && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
