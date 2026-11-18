"use strict";

import { renderEmptyState } from "../components/empty-state.js";

// Renders the question bank management placeholder view
export function renderQuestions(container) {
  renderEmptyState(
    container,
    "Question Bank Management",
    "Create, edit, search, and bulk-import nursing questions for 200, 300, and 400 levels here.",
    "☷"
  );
}
