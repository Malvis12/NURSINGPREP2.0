"use strict";

/**
 * Creates an accessible, reactive data table with loading, empty, and error states.
 * @param {Object} options
 * @param {string} options.caption - Accessible table summary for screen readers.
 * @param {Array<{key: string, label: string, render?: (row: Object) => string|Node, align?: "left"|"center"|"right", nowrap?: boolean}>} options.columns - Column specs.
 * @param {(row: Object) => string} [options.getRowId] - Key extractor for rows.
 * @param {string} [options.emptyTitle] - Title displayed when row set is empty.
 * @param {string} [options.emptyHint] - Description displayed when row set is empty.
 * @param {() => void} [options.onRetry] - Callback invoked when retry button is clicked.
 * @returns {{ element: HTMLElement, setLoading: () => void, setRows: (rows: Array<Object>) => void, setError: (message: string) => void }}
 */
export function createDataTable({
  caption,
  columns,
  getRowId,
  emptyTitle = "No records found",
  emptyHint = "There are no records to display at this time.",
  onRetry,
}) {
  const container = document.createElement("div");
  container.className = "admin-table-container";

  const scrollWrapper = document.createElement("div");
  scrollWrapper.className = "admin-table-scroll";

  const table = document.createElement("table");
  table.className = "admin-table";

  const captionEl = document.createElement("caption");
  captionEl.className = "sr-only";
  captionEl.textContent = caption;
  table.append(captionEl);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  columns.forEach((col) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = col.label;
    if (col.align) th.style.textAlign = col.align;
    if (col.nowrap) th.classList.add("nowrap");
    headerRow.append(th);
  });
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  table.append(tbody);
  scrollWrapper.append(table);
  container.append(scrollWrapper);

  function setLoading() {
    tbody.replaceChildren();
    // Render 4 placeholder rows with animated skeleton bars
    for (let i = 0; i < 4; i += 1) {
      const tr = document.createElement("tr");
      tr.className = "admin-table-skeleton-row";
      columns.forEach((col, colIdx) => {
        const td = document.createElement("td");
        const bar = document.createElement("div");
        bar.className = "skeleton";
        bar.style.height = "16px";
        bar.style.width = colIdx === 0 ? "70%" : colIdx === 1 ? "85%" : "50%";
        td.append(bar);
        tr.append(td);
      });
      tbody.append(tr);
    }
  }

  function setRows(rows) {
    tbody.replaceChildren();

    if (!Array.isArray(rows) || rows.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = columns.length;
      td.className = "admin-table-empty-cell";

      const emptyWrap = document.createElement("div");
      emptyWrap.className = "empty-state";
      emptyWrap.style.border = "none";
      emptyWrap.style.background = "transparent";
      emptyWrap.style.padding = "32px 16px";

      const titleEl = document.createElement("h2");
      titleEl.style.fontSize = "18px";
      titleEl.textContent = emptyTitle;

      const hintEl = document.createElement("p");
      hintEl.textContent = emptyHint;

      emptyWrap.append(titleEl, hintEl);
      td.append(emptyWrap);
      tr.append(td);
      tbody.append(tr);
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      if (typeof getRowId === "function") {
        tr.dataset.rowId = String(getRowId(row));
      }

      columns.forEach((col) => {
        const td = document.createElement("td");
        if (col.align) td.style.textAlign = col.align;
        if (col.nowrap) td.classList.add("nowrap");

        if (typeof col.render === "function") {
          const rendered = col.render(row);
          if (rendered instanceof Node) {
            td.append(rendered);
          } else if (rendered != null) {
            td.textContent = String(rendered);
          }
        } else {
          const val = row[col.key];
          td.textContent = val != null ? String(val) : "—";
        }

        tr.append(td);
      });

      tbody.append(tr);
    });
  }

  function setError(message) {
    tbody.replaceChildren();
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columns.length;

    const errorBox = document.createElement("div");
    errorBox.className = "admin-table-error";
    errorBox.setAttribute("role", "alert");

    const msg = document.createElement("p");
    msg.className = "message error-message";
    msg.textContent = message || "Failed to load records.";
    errorBox.append(msg);

    if (typeof onRetry === "function") {
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "button button-secondary";
      retryBtn.style.minHeight = "34px";
      retryBtn.style.fontSize = "11px";
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", onRetry);
      errorBox.append(retryBtn);
    }

    td.append(errorBox);
    tr.append(td);
    tbody.append(tr);
  }

  return {
    element: container,
    setLoading,
    setRows,
    setError,
  };
}
