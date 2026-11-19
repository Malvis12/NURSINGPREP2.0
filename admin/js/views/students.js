"use strict";

import { adminRequest } from "../api.js";
import { createDataTable } from "../components/data-table.js";
import { createPagination } from "../components/pagination.js";
import { createDrawer } from "../components/drawer.js";
import { openStudentDetail } from "./student-detail.js";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

let sharedDrawer = null;
function getSharedDrawer() {
  if (!sharedDrawer) sharedDrawer = createDrawer();
  return sharedDrawer;
}

// Renders the student directory view with debounced search, filtering, and pagination
export function renderStudents(container) {
  container.replaceChildren();

  const drawer = getSharedDrawer();
  let cursorStack = [null];
  let pageIndex = 0;
  let currentRequestId = 0;
  let debounceTimer = null;
  let lastHasMore = false;

  const toolbar = document.createElement("section");
  toolbar.className = "admin-toolbar";
  toolbar.setAttribute("aria-label", "Filter and search students");

  const searchWrap = document.createElement("div");
  searchWrap.className = "toolbar-search-wrap";
  const searchInput = document.createElement("input");
  searchInput.id = "student-search-input";
  searchInput.type = "search";
  searchInput.className = "toolbar-search-input";
  searchInput.placeholder = "Search by email";
  searchInput.setAttribute("aria-label", "Search by email");
  searchWrap.append(searchInput);

  const filterWrap = document.createElement("div");
  filterWrap.className = "toolbar-filter-wrap";

  const statusSelect = document.createElement("select");
  statusSelect.id = "student-status-filter";
  statusSelect.className = "toolbar-select";
  statusSelect.setAttribute("aria-label", "Filter by status");
  [["", "All Statuses"], ["active", "Active"], ["pending_payment", "Pending Payment"]].forEach(([v, l]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = l;
    statusSelect.append(o);
  });

  const levelSelect = document.createElement("select");
  levelSelect.id = "student-level-filter";
  levelSelect.className = "toolbar-select";
  levelSelect.setAttribute("aria-label", "Filter by level");
  [["", "All Levels"], ["200", "200 Level"], ["300", "300 Level"], ["400", "400 Level"]].forEach(([v, l]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = l;
    levelSelect.append(o);
  });

  filterWrap.append(statusSelect, levelSelect);
  toolbar.append(searchWrap, filterWrap);
  container.append(toolbar);

  const table = createDataTable({
    caption: "Registered students list",
    columns: [
      {
        key: "displayName",
        label: "Name",
        render: (row) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "student-name-btn";
          btn.textContent = row.displayName || "—";
          btn.setAttribute("aria-label", `View details for ${row.displayName || row.email || "student"}`);
          btn.addEventListener("click", () => openStudentDetail(row.uid, drawer, btn, () => fetchStudents()));
          return btn;
        },
      },
      { key: "email", label: "Email", render: (r) => r.email || "—" },
      { key: "academicLevel", label: "Level", nowrap: true, render: (r) => (r.academicLevel ? `${r.academicLevel} Level` : "—") },
      {
        key: "membershipStatus",
        label: "Status",
        nowrap: true,
        render: (r) => {
          const pill = document.createElement("span");
          pill.className = `pill ${r.membershipStatus === "active" ? "multiple-choice" : r.membershipStatus === "pending_payment" ? "hard" : ""}`.trim();
          pill.textContent = r.membershipStatus === "active" ? "Active" : r.membershipStatus === "pending_payment" ? "Pending Payment" : (r.membershipStatus || "—");
          return pill;
        },
      },
      { key: "createdAt", label: "Joined", nowrap: true, render: (r) => formatDate(r.createdAt) },
    ],
    emptyTitle: "No students found",
    emptyHint: "Try adjusting your search criteria or filter selections.",
    onRetry: () => fetchStudents(),
  });
  table.element.classList.add("student-table");
  container.append(table.element);

  table.element.querySelector("tbody").addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    const tr = event.target.closest("tr");
    if (!tr || tr.classList.contains("admin-table-skeleton-row") || tr.querySelector(".admin-table-empty-cell, .admin-table-error")) return;
    const nameBtn = tr.querySelector(".student-name-btn");
    if (nameBtn) nameBtn.click();
  });

  const pagination = createPagination({
    onPrev: () => { if (pageIndex > 0) { pageIndex -= 1; fetchStudents(); } },
    onNext: () => { if (lastHasMore) { pageIndex += 1; fetchStudents(); } },
  });
  container.append(pagination.element);

  function syncFilterMute() {
    const hasSearch = searchInput.value.trim().length > 0;
    statusSelect.disabled = hasSearch;
    levelSelect.disabled = hasSearch;
    statusSelect.classList.toggle("is-muted", hasSearch);
    levelSelect.classList.toggle("is-muted", hasSearch);
  }

  async function fetchStudents() {
    const requestId = ++currentRequestId;
    table.setLoading();
    pagination.update({ hasPrev: pageIndex > 0, hasNext: false, count: 0 });

    const q = searchInput.value.trim();
    const params = new URLSearchParams();
    if (q) {
      params.set("q", q);
    } else {
      if (statusSelect.value) params.set("status", statusSelect.value);
      if (levelSelect.value) params.set("level", levelSelect.value);
    }

    const currentCursor = cursorStack[pageIndex];
    if (currentCursor) params.set("cursor", currentCursor);

    try {
      const data = await adminRequest(`/api/admin/students?${params.toString()}`);
      if (requestId !== currentRequestId) return;

      lastHasMore = Boolean(data.hasMore);
      if (data.nextCursor && cursorStack.length <= pageIndex + 1) {
        cursorStack.push(data.nextCursor);
      }

      table.setRows(data.items);
      pagination.update({
        hasPrev: pageIndex > 0,
        hasNext: lastHasMore,
        count: Array.isArray(data.items) ? data.items.length : 0,
      });
    } catch (err) {
      if (requestId !== currentRequestId) return;
      table.setError(err.message || "Failed to load students.");
      pagination.update({ hasPrev: pageIndex > 0, hasNext: false, count: 0 });
    }
  }

  function handleFilterChange() {
    cursorStack = [null];
    pageIndex = 0;
    fetchStudents();
  }

  searchInput.addEventListener("input", () => {
    syncFilterMute();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => handleFilterChange(), 300);
  });

  statusSelect.addEventListener("change", handleFilterChange);
  levelSelect.addEventListener("change", handleFilterChange);

  syncFilterMute();
  fetchStudents();
}
