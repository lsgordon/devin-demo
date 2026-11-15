import { redirect } from "next/navigation";
import { getCurrentUser } from "@/platform/authz";
import { SignInButton } from "@/platform/ui/AuthButtons";

// Public page (allowlisted in tests/unit/enforcement.test.ts).
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="card" style={{ maxWidth: 420, margin: "4rem auto" }}>
      <h1>Internal tools</h1>
      <p className="muted">Sign in with your company account.</p>
      <SignInButton />
    </div>
  );
}
