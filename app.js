"use strict";

const setupScreen = document.querySelector("#setup-screen");
const homeScreen = document.querySelector("#home-screen");
const examScreen = document.querySelector("#exam-screen");
const resultScreen = document.querySelector("#result-screen");
const setupForm = document.querySelector("#setup-form");
const levelSelect = document.querySelector("#level-select");
const topicSelect = document.querySelector("#topic-select");
const countInput = document.querySelector("#question-count");
const countStepButtons = [...document.querySelectorAll("[data-count-step]")];
const durationSelect = document.querySelector("#duration-select");
const availabilityNote = document.querySelector("#availability-note");
const setupError = document.querySelector("#setup-error");
const startButton = document.querySelector("#start-button");
const questionNav = document.querySelector("#question-nav");
const optionList = document.querySelector("#option-list");
const examMessage = document.querySelector("#exam-message");
const progressTrack = document.querySelector(".progress-track");
const topicShortcuts = document.querySelector("#topic-shortcuts");
const historyNotice = document.querySelector("#history-notice");
const resultHistoryNotice = document.querySelector("#result-history-notice");

let bankMeta;
let session;
let sessionHistory = [];
let historyError = "";
let accountProfile = null;
let progressTotals = { sessionsCompleted: 0, questionsPracticed: 0, averageScore: null };
let firebaseAuth = null;
let firebaseSdk = null;
let authTransition = false;

function showMessage(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function setupHeroMotion() {
  const hero = document.querySelector(".landing-hero");
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || !window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ) {
    return;
  }

  let pointerX = 0;
  let pointerY = 0;
  let framePending = false;
  hero.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(() => {
      framePending = false;
      const bounds = hero.getBoundingClientRect();
      const horizontal = Math.max(0, Math.min(1, (pointerX - bounds.left) / bounds.width));
      const vertical = Math.max(0, Math.min(1, (pointerY - bounds.top) / bounds.height));
      hero.style.setProperty("--pointer-x", `${(horizontal * 100).toFixed(1)}%`);
      hero.style.setProperty("--pointer-y", `${(vertical * 100).toFixed(1)}%`);
      hero.style.setProperty("--pointer-tilt-x", `${((horizontal - 0.5) * 10).toFixed(2)}deg`);
      hero.style.setProperty("--pointer-tilt-y", `${((0.5 - vertical) * 7).toFixed(2)}deg`);
    });
  });
  hero.addEventListener("pointerleave", () => {
    hero.style.setProperty("--pointer-x", "72%");
    hero.style.setProperty("--pointer-y", "42%");
    hero.style.setProperty("--pointer-tilt-x", "0deg");
    hero.style.setProperty("--pointer-tilt-y", "0deg");
  });
}

function setupQuestionCardMotion() {
  const card = document.querySelector("#question-card");
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || !window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ) {
    return;
  }

  let pointerX = 0;
  let pointerY = 0;
  let framePending = false;
  card.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(() => {
      framePending = false;
      const bounds = card.getBoundingClientRect();
      const horizontal = Math.max(0, Math.min(1, (pointerX - bounds.left) / bounds.width));
      const vertical = Math.max(0, Math.min(1, (pointerY - bounds.top) / bounds.height));
      card.style.setProperty("--card-tilt-x", `${((horizontal - 0.5) * 5).toFixed(2)}deg`);
      card.style.setProperty("--card-tilt-y", `${((0.5 - vertical) * 3.5).toFixed(2)}deg`);
      card.style.setProperty("--card-glow-x", `${(horizontal * 100).toFixed(1)}%`);
      card.style.setProperty("--card-glow-y", `${(vertical * 100).toFixed(1)}%`);
    });
  });
  card.addEventListener("pointerleave", () => {
    card.style.setProperty("--card-tilt-x", "0deg");
    card.style.setProperty("--card-tilt-y", "0deg");
    card.style.setProperty("--card-glow-x", "50%");
    card.style.setProperty("--card-glow-y", "0%");
  });
}

function renderHome() {
  if (!bankMeta || !accountProfile) return;
  document.querySelector("#dashboard-context").textContent =
    `${accountProfile.university} · ${accountProfile.academicLevel} level`;
  showMessage(
    document.querySelector("#level-content-notice"),
    bankMeta.total
      ? ""
      : `The ${accountProfile.academicLevel}-level question bank is not available yet. Your account is ready; questions for this level can be added as they become available.`
  );
  document.querySelector("#home-question-count").textContent = String(bankMeta.total);
  document.querySelector("#home-topic-count").textContent = String(bankMeta.topics.length);
  document.querySelector("#home-session-count").textContent = String(progressTotals.sessionsCompleted);
  document.querySelector("#home-average-score").textContent = progressTotals.averageScore === null
    ? "—"
    : `${progressTotals.averageScore}%`;
  document.querySelector("#home-questions-practiced").textContent = String(progressTotals.questionsPracticed);
  document.querySelector("#recent-session-count").textContent = sessionHistory.length
    ? `${sessionHistory.length} saved`
    : "No sessions yet";
  showMessage(historyNotice, historyError);
  showMessage(resultHistoryNotice, historyError);

  topicShortcuts.replaceChildren();
  bankMeta.topics.forEach((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topic-shortcut";
    button.textContent = topic;
    button.addEventListener("click", () => {
      prepareQuickPractice({ count: 10, duration: 0, topic });
    });
    topicShortcuts.append(button);
  });

  const recentSessions = document.querySelector("#recent-sessions");
  recentSessions.replaceChildren();
  if (sessionHistory.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "Complete a practice session to see your results here.";
    recentSessions.append(empty);
    return;
  }

  sessionHistory.slice(0, 5).forEach((entry) => {
    const item = document.createElement("article");
    item.className = "recent-session";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.topic === "All topics" ? "Mixed-topic practice" : entry.topic;
    const date = document.createElement("span");
    date.textContent = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
      .format(new Date(entry.completedAt));
    const score = document.createElement("strong");
    score.className = "recent-session-score";
    score.textContent = `${entry.percent}%`;
    const scoreDetail = document.createElement("span");
    scoreDetail.textContent = `${entry.score} of ${entry.total} correct`;
    details.append(title, date);
    item.append(details, score, scoreDetail);
    recentSessions.append(item);
  });
}

function saveSessionResult(result) {
  const completedAt = result.completedAt || new Date().toISOString();
  sessionHistory = [{
    completedAt,
    score: result.score,
    total: result.total,
    percent: result.percent,
    topic: session.topic || "All topics",
    difficulty: session.level,
  }, ...sessionHistory.filter((item) => item.id !== result.examId)].slice(0, 5);
  if (result.progress) progressTotals = result.progress;
  renderHome();
}

async function requestJson(url, options) {
  const requestOptions = { ...options, headers: { ...(options?.headers || {}) } };
  if (firebaseAuth?.currentUser) {
    requestOptions.headers.Authorization = `Bearer ${await firebaseAuth.currentUser.getIdToken()}`;
  }
  const response = await fetch(url, requestOptions);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      "The Nursing Prep backend did not return JSON. Start the app with `npm start` and open its local URL."
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The Nursing Prep backend returned invalid data. Restart it with `npm start`.");
  }
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function availableQuestionCount() {
  const topic = topicSelect.value;
  const level = levelSelect.value;
  if (!topic) {
    return level === "mixed" ? bankMeta.total : bankMeta.levels[level];
  }
  const counts = bankMeta.topicCounts[topic];
  if (!counts) return 0;
  return level === "mixed" ? counts.total : counts[level];
}

function updateAvailability() {
  if (!bankMeta) return;
  const available = availableQuestionCount();
  countInput.max = String(available);
  countInput.min = "1";
  if (available === 0) {
    countInput.value = "0";
    startButton.disabled = true;
    availabilityNote.textContent = "No questions are available for this selection.";
    updateCountStepper();
    return;
  }
  startButton.disabled = false;
  if (Number(countInput.value) > available) {
    countInput.value = String(available);
  }
  if (!Number.isInteger(Number(countInput.value)) || Number(countInput.value) < 1) {
    countInput.value = "1";
  }
  availabilityNote.textContent = `${available} question${available === 1 ? "" : "s"} available for this selection.`;
  updateCountStepper();
}

function updateCountStepper() {
  const count = Number(countInput.value);
  const minimum = Number(countInput.min);
  const maximum = Number(countInput.max);
  countStepButtons.forEach((button) => {
    const step = Number(button.dataset.countStep);
    button.disabled = startButton.disabled || (step < 0 ? count <= minimum : count >= maximum);
  });
}

function populateSetup(meta) {
  bankMeta = meta;
  topicSelect.replaceChildren(topicSelect.options[0]);
  for (const topic of meta.topics) {
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = topic;
    topicSelect.append(option);
  }
  updateAvailability();
  renderHome();
}

function showAuthMode(mode) {
  const signup = mode === "signup";
  document.querySelector("#login-form").hidden = signup;
  document.querySelector("#signup-form").hidden = !signup;
  document.querySelector("#login-tab").classList.toggle("is-active", !signup);
  document.querySelector("#signup-tab").classList.toggle("is-active", signup);
  document.querySelector("#login-tab").setAttribute("aria-selected", String(!signup));
  document.querySelector("#signup-tab").setAttribute("aria-selected", String(signup));
  document.querySelector("#auth-title").textContent = signup ? "Create your account." : "Welcome back.";
  showMessage(document.querySelector("#login-error"), "");
  showMessage(document.querySelector("#signup-error"), "");
}

function openAuth(mode) {
  showAuthMode(mode);
  setScreen("auth");
  if (!firebaseAuth) {
    showMessage(
      document.querySelector("#firebase-config-notice"),
      "Firebase is not configured yet. Add the Firebase web app settings and restart the server to enable accounts."
    );
  } else {
    showMessage(document.querySelector("#firebase-config-notice"), "");
  }
}

function setHeaderForAccount(isSignedIn) {
  document.querySelector("#account-nav").hidden = !(
    isSignedIn && accountProfile?.membershipStatus === "active"
  );
  document.querySelectorAll('[data-action="login"], [data-action="signup"]').forEach((element) => {
    element.hidden = isSignedIn;
  });
  document.querySelector('[data-action="logout"]').hidden = !isSignedIn;
}

function showCheckout(message = "") {
  if (!accountProfile) return;
  document.querySelector("#checkout-university").textContent = accountProfile.university;
  document.querySelector("#checkout-level").textContent = `${accountProfile.academicLevel} level`;
  document.querySelector("#checkout-amount").textContent = accountProfile.accessFee || "To be announced";
  showMessage(document.querySelector("#checkout-message"), message);
  showMessage(document.querySelector("#checkout-error"), "");
  setScreen("checkout");
}

async function loadDashboard() {
  const data = await requestJson("/api/dashboard");
  accountProfile = data.profile;
  progressTotals = data.progress;
  sessionHistory = data.recentSessions;
  populateSetup(data.bankMeta);
}

async function verifyPaymentReturn(reference) {
  showCheckout("Checking your payment with Paystack…");
  try {
    const result = await requestJson("/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    });
    accountProfile = result.profile;
    await loadDashboard();
    window.history.replaceState({}, "", window.location.pathname);
    setHeaderForAccount(true);
    setScreen("home");
  } catch (error) {
    showCheckout("");
    showMessage(document.querySelector("#checkout-error"), error.message);
  }
}

async function continueForUser(user) {
  const response = await requestJson("/api/profile");
  accountProfile = response.profile;
  setHeaderForAccount(true);
  if (!accountProfile) {
    setScreen("profile");
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const paymentReference = params.get("reference") || params.get("trxref");
  if (paymentReference) {
    await verifyPaymentReturn(paymentReference);
    return;
  }
  if (accountProfile.membershipStatus !== "active") {
    showCheckout("Complete the one-time access payment to unlock your dashboard.");
    return;
  }
  await loadDashboard();
  setScreen("home");
}

async function handleSignup(event) {
  event.preventDefault();
  showMessage(document.querySelector("#signup-error"), "");
  if (!firebaseAuth || !firebaseSdk) {
    openAuth("signup");
    return;
  }
  const form = event.currentTarget;
  const formData = new FormData(form);
  const button = document.querySelector("#signup-button");
  button.disabled = true;
  button.textContent = "Creating account…";
  authTransition = true;
  try {
    const credential = await firebaseSdk.createUserWithEmailAndPassword(
      firebaseAuth,
      String(formData.get("email")).trim(),
      String(formData.get("password"))
    );
    await firebaseSdk.updateProfile(credential.user, {
      displayName: String(formData.get("name")).trim(),
    });
    const response = await requestJson("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: formData.get("name"),
        university: formData.get("university"),
        academicLevel: formData.get("academicLevel"),
      }),
    });
    accountProfile = response.profile;
    setHeaderForAccount(true);
    showCheckout("Your account is ready. The one-time access fee will be shown when payment is configured.");
  } catch (error) {
    showMessage(document.querySelector("#signup-error"), error.message);
    if (firebaseAuth.currentUser && !accountProfile) {
      setHeaderForAccount(true);
      setScreen("profile");
    }
  } finally {
    authTransition = false;
    button.disabled = false;
    button.innerHTML = 'Create account <span aria-hidden="true">→</span>';
  }
}

async function handleLogin(event) {
  event.preventDefault();
  showMessage(document.querySelector("#login-error"), "");
  if (!firebaseAuth || !firebaseSdk) {
    openAuth("login");
    return;
  }
  const formData = new FormData(event.currentTarget);
  const button = document.querySelector("#login-button");
  button.disabled = true;
  button.textContent = "Signing in…";
  authTransition = true;
  try {
    const credential = await firebaseSdk.signInWithEmailAndPassword(
      firebaseAuth,
      String(formData.get("email")).trim(),
      String(formData.get("password"))
    );
    await continueForUser(credential.user);
  } catch (error) {
    showMessage(document.querySelector("#login-error"), error.message);
  } finally {
    authTransition = false;
    button.disabled = false;
    button.innerHTML = 'Log in <span aria-hidden="true">→</span>';
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  showMessage(document.querySelector("#profile-error"), "");
  try {
    const formData = new FormData(event.currentTarget);
    const response = await requestJson("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        university: formData.get("university"),
        academicLevel: formData.get("academicLevel"),
      }),
    });
    accountProfile = response.profile;
    showCheckout("Your study profile is ready. Complete the one-time payment to continue.");
  } catch (error) {
    showMessage(document.querySelector("#profile-error"), error.message);
  }
}

async function startCheckout() {
  const button = document.querySelector("#checkout-button");
  button.disabled = true;
  button.textContent = "Preparing secure checkout…";
  showMessage(document.querySelector("#checkout-error"), "");
  try {
    const result = await requestJson("/api/payments/initialize", { method: "POST" });
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    showMessage(document.querySelector("#checkout-error"), error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Continue to payment <span aria-hidden="true">→</span>';
  }
}

async function initializeFirebase() {
  try {
    const config = await requestJson("/api/config");
    if (!config.firebaseConfigured) return;
    firebaseSdk = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js")
      .then(async (appSdk) => ({
        ...appSdk,
        ...(await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")),
      }));
    const firebaseApp = firebaseSdk.initializeApp(config.firebaseConfig);
    firebaseAuth = firebaseSdk.getAuth(firebaseApp);
    firebaseSdk.onAuthStateChanged(firebaseAuth, async (user) => {
      if (authTransition) return;
      if (!user) {
        accountProfile = null;
        setHeaderForAccount(false);
        if (document.querySelector("#auth-screen").hidden) setScreen("landing");
        return;
      }
      try {
        await continueForUser(user);
      } catch (error) {
        showMessage(document.querySelector("#firebase-config-notice"), error.message);
        setScreen("auth");
      }
    });
  } catch (error) {
    console.error("Firebase initialization failed:", error.message);
    showMessage(
      document.querySelector("#firebase-config-notice"),
      "Could not connect to Firebase. Check the Firebase web app settings and authorized domain."
    );
  }
}

function setScreen(screen) {
  const visibleScreen = screen === "progress" ? "home" : screen;
  const screens = {
    landing: document.querySelector("#landing-screen"),
    auth: document.querySelector("#auth-screen"),
    profile: document.querySelector("#profile-screen"),
    checkout: document.querySelector("#checkout-screen"),
    home: homeScreen,
    setup: setupScreen,
    exam: examScreen,
    result: resultScreen,
  };
  Object.entries(screens).forEach(([name, element]) => {
    element.hidden = name !== visibleScreen;
  });
  document.querySelector("#mobile-submit-bar").hidden = visibleScreen !== "exam";
  const activeScreen = screens[visibleScreen];
  if (!activeScreen) throw new Error(`Unknown screen: ${screen}`);
  activeScreen.classList.remove("is-entering");
  const focusTarget = screen === "progress"
    ? document.querySelector("#progress-title")
    : activeScreen.querySelector("h1, h2");
  requestAnimationFrame(() => {
    activeScreen.classList.add("is-entering");
    if (visibleScreen !== "exam" && focusTarget) focusTarget.focus({ preventScroll: true });
  });
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  if (screen === "progress") {
    document.querySelector("#progress-section").scrollIntoView({ behavior, block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior });
  }
  document.querySelectorAll("[data-screen]").forEach((link) => {
    const current = link.dataset.screen === screen;
    link.classList.toggle("is-active", current);
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function navigateToScreen(screen) {
  if (session && !session.finished && screen !== "exam") {
    showMessage(examMessage, "Finish or submit your practice exam before leaving this screen.");
    return;
  }
  if (["home", "progress", "setup"].includes(screen)) {
    if (!firebaseAuth?.currentUser) {
      openAuth("login");
      return;
    }
    if (accountProfile?.membershipStatus !== "active") {
      showCheckout();
      return;
    }
  }
  setScreen(screen);
}

function prepareQuickPractice({ count, duration, topic = "" }) {
  levelSelect.value = "mixed";
  topicSelect.value = topic;
  countInput.value = String(count);
  durationSelect.value = String(duration);
  updateAvailability();
  setScreen("setup");
}

function examTitle() {
  const level = levelSelect.value;
  const topic = topicSelect.value;
  const levelText = level === "mixed" ? "Mixed" : level[0].toUpperCase() + level.slice(1);
  return `${levelText} nursing questions${topic ? ` · ${topic}` : ""}`;
}

async function startExam(event) {
  event.preventDefault();
  showMessage(setupError, "");
  const count = Number(countInput.value);
  const available = availableQuestionCount();
  if (!Number.isInteger(count) || count < 1 || count > available) {
    showMessage(setupError, `Enter a whole number between 1 and ${available}.`);
    return;
  }

  startButton.disabled = true;
  startButton.textContent = "Preparing questions…";
  try {
    const params = new URLSearchParams({
      level: levelSelect.value,
      count: String(count),
    });
    if (topicSelect.value) params.set("topic", topicSelect.value);
    const payload = await requestJson(`/api/questions?${params}`);
    const duration = Number(durationSelect.value);
    session = {
      examId: payload.examId,
      questions: payload.questions,
      level: levelSelect.value,
      topic: topicSelect.value,
      answers: {},
      feedback: {},
      checking: new Set(),
      marked: new Set(),
      index: 0,
      secondsLeft: duration * 60,
      timerId: null,
      submitting: false,
      finished: false,
    };
    document.querySelector("#exam-title").textContent = examTitle();
    showMessage(examMessage, "");
    setScreen("exam");
    renderQuestion();
    if (duration > 0) {
      updateTimer();
      session.timerId = window.setInterval(tick, 1000);
    } else {
      document.querySelector("#timer").textContent = "No timer";
    }
  } catch (error) {
    session = null;
    setScreen("setup");
    showMessage(setupError, error.message);
  } finally {
    startButton.disabled = false;
    startButton.innerHTML = 'Start practice exam <span aria-hidden="true">→</span>';
  }
}

function renderQuestion() {
  const question = session.questions[session.index];
  const questionCard = document.querySelector(".question-card");
  questionCard.classList.remove("is-entering");
  requestAnimationFrame(() => questionCard.classList.add("is-entering"));
  document.querySelector("#progress-text").textContent = `Question ${session.index + 1} of ${session.questions.length}`;
  const questionType = question.format === "written" ? "Written response" : "Multiple choice";
  document.querySelector("#question-level").textContent = `${question.level[0].toUpperCase() + question.level.slice(1)} · ${questionType}`;
  document.querySelector("#question-level").className = `pill ${question.level} ${question.format}`;
  optionList.querySelector("legend").textContent = question.format === "written" ? "Type your answer" : "Choose one answer";
  document.querySelector("#question-topic").textContent = question.topic;
  document.querySelector("#question-stem").textContent = question.stem;
  document.querySelector("#previous-button").disabled = session.index === 0;
  document.querySelector("#next-button").textContent = session.index === session.questions.length - 1 ? "Last question" : "Next →";
  const feedback = session.feedback[question.id];
  const checking = session.checking.has(question.id);
  const hasAnswer = session.answers[question.id] !== undefined;
  document.querySelector("#question-card").classList.toggle("has-feedback", Boolean(feedback));
  document.querySelector("#next-button").disabled = (hasAnswer && !feedback) || checking;
  showMessage(examMessage, "");
  renderAnswerFeedback(feedback);

  const marked = session.marked.has(question.id);
  const markButton = document.querySelector("#mark-button");
  markButton.setAttribute("aria-pressed", String(marked));
  markButton.textContent = marked ? "★ Marked for review" : "☆ Mark for review";
  markButton.classList.toggle("is-marked", marked);

  optionList.replaceChildren(optionList.querySelector("legend"));
  if (question.format === "written") {
    const label = document.createElement("label");
    label.className = "written-response-label";
    label.htmlFor = "written-response";
    label.textContent = "Your answer";
    const response = document.createElement("textarea");
    response.id = "written-response";
    response.name = "written-response";
    response.rows = 3;
    response.maxLength = 2000;
    response.placeholder = "Type your answer here…";
    response.value = session.answers[question.id] || "";
    response.disabled = Boolean(feedback) || checking;
    response.addEventListener("input", () => {
      const value = response.value;
      if (value.trim()) session.answers[question.id] = value;
      else delete session.answers[question.id];
      renderProgress();
      renderQuestionNav();
      checkButton.disabled = !value.trim() || Boolean(session.feedback[question.id]) || session.checking.has(question.id);
      document.querySelector("#next-button").disabled = Boolean(value.trim());
    });
    const checkButton = document.createElement("button");
    checkButton.type = "button";
    checkButton.className = "button button-check";
    checkButton.textContent = checking ? "Checking answer…" : "Check answer";
    checkButton.disabled = !hasAnswer || Boolean(feedback) || checking;
    checkButton.addEventListener("click", () => checkCurrentAnswer());
    optionList.append(label, response, checkButton);
  } else {
    question.options.forEach((text, optionIndex) => {
      const label = document.createElement("label");
      label.className = "option-row";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "answer";
      radio.value = String(optionIndex);
      radio.checked = session.answers[question.id] === optionIndex;
      radio.disabled = Boolean(feedback) || checking;
      radio.addEventListener("change", () => {
        session.answers[question.id] = optionIndex;
        renderProgress();
        renderQuestionNav();
        checkCurrentAnswer();
      });
      const letter = document.createElement("span");
      letter.className = "option-letter";
      letter.textContent = String.fromCharCode(65 + optionIndex);
      const answer = document.createElement("span");
      answer.className = "option-text";
      answer.textContent = text;
      label.append(radio, letter, answer);
      optionList.append(label);
    });
  }
  renderProgress();
  renderQuestionNav();
  document.querySelector("#question-stem").focus({ preventScroll: true });
}

function renderAnswerFeedback(feedback) {
  const panel = document.querySelector("#answer-feedback");
  panel.hidden = !feedback;
  panel.classList.toggle("is-correct", Boolean(feedback?.correct));
  panel.classList.toggle("is-incorrect", Boolean(feedback && !feedback.correct));
  if (!feedback) {
    document.querySelector("#feedback-heading").textContent = "";
    document.querySelector("#feedback-answer").textContent = "";
    document.querySelector("#feedback-explanation").textContent = "";
    return;
  }
  document.querySelector("#feedback-heading").textContent = feedback.correct ? "Correct!" : "Not quite";
  document.querySelector("#feedback-answer").textContent = feedback.correct
    ? "Your answer is correct."
    : `Correct answer: ${feedback.correctAnswer}`;
  document.querySelector("#feedback-explanation").textContent = feedback.explanation;
}

async function checkCurrentAnswer() {
  if (!session || session.finished) return;
  const question = session.questions[session.index];
  const answer = session.answers[question.id];
  if (answer === undefined || session.feedback[question.id] || session.checking.has(question.id)) return;
  showMessage(examMessage, "");
  session.checking.add(question.id);
  renderQuestion();
  try {
    const feedback = await requestJson("/api/check-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examId: session.examId,
        questionId: question.id,
        answer,
      }),
    });
    session.feedback[question.id] = feedback;
  } catch (error) {
    showMessage(examMessage, error.message);
  } finally {
    session.checking.delete(question.id);
    renderQuestion();
    renderProgress();
    renderQuestionNav();
  }
}

function moveToQuestion(index) {
  const currentQuestion = session.questions[session.index];
  if (
    index !== session.index
    && session.answers[currentQuestion.id] !== undefined
    && !session.feedback[currentQuestion.id]
  ) {
    showMessage(examMessage, "Check your answer before moving to another question.");
    return;
  }
  session.index = index;
  renderQuestion();
}

function renderProgress() {
  const answered = Object.keys(session.answers).length;
  document.querySelector("#answered-text").textContent = `${answered} answered`;
  document.querySelector("#mobile-answered-count").textContent = `${answered} of ${session.questions.length} answered`;
  const percentage = Math.round(((session.index + 1) / session.questions.length) * 100);
  document.querySelector("#progress-fill").style.width = `${percentage}%`;
  progressTrack.setAttribute("aria-valuenow", String(percentage));
}

function renderQuestionNav() {
  questionNav.replaceChildren();
  session.questions.forEach((question, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(index + 1);
    button.className = "nav-question";
    if (session.answers[question.id] !== undefined) button.classList.add("answered");
    if (session.marked.has(question.id)) button.classList.add("marked");
    if (index === session.index) button.classList.add("current");
    button.setAttribute("aria-label", `Go to question ${index + 1}${session.answers[question.id] !== undefined ? ", answered" : ", unanswered"}${session.marked.has(question.id) ? ", marked for review" : ""}`);
    button.setAttribute("aria-current", index === session.index ? "step" : "false");
    button.addEventListener("click", () => {
      moveToQuestion(index);
    });
    questionNav.append(button);
  });
  const unanswered = session.questions.length - Object.keys(session.answers).length;
  document.querySelector("#unanswered-warning").textContent = unanswered ? `${unanswered} unanswered` : "All questions answered";
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function updateTimer() {
  const timer = document.querySelector("#timer");
  timer.textContent = formatTime(session.secondsLeft);
  timer.classList.toggle("timer-warning", session.secondsLeft <= 300);
}

function tick() {
  if (!session || session.finished) return;
  session.secondsLeft -= 1;
  updateTimer();
  if (session.secondsLeft <= 0) {
    finishExam(true);
  }
}

async function finishExam(automatic = false) {
  if (!session || session.finished || session.submitting) return;
  const uncheckedIndex = session.questions.findIndex((question) => (
    session.answers[question.id] !== undefined && !session.feedback[question.id]
  ));
  if (!automatic && uncheckedIndex !== -1) {
    moveToQuestion(uncheckedIndex);
    showMessage(examMessage, "Check your answer before submitting the exam.");
    return;
  }
  const unanswered = session.questions.length - Object.keys(session.answers).length;
  const confirmation = unanswered > 0
    ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit anyway? You cannot change answers after submission.`
    : "Submit your exam now? You cannot change answers after submission.";
  if (!automatic && !window.confirm(confirmation)) {
    return;
  }

  session.submitting = true;
  document.querySelector("#submit-button").disabled = true;
  document.querySelector("#mobile-submit-button").disabled = true;
  showMessage(examMessage, automatic ? "Time is up. Your answers are being scored…" : "");
  try {
    const result = await requestJson("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examId: session.examId,
        answers: session.answers,
      }),
    });
    session.finished = true;
    window.clearInterval(session.timerId);
    renderResults(result);
    setScreen("result");
  } catch (error) {
    showMessage(examMessage, error.message);
  } finally {
    session.submitting = false;
    document.querySelector("#submit-button").disabled = false;
    document.querySelector("#mobile-submit-button").disabled = false;
  }
}

function renderResults(result) {
  const incorrect = result.total - result.score;
  document.querySelector("#score-percent").textContent = `${result.percent}%`;
  document.querySelector(".score-card").classList.toggle("is-celebrating", result.percent >= 80);
  document.querySelector("#score-detail").textContent = `${result.score} of ${result.total} correct`;
  document.querySelector("#score-message").textContent = result.percent >= 80
    ? `Strong work. You answered ${result.score} correctly and missed ${incorrect}.`
    : `Keep practicing. Review the explanations below, then try another session.`;
  session.results = result.results;
  saveSessionResult(result);
  renderReviewList();
}

function renderReviewList() {
  const filter = document.querySelector("#review-filter").value;
  const container = document.querySelector("#review-list");
  container.replaceChildren();
  const results = session.results.filter((result) => {
    if (filter === "incorrect") return !result.correct && result.answered;
    if (filter === "unanswered") return !result.answered;
    return true;
  });
  if (results.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-review";
    empty.textContent = "No questions match this review filter.";
    container.append(empty);
    return;
  }

  results.forEach((result, index) => {
    const card = document.createElement("article");
    card.className = `review-card ${result.correct ? "review-correct" : "review-incorrect"}`;
    const heading = document.createElement("div");
    heading.className = "review-card-heading";
    const number = document.createElement("span");
    number.className = "review-number";
    number.textContent = `Question ${index + 1}`;
    const status = document.createElement("span");
    status.className = "review-status";
    status.textContent = result.correct ? "Correct" : !result.answered ? "Unanswered" : "Review";
    heading.append(number, status);
    const stem = document.createElement("h3");
    stem.textContent = result.stem;
    const selected = document.createElement("p");
    selected.className = "review-answer";
    selected.textContent = !result.answered
      ? "Your answer: Not answered"
      : `Your answer: ${result.format === "written" ? result.responseText : result.options[result.selectedIndex]}`;
    const correct = document.createElement("p");
    correct.className = "review-answer correct-answer";
    correct.textContent = `Correct answer: ${result.correctAnswer}`;
    const explanation = document.createElement("p");
    explanation.className = "review-explanation";
    explanation.textContent = result.explanation;
    const meta = document.createElement("p");
    meta.className = "review-meta";
    meta.textContent = `${result.level[0].toUpperCase() + result.level.slice(1)} · ${result.format === "written" ? "Written response" : "Multiple choice"} · ${result.topic} · Source: ${result.source}`;
    card.append(heading, stem, selected, correct, explanation, meta);
    container.append(card);
  });
}

function returnToSetup() {
  if (session?.timerId) window.clearInterval(session.timerId);
  session = null;
  showMessage(setupError, "");
  setScreen("setup");
}

function returnToHome() {
  if (session?.timerId) window.clearInterval(session.timerId);
  setScreen("home");
}

document.querySelectorAll("[data-screen]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToScreen(link.dataset.screen);
  });
});

document.querySelectorAll("[data-action='signup']").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openAuth("signup");
  });
});
document.querySelectorAll("[data-action='login']").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openAuth("login");
  });
});
document.querySelector('[data-action="logout"]').addEventListener("click", async () => {
  if (!firebaseAuth || !firebaseSdk) return;
  await firebaseSdk.signOut(firebaseAuth);
});
document.querySelector("#checkout-signout-button").addEventListener("click", async () => {
  if (!firebaseAuth || !firebaseSdk) return;
  await firebaseSdk.signOut(firebaseAuth);
});
document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => showAuthMode(button.dataset.authMode));
});
document.querySelector("#login-form").addEventListener("submit", handleLogin);
document.querySelector("#signup-form").addEventListener("submit", handleSignup);
document.querySelector("#profile-form").addEventListener("submit", handleProfileSubmit);
document.querySelector("#checkout-button").addEventListener("click", startCheckout);
document.querySelector("#forgot-password-button").addEventListener("click", async () => {
  if (!firebaseAuth || !firebaseSdk) {
    showMessage(
      document.querySelector("#firebase-config-notice"),
      "Firebase is not configured yet. Password recovery will be available when account setup is complete."
    );
    return;
  }
  const email = document.querySelector("#login-email").value.trim();
  if (!email) {
    showMessage(document.querySelector("#login-error"), "Enter your email address first, then request a password reset.");
    document.querySelector("#login-email").focus();
    return;
  }
  try {
    await firebaseSdk.sendPasswordResetEmail(firebaseAuth, email);
    showMessage(document.querySelector("#login-error"), "Password reset instructions have been sent if that email is registered.");
  } catch (error) {
    showMessage(document.querySelector("#login-error"), error.message);
  }
});

document.querySelectorAll("[data-quick-count]").forEach((button) => {
  button.addEventListener("click", () => {
    prepareQuickPractice({
      count: Number(button.dataset.quickCount),
      duration: Number(button.dataset.quickDuration),
    });
  });
});

setupForm.addEventListener("submit", startExam);
levelSelect.addEventListener("change", updateAvailability);
topicSelect.addEventListener("change", updateAvailability);
countInput.addEventListener("change", updateAvailability);
countStepButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const step = Number(button.dataset.countStep);
    const current = Number(countInput.value);
    const minimum = Number(countInput.min);
    const maximum = Number(countInput.max);
    countInput.value = String(Math.max(minimum, Math.min(maximum, (Number.isInteger(current) ? current : minimum) + step)));
    updateAvailability();
  });
});
document.querySelector("#previous-button").addEventListener("click", () => {
  if (session.index > 0) {
    moveToQuestion(session.index - 1);
  }
});
document.querySelector("#next-button").addEventListener("click", () => {
  if (session.index < session.questions.length - 1) {
    moveToQuestion(session.index + 1);
  }
});
document.querySelector("#mark-button").addEventListener("click", () => {
  const id = session.questions[session.index].id;
  if (session.marked.has(id)) session.marked.delete(id);
  else session.marked.add(id);
  renderQuestion();
});
document.querySelector("#submit-button").addEventListener("click", () => finishExam());
document.querySelector("#mobile-submit-button").addEventListener("click", () => finishExam());
document.querySelector("#retry-button").addEventListener("click", returnToSetup);
document.querySelector("#home-button").addEventListener("click", returnToHome);
document.querySelector("#review-filter").addEventListener("change", renderReviewList);

setupHeroMotion();
setupQuestionCardMotion();
setHeaderForAccount(false);
setScreen("landing");
initializeFirebase();
