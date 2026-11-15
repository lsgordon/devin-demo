"use client";

import { useActionState } from "react";
import { createRefundAction, type FormState } from "../actions";

export function NewRefundForm({ reasons }: { reasons: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRefundAction, null);
  return (
    <form action={action} className="card" data-testid="new-refund-form" style={{ display: "grid", gap: ".6rem", maxWidth: 420 }}>
      <label>Order id <input name="orderId" required placeholder="ORD-TEST-0000" /></label>
      <label>Customer email <input name="customerEmail" type="email" required placeholder="testy@example.com" /></label>
      <label>Card last 4 <input name="cardLast4" required pattern="\d{4}" maxLength={4} placeholder="1234" /></label>
      <label>Amount ($) <input name="amount" required inputMode="decimal" placeholder="0.00" /></label>
      <label>
        Reason{" "}
        <select name="reason" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label>Note <input name="note" placeholder="Optional note for the approver" /></label>
      {state?.error && <p role="alert" data-testid="form-error" style={{ color: "var(--danger)" }}>{state.error}</p>}
      <button className="primary" type="submit" disabled={pending} data-testid="create-refund">Create refund request</button>
    </form>
  );
}
