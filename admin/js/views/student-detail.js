"use strict";

import { adminRequest } from "../api.js";
import { createSkeletonBar } from "../components/skeleton.js";

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
  const dt = document.createElement("span");
  dt.className = "detail-field-label";
  dt.textContent = label;
  const dd = document.createElement("span");
  dd.className = "detail-field-value";
  if (valueNode instanceof Node) {
    dd.append(valueNode);
  } else {
    dd.textContent = valueNode != null && valueNode !== "" ? String(valueNode) : "—";
  }
  row.append(dt, dd);
  return row;
}

function createStatBox(label, value) {
  const box = document.createElement("div");
  box.className = "detail-stat-box";
  const val = document.createElement("span");
  val.className = "detail-stat-value";
  val.textContent = String(value);
  const lbl = document.createElement("span");
  lbl.className = "detail-stat-label";
  lbl.textContent = label;
  box.append(val, lbl);
  return box;
}

function renderDetailSkeleton() {
  const wrap = document.createElement("div");
  wrap.className = "detail-skeleton";
  for (let i = 0; i < 5; i += 1) {
    const bar = createSkeletonBar({ height: "18px", width: i % 2 === 0 ? "75%" : "55%" });
    bar.style.marginBottom = "14px";
    wrap.append(bar);
  }
  return wrap;
}

// Fetches student profile and renders drawer contents
export async function openStudentDetail(uid, drawer, opener) {
  async function load() {
    drawer.open({ title: "Student Profile", content: renderDetailSkeleton(), opener });

    try {
      const data = await adminRequest(`/api/admin/students/${encodeURIComponent(uid)}`);
      const { profile, recentSessions } = data;
      const container = document.createElement("div");
      container.className = "student-detail-content";

      const profileSection = document.createElement("section");
      profileSection.className = "detail-section";
      const profileHeading = document.createElement("h3");
      profileHeading.className = "detail-heading";
      profileHeading.textContent = "Student Information";
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
      container.append(profileSection);

      const statsSection = document.createElement("section");
      statsSection.className = "detail-section";
      const statsHeading = document.createElement("h3");
      statsHeading.className = "detail-heading";
      statsHeading.textContent = "Study Progress";
      statsSection.append(statsHeading);

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
      const sessionsHeading = document.createElement("h3");
      sessionsHeading.className = "detail-heading";
      sessionsHeading.textContent = "Recent Sessions";
      sessionsSection.append(sessionsHeading);

      if (!Array.isArray(recentSessions) || recentSessions.length === 0) {
        const emptyMsg = document.createElement("p");
        emptyMsg.className = "detail-empty-note";
        emptyMsg.textContent = "No completed exam or practice sessions recorded yet.";
        sessionsSection.append(emptyMsg);
      } else {
        const list = document.createElement("div");
        list.className = "detail-sessions-list";
        recentSessions.forEach((s) => {
          const item = document.createElement("div");
          item.className = "detail-session-item";
          const top = document.createElement("div");
          top.className = "detail-session-top";
          const topic = document.createElement("span");
          topic.className = "detail-session-topic";
          topic.textContent = s.topic || "Practice Exam";
          const score = document.createElement("span");
          score.className = "detail-session-score";
          score.textContent = `${s.score}/${s.total} (${s.percent}%)`;
          top.append(topic, score);

          const bottom = document.createElement("div");
          bottom.className = "detail-session-bottom";
          const diff = document.createElement("span");
          diff.className = "detail-session-diff";
          diff.textContent = s.difficulty ? `${s.difficulty} difficulty` : "";
          const date = document.createElement("span");
          date.className = "detail-session-date";
          date.textContent = formatDate(s.completedAt);
          bottom.append(diff, date);

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
      const errMsg = document.createElement("p");
      errMsg.className = "message error-message";
      errMsg.textContent = err.message || "Failed to load student details.";
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "button button-secondary";
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", () => load());
      errWrap.append(errMsg, retryBtn);
      drawer.open({ title: "Student Profile", content: errWrap, opener });
    }
  }

  await load();
}
