import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPublicPath(pathname: string) {
  if (pathname === "/login") return true;

  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;

  if (pathname.startsWith("/api")) return true;

  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  let res = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookies) {
        for (const cookie of cookies) {
          res.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
