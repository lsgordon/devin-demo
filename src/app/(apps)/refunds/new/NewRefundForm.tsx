"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { createRefundAction, type FormState } from "../actions";

export function NewRefundForm({ reasons }: { reasons: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRefundAction, null);
  // Submitting via onSubmit (not the form action) stops React resetting the fields when the server rejects input.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  return (
    <form action={action} onSubmit={onSubmit} className="card" data-testid="new-refund-form" style={{ maxWidth: 640 }}>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="field">Order id <input name="orderId" required placeholder="ORD-TEST-0000" /></label>
        <label className="field">Customer email <input name="customerEmail" type="email" required placeholder="testy@example.com" /></label>
        <label className="field">Card last 4 <input name="cardLast4" required pattern="\d{4}" maxLength={4} placeholder="4242" /></label>
        <label className="field">Amount ($) <input name="amount" required inputMode="decimal" placeholder="0.00" /></label>
        <label className="field">
          Reason
          <select name="reason" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="field">Note <input name="note" placeholder="Optional note for the approver" /></label>
      </div>
      {state?.error && <p role="alert" className="alert" data-testid="form-error" style={{ marginTop: "1rem" }}>{state.error}</p>}
      <div className="form-actions">
        <button className="primary" type="submit" disabled={pending} data-testid="create-refund">
          {pending ? "Creating…" : "Create refund request"}
        </button>
      </div>
    </form>
  );
}
