"use strict";

let sharedConfirmDialog = null;

// Reusable modal confirmation dialog with reason input and character counting
export function createConfirmDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "admin-confirm-dialog";
  dialog.setAttribute("aria-labelledby", "confirm-title");

  const panel = document.createElement("div");
  panel.className = "confirm-dialog-panel";

  const titleEl = document.createElement("h2");
  titleEl.id = "confirm-title";
  titleEl.className = "confirm-dialog-title";

  const messageEl = document.createElement("p");
  messageEl.className = "confirm-dialog-message";

  const reasonLabel = document.createElement("label");
  reasonLabel.className = "field-label";
  reasonLabel.htmlFor = "confirm-dialog-reason";
  reasonLabel.textContent = "Reason for activation (required)";

  const textarea = document.createElement("textarea");
  textarea.id = "confirm-dialog-reason";
  textarea.className = "confirm-reason-textarea";
  textarea.rows = 3;
  textarea.maxLength = 300;
  textarea.placeholder = "Enter reason (5-300 characters)...";

  const counterWrap = document.createElement("div");
  counterWrap.className = "confirm-counter-row";
  const counterSpan = document.createElement("span");
  counterSpan.className = "confirm-char-counter";
  counterSpan.setAttribute("aria-live", "polite");
  counterSpan.textContent = "0 / 300";
  counterWrap.append(counterSpan);

  const actions = document.createElement("div");
  actions.className = "confirm-dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "button button-secondary confirm-cancel-btn";
  cancelBtn.textContent = "Cancel";

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "button button-primary confirm-submit-btn";
  confirmBtn.textContent = "Confirm";
  confirmBtn.disabled = true;

  actions.append(cancelBtn, confirmBtn);
  panel.append(titleEl, messageEl, reasonLabel, textarea, counterWrap, actions);
  dialog.append(panel);
  document.body.append(dialog);

  let lastOpener = null;
  let activeOnConfirm = null;
  let isSubmitting = false;

  function updateValidation() {
    const trimmed = textarea.value.trim();
    counterSpan.textContent = `${textarea.value.length} / 300`;
    confirmBtn.disabled = isSubmitting || trimmed.length < 5 || trimmed.length > 300;
  }

  function setSubmitting(submitting) {
    isSubmitting = submitting;
    cancelBtn.disabled = submitting;
    confirmBtn.disabled = submitting || textarea.value.trim().length < 5;
    textarea.disabled = submitting;
  }

  function close() {
    if (!dialog.open) return;
    setSubmitting(false);
    dialog.close();
    if (lastOpener && typeof lastOpener.focus === "function") {
      lastOpener.focus();
    }
    lastOpener = null;
    activeOnConfirm = null;
  }

  function open({ title, message, confirmText = "Confirm", opener, onConfirm } = {}) {
    lastOpener = opener || document.activeElement;
    activeOnConfirm = onConfirm;
    titleEl.textContent = title || "Confirm Action";
    messageEl.textContent = message || "Are you sure you want to proceed?";
    confirmBtn.textContent = confirmText;
    textarea.value = "";
    setSubmitting(false);
    updateValidation();

    dialog.showModal();
    textarea.focus();
  }

  textarea.addEventListener("input", updateValidation);

  cancelBtn.addEventListener("click", () => {
    if (!isSubmitting) close();
  });

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    if (!isSubmitting) close();
  });

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog && !isSubmitting) {
      close();
    }
  });

  confirmBtn.addEventListener("click", async () => {
    if (isSubmitting || typeof activeOnConfirm !== "function") return;
    const trimmed = textarea.value.trim();
    if (trimmed.length < 5 || trimmed.length > 300) return;

    setSubmitting(true);
    try {
      await activeOnConfirm(trimmed);
    } catch {
      setSubmitting(false);
      textarea.focus();
    }
  });

  return { open, close };
}

export function getSharedConfirmDialog() {
  if (!sharedConfirmDialog) {
    sharedConfirmDialog = createConfirmDialog();
  }
  return sharedConfirmDialog;
}
