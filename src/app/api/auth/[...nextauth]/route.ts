import type { NextRequest } from "next/server";
import { handlers } from "@/platform/auth/auth";
import { publicRoute } from "@/platform/authz";

// The OIDC sign-in/callback endpoints must be reachable before login.
export const GET = publicRoute(async (req: NextRequest) => handlers.GET(req));
export const POST = publicRoute(async (req: NextRequest) => handlers.POST(req));
