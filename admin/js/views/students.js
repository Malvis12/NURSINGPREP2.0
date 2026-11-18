"use strict";

import { renderEmptyState } from "../components/empty-state.js";

// Renders the student roster and progress placeholder view
export function renderStudents(container) {
  renderEmptyState(
    container,
    "Student Profiles",
    "View registered students, track exam progress history, and manually grant membership access here.",
    "👥"
  );
}
