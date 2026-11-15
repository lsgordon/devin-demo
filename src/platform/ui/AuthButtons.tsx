"use client";
import { signIn, signOut } from "next-auth/react";

export function SignInButton() {
  return (
    <button className="primary" data-testid="sign-in" onClick={() => signIn("oidc", { redirectTo: "/" })}>
      Sign in with SSO
    </button>
  );
}

export function SignOutButton() {
  return (
    <button data-testid="sign-out" onClick={() => signOut({ redirectTo: "/login" })}>
      Sign out
    </button>
  );
}
