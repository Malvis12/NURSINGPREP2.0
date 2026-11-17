"use strict";

import { adminRequest } from "../api.js";
import { toast } from "../components/toast.js";
import { createSkeletonBar } from "../components/skeleton.js";
import { createDataTable } from "../components/data-table.js";

function animateNumber(element, target, duration = 600) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = target.toLocaleString();
    return;
  }
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(target * ease);
    element.textContent = current.toLocaleString();
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

function formatRevenue(minor, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function createStatCard({ label, value = "0", subtext = "", pills = [] }) {
  const card = document.createElement("div");
  card.className = "stat-card";

  const labelEl = document.createElement("span");
  labelEl.className = "stat-card-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("h3");
  valueEl.className = "stat-card-value";
  valueEl.textContent = value;

  card.append(labelEl, valueEl);

  if (subtext) {
    const subtextEl = document.createElement("p");
    subtextEl.className = "stat-card-subtext";
    subtextEl.textContent = subtext;
    card.append(subtextEl);
  }

  if (pills.length > 0) {
    const pillGroup = document.createElement("div");
    pillGroup.className = "stat-pill-group";
    pills.forEach((text) => {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = text;
      pillGroup.append(pill);
    });
    card.append(pillGroup);
  }

  return { card, valueEl };
}

// Renders the administrative platform overview dashboard view
export async function renderOverview(container) {
  container.replaceChildren();

  const headerBar = document.createElement("div");
  headerBar.className = "overview-header-bar";

  const title = document.createElement("h2");
  title.className = "overview-section-title";
  title.textContent = "Platform Metrics";

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "button button-secondary";
  refreshBtn.style.minHeight = "36px";
  refreshBtn.style.fontSize = "11px";
  refreshBtn.textContent = "↻ Refresh Metrics";

  headerBar.append(title, refreshBtn);
  container.append(headerBar);

  const grid = document.createElement("div");
  grid.className = "overview-grid";
  container.append(grid);

  function renderSkeletonCards() {
    grid.replaceChildren();
    for (let i = 0; i < 4; i += 1) {
      const card = document.createElement("div");
      card.className = "stat-card";
      const lbl = createSkeletonBar({ height: "12px", width: "40%" });
      const val = createSkeletonBar({ height: "28px", width: "60%" });
      const sub = createSkeletonBar({ height: "12px", width: "75%" });
      card.append(lbl, val, sub);
      grid.append(card);
    }
  }

  const tableTitle = document.createElement("h2");
  tableTitle.className = "overview-section-title";
  tableTitle.style.marginTop = "36px";
  tableTitle.style.marginBottom = "14px";
  tableTitle.textContent = "Recent Student Signups";
  container.append(tableTitle);

  const table = createDataTable({
    caption: "Five most recent student registrations",
    columns: [
      { key: "displayName", label: "Name", render: (r) => r.displayName || "—" },
      { key: "email", label: "Email", render: (r) => r.email || "—" },
      { key: "academicLevel", label: "Level", nowrap: true, render: (r) => `${r.academicLevel || "—"} Level` },
      {
        key: "membershipStatus",
        label: "Status",
        nowrap: true,
        render: (r) => {
          const pill = document.createElement("span");
          pill.className = "pill";
          if (r.membershipStatus === "active") {
            pill.classList.add("multiple-choice");
            pill.textContent = "Active";
          } else if (r.membershipStatus === "pending_payment") {
            pill.classList.add("hard");
            pill.textContent = "Pending Payment";
          } else {
            pill.textContent = r.membershipStatus || "—";
          }
          return pill;
        },
      },
      {
        key: "createdAt",
        label: "Signed Up",
        nowrap: true,
        render: (r) => {
          if (!r.createdAt) return "—";
          try {
            return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
              .format(new Date(r.createdAt));
          } catch {
            return r.createdAt;
          }
        },
      },
    ],
    emptyTitle: "No registered students yet",
    emptyHint: "When students create an account, their details will appear here.",
    onRetry: () => loadData(true),
  });

  container.append(table.element);

  async function loadData(forceRefresh = false) {
    renderSkeletonCards();
    table.setLoading();
    refreshBtn.disabled = true;

    try {
      const url = forceRefresh ? "/api/admin/overview?refresh=1" : "/api/admin/overview";
      const data = await adminRequest(url);

      grid.replaceChildren();

      const { card: card1, valueEl: val1 } = createStatCard({
        label: "Total Students",
        value: "0",
        subtext: `${data.students.active} active · ${data.students.pendingPayment} pending`,
      });
      animateNumber(val1, data.students.total);

      const { card: card2 } = createStatCard({
        label: "Verified Revenue",
        value: formatRevenue(data.revenue.minor, data.revenue.currency),
        subtext: "Paystack successful charges",
      });

      const { card: card3, valueEl: val3 } = createStatCard({
        label: "Question Bank",
        value: "0",
        pills: [
          `${data.questions.published} published`,
          `200L: ${data.questions.byLevel["200"]}`,
          `300L: ${data.questions.byLevel["300"]}`,
          `400L: ${data.questions.byLevel["400"]}`,
        ],
      });
      animateNumber(val3, data.questions.total);

      const { card: card4, valueEl: val4 } = createStatCard({
        label: "Exams Completed",
        value: "0",
        subtext: "Across all student levels",
      });
      animateNumber(val4, data.exams.completed);

      grid.append(card1, card2, card3, card4);
      table.setRows(data.recentSignups);

      if (forceRefresh) {
        toast("Overview data refreshed.", "success");
      }
    } catch (error) {
      grid.replaceChildren();
      const errCard = document.createElement("div");
      errCard.className = "stat-card stat-card-error";
      errCard.style.gridColumn = "1 / -1";

      const errLabel = document.createElement("span");
      errLabel.className = "stat-card-label";
      errLabel.style.color = "var(--red)";
      errLabel.textContent = "Metrics Unavailable";

      const errSubtext = document.createElement("p");
      errSubtext.className = "stat-card-subtext";
      errSubtext.textContent = error.message;

      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button button-secondary";
      retry.style.minHeight = "34px";
      retry.style.fontSize = "11px";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => loadData(true));

      errCard.append(errLabel, errSubtext, retry);
      grid.append(errCard);

      table.setError(error.message);
      if (forceRefresh) {
        toast(`Refresh failed: ${error.message}`, "error");
      }
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", () => loadData(true));
  await loadData(false);
}
