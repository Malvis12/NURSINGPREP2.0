"use strict";

import { adminRequest } from "../api.js";
import { createSkeletonBar } from "../components/skeleton.js";
import { toast } from "../components/toast.js";
import { getSharedConfirmDialog } from "../components/confirm-dialog.js";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function createFieldGroup(label, valueNode) {
  const row = document.createElement("div");
  row.className = "detail-field";
  const dt = Object.assign(document.createElement("span"), { className: "detail-field-label", textContent: label });
  const dd = Object.assign(document.createElement("span"), { className: "detail-field-value" });
  if (valueNode instanceof Node) dd.append(valueNode);
  else dd.textContent = valueNode != null && valueNode !== "" ? String(valueNode) : "—";
  row.append(dt, dd);
  return row;
}

function createStatBox(label, value) {
  const box = document.createElement("div");
  box.className = "detail-stat-box";
  box.append(
    Object.assign(document.createElement("span"), { className: "detail-stat-value", textContent: String(value) }),
    Object.assign(document.createElement("span"), { className: "detail-stat-label", textContent: label })
  );
  return box;
}

function renderDetailSkeleton() {
  const wrap = document.createElement("div");
  wrap.className = "detail-skeleton";
  for (let i = 0; i < 5; i += 1) {
    wrap.append(createSkeletonBar({ height: "18px", width: i % 2 === 0 ? "75%" : "55%" }));
  }
  return wrap;
}

// Fetches student profile and renders drawer contents
export async function openStudentDetail(uid, drawer, opener, onStatusChanged) {
  async function load() {
    drawer.open({ title: "Student Profile", content: renderDetailSkeleton(), opener });

    try {
      const data = await adminRequest(`/api/admin/students/${encodeURIComponent(uid)}`);
      const { profile, recentSessions } = data;
      const container = document.createElement("div");
      container.className = "student-detail-content";

      const profileSection = document.createElement("section");
      profileSection.className = "detail-section";
      const profileHeading = Object.assign(document.createElement("h3"), { className: "detail-heading", textContent: "Student Information" });
      profileSection.append(profileHeading);

      const statusPill = document.createElement("span");
      statusPill.className = `pill ${profile.membershipStatus === "active" ? "multiple-choice" : profile.membershipStatus === "pending_payment" ? "hard" : ""}`.trim();
      statusPill.textContent = profile.membershipStatus === "active" ? "Active" : profile.membershipStatus === "pending_payment" ? "Pending Payment" : (profile.membershipStatus || "—");

      const grid = document.createElement("div");
      grid.className = "detail-grid";
      grid.append(
        createFieldGroup("Full Name", profile.displayName || "—"),
        createFieldGroup("Email", profile.email || "—"),
        createFieldGroup("University", profile.university || "—"),
        createFieldGroup("Academic Level", profile.academicLevel ? `${profile.academicLevel} Level` : "—"),
        createFieldGroup("Membership Status", statusPill),
        createFieldGroup("Payment Verified", formatDate(profile.paidAt)),
        createFieldGroup("Joined Date", formatDate(profile.createdAt))
      );
      profileSection.append(grid);

      if (profile.membershipStatus !== "active") {
        const activateBtn = document.createElement("button");
        activateBtn.type = "button";
        activateBtn.className = "button button-primary detail-activate-btn";
        activateBtn.textContent = "Activate manually";
        activateBtn.addEventListener("click", () => {
          const confirmDialog = getSharedConfirmDialog();
          confirmDialog.open({
            title: "Activate Student Membership",
            message: `Manually activate membership for ${profile.displayName || profile.email || "this student"}? This grants full access and creates an audit log entry.`,
            confirmText: "Activate Membership",
            opener: activateBtn,
            onConfirm: async (reason) => {
              try {
                await adminRequest(`/api/admin/students/${encodeURIComponent(uid)}/activate`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reason }),
                });
                toast("Student membership activated successfully.", "success");
                confirmDialog.close();
                await load();
                if (typeof onStatusChanged === "function") onStatusChanged();
              } catch (err) {
                if (err.status === 409) {
                  toast("Already active", "info");
                  confirmDialog.close();
                  await load();
                  if (typeof onStatusChanged === "function") onStatusChanged();
                } else {
                  toast("Failed to activate: " + (err.status ? `Request failed (${err.status})` : "Please try again."), "error");
                  throw err;
                }
              }
            },
          });
        });
        profileSection.append(activateBtn);
      }
      container.append(profileSection);

      const statsSection = document.createElement("section");
      statsSection.className = "detail-section";
      statsSection.append(Object.assign(document.createElement("h3"), { className: "detail-heading", textContent: "Study Progress" }));

      const practiced = profile.progress?.questionsPracticed || 0;
      const correct = profile.progress?.totalCorrect || 0;
      const accuracy = practiced > 0 ? `${Math.round((correct / practiced) * 100)}%` : "0%";

      const statsGrid = document.createElement("div");
      statsGrid.className = "detail-stats-grid";
      statsGrid.append(
        createStatBox("Sessions", profile.progress?.sessionsCompleted || 0),
        createStatBox("Questions", practiced),
        createStatBox("Accuracy", accuracy)
      );
      statsSection.append(statsGrid);
      container.append(statsSection);

      const sessionsSection = document.createElement("section");
      sessionsSection.className = "detail-section";
      sessionsSection.append(Object.assign(document.createElement("h3"), { className: "detail-heading", textContent: "Recent Sessions" }));

      if (!Array.isArray(recentSessions) || recentSessions.length === 0) {
        sessionsSection.append(Object.assign(document.createElement("p"), { className: "detail-empty-note", textContent: "No completed exam or practice sessions recorded yet." }));
      } else {
        const list = document.createElement("div");
        list.className = "detail-sessions-list";
        recentSessions.forEach((s) => {
          const item = document.createElement("div");
          item.className = "detail-session-item";
          const top = document.createElement("div");
          top.className = "detail-session-top";
          top.append(
            Object.assign(document.createElement("span"), { className: "detail-session-topic", textContent: s.topic || "Practice Exam" }),
            Object.assign(document.createElement("span"), { className: "detail-session-score", textContent: `${s.score}/${s.total} (${s.percent}%)` })
          );

          const bottom = document.createElement("div");
          bottom.className = "detail-session-bottom";
          bottom.append(
            Object.assign(document.createElement("span"), { className: "detail-session-diff", textContent: s.difficulty ? `${s.difficulty} difficulty` : "" }),
            Object.assign(document.createElement("span"), { className: "detail-session-date", textContent: formatDate(s.completedAt) })
          );

          item.append(top, bottom);
          list.append(item);
        });
        sessionsSection.append(list);
      }
      container.append(sessionsSection);

      drawer.open({ title: profile.displayName || "Student Profile", content: container, opener });
    } catch (err) {
      const errWrap = document.createElement("div");
      errWrap.className = "detail-error";
      errWrap.setAttribute("role", "alert");
      const errMsg = Object.assign(document.createElement("p"), { className: "message error-message", textContent: err.message || "Failed to load student details." });
      const retryBtn = Object.assign(document.createElement("button"), { type: "button", className: "button button-secondary", textContent: "Retry" });
      retryBtn.addEventListener("click", () => load());
      errWrap.append(errMsg, retryBtn);
      drawer.open({ title: "Student Profile", content: errWrap, opener });
    }
  }

  await load();
}
