import { redirect } from "next/navigation";
import { getCurrentUser } from "@/platform/authz";
import { SignInButton } from "@/platform/ui/AuthButtons";

// Public page (allowlisted in tests/unit/enforcement.test.ts).
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="card center-card">
      <span className="logo">IT</span>
      <h1>Sign in to Internal tools</h1>
      <p>Use your company account to continue.</p>
      {error && (
        <p role="alert" className="alert" data-testid="sign-in-error">
          Sign-in didn&apos;t complete (it may have expired). Please try again.
        </p>
      )}
      <SignInButton />
    </div>
  );
}
