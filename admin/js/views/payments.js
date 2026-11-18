"use strict";

import { renderEmptyState } from "../components/empty-state.js";

// Renders the payment transaction audit placeholder view
export function renderPayments(container) {
  renderEmptyState(
    container,
    "Payment Auditing",
    "Audit Paystack one-time access transactions, check references, and verify payment statuses here.",
    "💳"
  );
}
