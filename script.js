const SUBJECTS = [
  "Verbal Ability",
  "Analytical Ability",
  "Numerical Ability",
  "General Information",
];
const subjectWeights = {
  "Verbal Ability": 0.3,
  "Analytical Ability": 0.35,
  "Numerical Ability": 0.3,
  "General Information": 0.05,
};

// --- Shuffle helper ---
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- Shuffles a single question's answer choices, remapping correctAnswer
//     so it still points at the right choice wherever it lands. Returns a
//     NEW object - never mutates the original question in questionsDatabase. ---
function shuffleQuestionChoices(q) {
  const order = shuffleArray([0, 1, 2, 3]); // e.g. [2, 0, 3, 1]
  const newChoices = order.map((originalIndex) => q.choices[originalIndex]);
  const newCorrectAnswer = order.indexOf(q.correctAnswer);
  return { ...q, choices: newChoices, correctAnswer: newCorrectAnswer };
}

// --- Applies choice-shuffling to a whole exam's worth of questions ---
function randomizeChoicesForExam(questions) {
  return questions.map(shuffleQuestionChoices);
}

// --- Builds a question set by pulling `count` questions per subject from the bank ---
// breakdown = { "Verbal Ability": 15, "Analytical Ability": 15, ... }
function buildFromBank(breakdown, difficulty) {
  let pool = [];
  let shortfall = false;
  Object.entries(breakdown).forEach(([subject, count]) => {
    const available = shuffleArray(
      (questionsDatabase.bank[subject] &&
        questionsDatabase.bank[subject][difficulty]) ||
        [],
    );
    if (available.length < count) shortfall = true;
    pool = pool.concat(available.slice(0, count));
  });
  if (shortfall) {
    console.warn(
      `Heads up: not enough ${difficulty} questions loaded for one or more subjects yet - the exam will use however many are available. Add more in questionsDatabase.bank[subject].${difficulty}.`,
    );
  }
  return shuffleArray(pool);
}

// --- Builds a 150-item "Random" Full Exam by mixing all difficulties from the bank ---
function buildRandomFullExam() {
  const counts = {
    "Verbal Ability": 45,
    "Analytical Ability": 45,
    "Numerical Ability": 45,
    "General Information": 15,
  };
  let pool = [];
  Object.entries(counts).forEach(([subject, count]) => {
    const allDifficulties = shuffleArray([
      ...((questionsDatabase.bank[subject] &&
        questionsDatabase.bank[subject].easy) ||
        []),
      ...((questionsDatabase.bank[subject] &&
        questionsDatabase.bank[subject].medium) ||
        []),
      ...((questionsDatabase.bank[subject] &&
        questionsDatabase.bank[subject].hard) ||
        []),
    ]);
    pool = pool.concat(allDifficulties.slice(0, count));
  });
  return shuffleArray(pool);
}

// =====================================================================
// APPLICATION STATE
// =====================================================================
let currentScreen = "dashboard";
let currentQuestions = [];
let currentIndex = 0;
let userAnswers = {};
let flaggedQuestions = new Set();
let timerInterval;
let timeRemaining = 0;
let initialTime = 0;

let setupState = {
  tab: "mock",
  difficulty: "easy",
  targetSubject: "Verbal Ability",
};
let fullExamChoice = "book"; // 'book' | 'random'

// =====================================================================
// NAVIGATION & SETUP
// =====================================================================
function navigate(screenId) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  document
    .querySelectorAll(".nav-item")
    .forEach((nav) =>
      nav.classList.remove(
        "text-primary",
        "bg-secondary",
        "shadow-sm",
        "border-border/50",
      ),
    );
  if (screenId === "dashboard") {
    renderDashboard();
    document
      .getElementById("nav-dashboard")
      .classList.add(
        "text-primary",
        "bg-secondary",
        "shadow-sm",
        "border-border/50",
      );
  } else if (screenId === "exam-setup") {
    renderExamSetup();
    document
      .getElementById("nav-take-exam")
      .classList.add(
        "text-primary",
        "bg-secondary",
        "shadow-sm",
        "border-border/50",
      );
  }
}

function setExamTab(tab) {
  setupState.tab = tab;
  setupState.difficulty = tab === "full" ? "mixed" : "easy";
  renderExamSetup();
}

function setDifficulty(diff) {
  if (setupState.tab === "full") return;
  setupState.difficulty = diff;
  renderExamSetup();
}

function setSubject(subj) {
  setupState.targetSubject = subj;
  renderExamSetup();
}

function setFullExamChoice(choice) {
  fullExamChoice = choice;
  renderExamSetup();
}

function renderExamSetup() {
  // 1. Update Tabs
  ["mock", "subject", "full"].forEach((t) => {
    const el = document.getElementById(`tab-${t}`);
    if (el)
      el.className = `flex-1 py-2.5 px-3 rounded-lg text-sm transition-all ${setupState.tab === t ? "font-bold bg-secondary text-primary shadow-sm border border-border/50" : "font-semibold text-muted-foreground hover:text-foreground"}`;
  });

  // 2. Update Difficulty
  ["easy", "medium", "hard"].forEach((d) => {
    const b = document.getElementById(`diff-${d}`);
    if (b) {
      b.disabled = setupState.tab === "full";
      if (setupState.tab === "full") {
        b.className =
          "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center border-border bg-card opacity-50 cursor-not-allowed text-muted-foreground";
      } else {
        if (setupState.difficulty === d) {
          let color =
            d === "easy"
              ? "success"
              : d === "medium"
                ? "warning"
                : "destructive";
          b.className = `flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center border-${color} bg-${color}/10 text-${color}`;
        } else {
          b.className =
            "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary";
        }
      }
    }
  });

  const mxd = document.getElementById("diff-mixed");
  if (mxd) {
    if (setupState.tab === "full")
      mxd.className =
        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center border-primary bg-primary/10 text-primary";
    else
      mxd.className =
        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center border-border bg-card opacity-50 cursor-not-allowed text-muted-foreground";
  }

  // 3. Render Info Card
  const infoCard = document.getElementById("setup-info-card");
  let html = "",
    btnText = "";

  if (setupState.tab === "mock") {
    let b;
    if (setupState.difficulty === "easy")
      b = { v: 15, a: 15, n: 15, g: 5, t: "1 hour" };
    else if (setupState.difficulty === "medium")
      b = { v: 30, a: 30, n: 30, g: 10, t: "2 hours" };
    else b = { v: 45, a: 45, n: 45, g: 15, t: "3 hours" };

    let totalQ = b.v + b.a + b.n + b.g;

    html = `
            <div class="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h3 class="font-bold text-foreground">Exam Breakdown</h3>
                <div class="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">${totalQ} Qs · ${b.t}</div>
            </div>
            <div class="grid grid-cols-2 gap-4 text-sm font-semibold">
                <div class="flex items-start gap-2"><div class="text-blue-500 mt-0.5">📘</div><div>Verbal Ability<div class="text-xs text-muted-foreground">${b.v} questions</div></div></div>
                <div class="flex items-start gap-2"><div class="text-purple-500 mt-0.5">🧠</div><div>Analytical Ability<div class="text-xs text-muted-foreground">${b.a} questions</div></div></div>
                <div class="flex items-start gap-2"><div class="text-emerald-500 mt-0.5">#️⃣</div><div>Numerical Ability<div class="text-xs text-muted-foreground">${b.n} questions</div></div></div>
                <div class="flex items-start gap-2"><div class="text-amber-500 mt-0.5">🌐</div><div>General Info<div class="text-xs text-muted-foreground">${b.g} questions</div></div></div>
            </div>
            <div class="mt-6 pt-6 border-t border-border">
                <h3 class="font-bold text-foreground mb-3">Exam Rules</h3>
                <ol class="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground font-medium marker:text-primary marker:font-bold">
                    <li>You have ${b.t} to complete the exam</li><li>You may flag questions to review later</li><li>Navigate between questions freely</li><li>Submit before time runs out to save your score</li><li>Passing score is 80% (weighted by subject)</li>
                </ol>
            </div>`;
    btnText = `Start ${setupState.difficulty.charAt(0).toUpperCase() + setupState.difficulty.slice(1)} Mock Exam`;
  } else if (setupState.tab === "subject") {
    const subjs = [
      {
        n: "Verbal Ability",
        i: "📘",
        d: "Grammar, vocabulary, reading comprehension...",
      },
      {
        n: "Analytical Ability",
        i: "🧠",
        d: "Logic, abstract reasoning, data interpretation...",
      },
      {
        n: "Numerical Ability",
        i: "#️⃣",
        d: "Math operations, number series, word problems...",
      },
      {
        n: "General Information",
        i: "🌐",
        d: "Philippine Constitution, civil service laws...",
      },
    ];

    let subjCards = subjs
      .map((s) => {
        let active = setupState.targetSubject === s.n;
        return `
            <div onclick="setSubject('${s.n}')" class="flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${active ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:border-primary/30"}">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg ${active ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}">${s.i}</div>
                <div class="flex-1">
                    <p class="font-bold text-sm">${s.n}</p>
                    <p class="text-xs ${active ? "text-primary/80" : "text-muted-foreground"} mt-0.5">${s.d}</p>
                </div>
            </div>`;
      })
      .join("");

    html = `
            <div class="mb-4 pb-4 border-b border-border">
                <h3 class="font-bold text-foreground">Select Subject</h3>
                <p class="text-xs text-muted-foreground mt-1">Practice 50 questions from a single subject area.</p>
            </div>
            <div class="grid grid-cols-1 gap-3">${subjCards}</div>
        `;
    btnText = `Start Practice`;
  } else if (setupState.tab === "full") {
    const isBook = fullExamChoice === "book";
    const bookBtnClass = isBook
      ? "flex-1 py-2.5 rounded-lg text-sm font-bold bg-primary text-primary-foreground shadow-sm transition-all"
      : "flex-1 py-2.5 rounded-lg text-sm font-bold text-muted-foreground hover:text-foreground transition-all";
    const randomBtnClass = !isBook
      ? "flex-1 py-2.5 rounded-lg text-sm font-bold bg-primary text-primary-foreground shadow-sm transition-all"
      : "flex-1 py-2.5 rounded-lg text-sm font-bold text-muted-foreground hover:text-foreground transition-all";

    const description = isBook
      ? "This simulation mirrors the exact format of the real CSE, using the 150 questions taken directly from your physical reviewer book. You will have exactly 3 hours to finish all 150 questions."
      : "This generates a fresh set of 150 randomized questions pulled from the full question bank across all subjects and difficulty levels, distributed the same way as the real exam (45/45/45/15). You will have exactly 3 hours to finish.";

    html = `
            <div class="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl mb-6">
                <button onclick="setFullExamChoice('book')" class="${bookBtnClass}">Book</button>
                <button onclick="setFullExamChoice('random')" class="${randomBtnClass}">Random</button>
            </div>
            <div class="text-center py-6">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open-check-icon lucide-book-open-check"><path d="M12 21V7"/><path d="m16 12 2 2 4-4"/><path d="M22 6V4a1 1 0 0 0-1-1h-5a4 4 0 0 0-4 4 4 4 0 0 0-4-4H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6a1 1 0 0 0 1-1v-1.3"/></svg>
                </div>
                <h3 class="font-black text-foreground text-xl mb-2">150-Item Full Exam</h3>
                <p id="full-exam-description" class="text-sm text-muted-foreground leading-relaxed">${description}</p>
            </div>
        `;
    btnText = isBook ? "Start Full Exam (Book)" : "Start Full Exam (Random)";
  }

  infoCard.innerHTML = html;
  document.getElementById("start-btn-text").innerText = btnText;
}

// =====================================================================
// ACTIVE EXAM LOGIC
// =====================================================================
function startExam() {
  if (setupState.tab === "mock") {
    let b;
    if (setupState.difficulty === "easy") {
      b = {
        "Verbal Ability": 15,
        "Analytical Ability": 15,
        "Numerical Ability": 15,
        "General Information": 5,
      };
      timeRemaining = 3600;
    } else if (setupState.difficulty === "medium") {
      b = {
        "Verbal Ability": 30,
        "Analytical Ability": 30,
        "Numerical Ability": 30,
        "General Information": 10,
      };
      timeRemaining = 7200;
    } else {
      b = {
        "Verbal Ability": 45,
        "Analytical Ability": 45,
        "Numerical Ability": 45,
        "General Information": 15,
      };
      timeRemaining = 10800;
    }
    currentQuestions = buildFromBank(b, setupState.difficulty);
  } else if (setupState.tab === "subject") {
    timeRemaining = 3600;
    const pool =
      (questionsDatabase.bank[setupState.targetSubject] &&
        questionsDatabase.bank[setupState.targetSubject][
          setupState.difficulty
        ]) ||
      [];
    currentQuestions = shuffleArray(pool).slice(0, 50);
  } else if (setupState.tab === "full") {
    timeRemaining = 10800;
    if (fullExamChoice === "book") {
      currentQuestions = shuffleArray(questionsDatabase.full).slice(0, 150);
    } else {
      currentQuestions = buildRandomFullExam();
    }
  }

  if (!currentQuestions || currentQuestions.length === 0) {
    alert(
      "No questions are loaded for this selection yet. Add some to questionsDatabase in script.js, then try again.",
    );
    return;
  }

  // --- ADD THIS FLATTENING LOGIC ---
  let flattenedQuestions = [];
  currentQuestions.forEach((item) => {
    if (item.type === "group") {
      // If it's a group, pull out the questions but attach the image and instructions to each one
      item.questions.forEach((subQ) => {
        flattenedQuestions.push({
          ...subQ,
          instruction: item.instruction,
          referenceImage: item.referenceImage,
        });
      });
    } else {
      flattenedQuestions.push(item);
    }
  });
  currentQuestions = flattenedQuestions;
  // --- END FLATTENING LOGIC ---

  // Shuffle each question's A/B/C/D order so repeated questions still
  // require actually knowing the answer, not just remembering the letter.
  currentQuestions = randomizeChoicesForExam(currentQuestions);

  userAnswers = {};
  flaggedQuestions.clear();
  currentIndex = 0;
  initialTime = timeRemaining;

  navigate("active-exam");
  renderQuestion();
  renderGrid();
  startTimer();
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeRemaining--;
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      submitExam();
    }
    let m = Math.floor(timeRemaining / 60)
      .toString()
      .padStart(2, "0");
    let s = (timeRemaining % 60).toString().padStart(2, "0");
    let h = Math.floor(m / 60);
    if (h > 0) {
      m = (m % 60).toString().padStart(2, "0");
      document.getElementById("time-display").innerText = `${h}:${m}:${s}`;
    } else {
      document.getElementById("time-display").innerText = `${m}:${s}`;
    }
  }, 1000);
}

function renderQuestion() {
  const q = currentQuestions[currentIndex];
  document.getElementById("question-number").innerHTML =
    `Question ${currentIndex + 1} of ${currentQuestions.length}`;
  document.getElementById("question-subject").innerHTML = q.subject;
  document.getElementById("question-text").innerHTML = q.text;
  document.getElementById("question-tracker").innerHTML =
    `${currentIndex + 1} / ${currentQuestions.length}`;

  // --- ADD THIS IMAGE/PASSAGE RENDERING LOGIC ---
  const refContainer = document.getElementById("reference-container");
  const refInstruction = document.getElementById("reference-instruction");
  const refImage = document.getElementById("reference-image");

  // Check if the question has EITHER an instruction (passage) OR an image
  if (q.instruction || q.referenceImage) {
    refContainer.classList.remove("hidden");

    // 1. Handle the text passage / instruction
    if (q.instruction) {
      // .replace(/\n/g, '<br>') allows you to use \n in your database to create paragraph breaks!
      refInstruction.innerHTML = q.instruction.replace(/\n/g, "<br>");
      refInstruction.classList.remove("hidden");
    } else {
      refInstruction.classList.add("hidden");
    }

    // 2. Handle the image
    if (q.referenceImage) {
      refImage.src = q.referenceImage;
      refImage.classList.remove("hidden");
    } else {
      refImage.classList.add("hidden"); // Hides the broken image icon if there's no photo
    }
  } else {
    // Hide the whole box if it's a normal question with no passage and no image
    refContainer.classList.add("hidden");
  }
  // --- END IMAGE/PASSAGE LOGIC ---

  const flagBtn = document.getElementById("flag-btn");
  if (flaggedQuestions.has(currentIndex)) {
    flagBtn.classList.replace("text-muted-foreground", "text-warning");
    flagBtn.classList.add("border-warning");
  } else {
    flagBtn.classList.replace("text-warning", "text-muted-foreground");
    flagBtn.classList.remove("border-warning");
  }

  document.getElementById("hint-text").classList.add("hidden");
  document.getElementById("hint-text").innerText =
    q.hint || "No hint available.";

  const optionsContainer = document.getElementById("options-container");
  optionsContainer.innerHTML = "";
  const letters = ["A", "B", "C", "D"];
  q.choices.forEach((choice, index) => {
    const isSelected = userAnswers[currentIndex] === index;
    const btn = document.createElement("div");
    btn.className = `flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all font-bold text-sm ${isSelected ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-border bg-card text-foreground hover:border-primary/40"}`;
    btn.onclick = () => selectAnswer(index);
    btn.innerHTML = `<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}">${letters[index]}</div><div>${choice}</div>`;
    optionsContainer.appendChild(btn);
  });

  updateCounters();
  updateGridActiveState();
}

function selectAnswer(i) {
  userAnswers[currentIndex] = i;
  renderQuestion();
  renderGrid();
}
function showHint() {
  document.getElementById("hint-text").classList.remove("hidden");
}
function toggleFlag() {
  if (flaggedQuestions.has(currentIndex)) flaggedQuestions.delete(currentIndex);
  else flaggedQuestions.add(currentIndex);
  renderQuestion();
  renderGrid();
}
function nextQuestion() {
  if (currentIndex < currentQuestions.length - 1) {
    currentIndex++;
    renderQuestion();
  }
}
function prevQuestion() {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion();
  }
}
function jumpToQuestion(index) {
  currentIndex = index;
  renderQuestion();
}

function renderGrid() {
  const grid = document.getElementById("grid-navigator");
  grid.innerHTML = "";
  for (let i = 0; i < currentQuestions.length; i++) {
    const cell = document.createElement("button");
    let stateClass =
      "bg-card border-border text-foreground hover:border-primary/50";
    if (flaggedQuestions.has(i))
      stateClass = "bg-warning/20 border-warning text-warning-dark";
    else if (userAnswers[i] !== undefined)
      stateClass = "bg-primary text-primary-foreground border-primary";
    cell.className =
      "w-10 h-10 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 " +
      stateClass;
    cell.innerText = i + 1;
    cell.onclick = () => jumpToQuestion(i);
    grid.appendChild(cell);
  }
  updateGridActiveState();
}

function updateGridActiveState() {
  const cells = document.querySelectorAll("#grid-navigator button");
  cells.forEach((cell, i) => {
    if (i === currentIndex)
      cell.classList.add(
        "ring-2",
        "ring-primary",
        "ring-offset-2",
        "ring-offset-background",
      );
    else
      cell.classList.remove(
        "ring-2",
        "ring-primary",
        "ring-offset-2",
        "ring-offset-background",
      );
  });
}

function updateCounters() {
  const answeredCount = Object.keys(userAnswers).length;
  const total = currentQuestions.length;
  document.getElementById("answered-count").innerText = answeredCount;
  document.getElementById("total-count").innerText = total;
  document.getElementById("unanswered-warning").innerText =
    `${total - answeredCount} unanswered`;
}

// =====================================================================
// SUBMISSION & RESULTS
// =====================================================================
function openSubmitModal() {
  const answered = Object.keys(userAnswers).length;
  const total = currentQuestions.length;
  let m = Math.floor(timeRemaining / 60)
    .toString()
    .padStart(2, "0");
  let s = (timeRemaining % 60).toString().padStart(2, "0");
  document.getElementById("submit-modal-text").innerText =
    `You have answered ${answered} of ${total} questions. ${total - answered} questions will be marked as unanswered. Time remaining: ${m}:${s}.`;
  document.getElementById("submit-modal").classList.remove("hidden");
}

function closeSubmitModal() {
  document.getElementById("submit-modal").classList.add("hidden");
}

function submitExam() {
  clearInterval(timerInterval);
  closeSubmitModal();

  let subjectScores = {};
  SUBJECTS.forEach((s) => (subjectScores[s] = { c: 0, t: 0 }));
  let totalCorrect = 0;

  currentQuestions.forEach((q, index) => {
    subjectScores[q.subject].t++;
    if (userAnswers[index] === q.correctAnswer) {
      subjectScores[q.subject].c++;
      totalCorrect++;
    }
  });

  let finalWeightedScore = 0;
  let isSubjectExam = setupState.tab === "subject";

  if (isSubjectExam) {
    // If subject exam, score is just straight percentage
    const subj = setupState.targetSubject;
    if (subjectScores[subj].t > 0)
      finalWeightedScore = subjectScores[subj].c / subjectScores[subj].t;
  } else {
    // Weighted
    for (const [subj, data] of Object.entries(subjectScores)) {
      if (data.t > 0 && subjectWeights[subj]) {
        finalWeightedScore += (data.c / data.t) * subjectWeights[subj];
      }
    }
  }

  let finalPercentage = Math.round(finalWeightedScore * 100);

  // Save to localStorage
  const history = JSON.parse(
    localStorage.getItem("cseReadyExamHistory") || "[]",
  );
  history.push({
    date: new Date().toISOString().split("T")[0],
    timestamp: Date.now(),
    overallScore: finalPercentage,
    subjectScores: {
      "Verbal Ability": {
        correct: subjectScores["Verbal Ability"].c,
        total: subjectScores["Verbal Ability"].t,
      },
      "Analytical Ability": {
        correct: subjectScores["Analytical Ability"].c,
        total: subjectScores["Analytical Ability"].t,
      },
      "Numerical Ability": {
        correct: subjectScores["Numerical Ability"].c,
        total: subjectScores["Numerical Ability"].t,
      },
      "General Information": {
        correct: subjectScores["General Information"].c,
        total: subjectScores["General Information"].t,
      },
    },
  });
  localStorage.setItem("cseReadyExamHistory", JSON.stringify(history));

  renderResultsScreen(finalPercentage, totalCorrect, subjectScores);
  generateReview();
  navigate("exam-results");
}

function renderResultsScreen(score, correct, subjScores) {
  document.getElementById("final-score").innerText = `${score}%`;
  const statusEl = document.getElementById("result-status");
  const iconBg = document.getElementById("result-icon-bg");
  const icon = document.getElementById("result-icon");

  if (score >= 80) {
    statusEl.innerText = "PASSED";
    statusEl.className =
      "text-4xl font-black mb-2 tracking-tight uppercase text-success";
    iconBg.className =
      "w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 bg-success/20 text-success";
    icon.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
  } else {
    statusEl.innerText = "FAILED";
    statusEl.className =
      "text-4xl font-black mb-2 tracking-tight uppercase text-destructive";
    iconBg.className =
      "w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 bg-destructive/20 text-destructive";
    icon.innerHTML = `<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>`;
  }

  document.getElementById("res-correct-count").innerText =
    `${correct}/${currentQuestions.length} correct`;
  let timeSpent = initialTime - timeRemaining;
  let m = Math.floor(timeSpent / 60)
    .toString()
    .padStart(2, "0");
  let s = (timeSpent % 60).toString().padStart(2, "0");
  document.getElementById("res-time-taken").innerText = `${m}:${s} taken`;

  const bdContainer = document.getElementById("results-breakdown");
  bdContainer.innerHTML = "";
  const colors = {
    "Verbal Ability": "blue",
    "Analytical Ability": "purple",
    "Numerical Ability": "emerald",
    "General Information": "amber",
  };

  for (const [subj, data] of Object.entries(subjScores)) {
    if (data.t === 0) continue;
    let pct = Math.round((data.c / data.t) * 100);
    let cName = colors[subj];
    bdContainer.innerHTML += `
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-bold text-${cName}-600">${subj}</span>
                <div class="flex gap-4">
                  <span class="text-sm font-semibold text-muted-foreground">${data.c}/${data.t}</span>
                  <span class="text-sm font-black text-${cName}-600">${pct}%</span>
                </div>
              </div>
              <div class="relative w-full overflow-hidden rounded-full bg-secondary h-2">
                <div class="h-full bg-${cName}-500 transition-all rounded-full" style="width: ${pct}%"></div>
              </div>
            </div>`;
  }
}

// =====================================================================
// REVIEW SCREEN
// =====================================================================
let currentFilter = "all";

function filterReview(filter) {
  currentFilter = filter;
  document.querySelectorAll(".review-filter").forEach((b) => {
    b.className =
      "review-filter px-4 py-2 rounded-lg font-bold text-sm transition-colors " +
      (b.id === `filter-${filter}`
        ? "bg-primary text-primary-foreground shadow-sm"
        : "bg-secondary text-foreground hover:bg-border/50");
  });
  generateReview();
}

function generateReview() {
  const list = document.getElementById("review-list");
  list.innerHTML = "";
  const letters = ["A", "B", "C", "D"];

  let counts = {
    all: currentQuestions.length,
    correct: 0,
    wrong: 0,
    flagged: flaggedQuestions.size,
  };

  currentQuestions.forEach((q, i) => {
    const userAnswer = userAnswers[i];
    const isCorrect = userAnswer === q.correctAnswer;
    const isAnswered = userAnswer !== undefined;

    if (isCorrect) counts.correct++;
    if (!isCorrect) counts.wrong++; // Counts unanswered as wrong

    if (currentFilter === "correct" && !isCorrect) return;
    if (currentFilter === "wrong" && isCorrect) return;
    if (currentFilter === "flagged" && !flaggedQuestions.has(i)) return;

    const reviewItem = document.createElement("div");
    reviewItem.className =
      "bg-card border border-border rounded-2xl p-6 shadow-sm";

    let statusIcon = isCorrect
      ? `<div class="bg-success/20 text-success p-1 rounded"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`
      : `<div class="bg-destructive/20 text-destructive p-1 rounded"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>`;

    let flagIcon = flaggedQuestions.has(i)
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-warning"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" x2="4" y1="22" y2="15"></line></svg>`
      : "";

    let optionsHTML = `<div class="space-y-3 mt-6">`;
    q.choices.forEach((choice, idx) => {
      let isUserChoice = userAnswer === idx;
      let isActualCorrect = q.correctAnswer === idx;

      let styleClass = "border-border bg-background text-foreground opacity-60";
      let checkIcon = "";

      if (isActualCorrect) {
        styleClass = "border-success bg-success/10 text-success";
        checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="ml-auto text-success"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      } else if (isUserChoice && !isActualCorrect) {
        styleClass = "border-destructive bg-destructive/10 text-destructive";
        checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="ml-auto text-destructive"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      }

      optionsHTML += `
                <div class="flex items-center gap-4 p-4 rounded-xl border-2 font-bold text-sm ${styleClass}">
                    <div class="w-7 h-7 rounded bg-foreground/10 flex items-center justify-center flex-shrink-0">${letters[idx]}</div>
                    <div>${choice}</div>
                    ${checkIcon}
                </div>
            `;
    });
    optionsHTML += `</div>`;

    let notAnsText = !isAnswered
      ? `<p class="text-sm font-bold text-destructive mt-4 italic">Not answered</p>`
      : "";

    reviewItem.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                    <span class="text-sm font-black text-muted-foreground">#${i + 1}</span>
                    <span class="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-md font-bold">${q.subject}</span>
                </div>
                <div class="flex items-center gap-2">${statusIcon}${flagIcon}</div>
            </div>
            <p class="text-lg font-semibold text-foreground">${q.text}</p>
            ${optionsHTML}
            ${notAnsText}
            
            <div class="mt-6 pt-6 border-t border-border">
                <h4 class="text-xs font-black uppercase tracking-widest text-primary mb-2">Explanation</h4>
                <div class="text-sm font-medium text-foreground bg-secondary/50 p-4 rounded-xl leading-relaxed">
                    ${q.explanation || "No explanation provided."}
                </div>
            </div>
        `;
    list.appendChild(reviewItem);
  });

  document.getElementById("review-total").innerText = counts.all;
  document.getElementById("count-all").innerText = counts.all;
  document.getElementById("count-correct").innerText = counts.correct;
  document.getElementById("count-wrong").innerText = counts.wrong;
  document.getElementById("count-flagged").innerText = counts.flagged;
}

// =====================================================================
// DASHBOARD SYNC LOGIC
// =====================================================================
function renderDashboard() {
  const history = JSON.parse(
    localStorage.getItem("cseReadyExamHistory") || "[]",
  );
  const totalExams = history.length;
  const avgScore =
    history.length > 0
      ? Math.round(
          history.reduce((acc, curr) => acc + curr.overallScore, 0) /
            history.length,
        )
      : 0;

  let streak = 0;
  if (history.length > 0) {
    const dates = [...new Set(history.map((r) => r.date))];
    streak = dates.length;
  }

  let readiness = "No data";
  if (totalExams > 0) {
    if (avgScore >= 80) readiness = "Exam Ready";
    else if (avgScore >= 60) readiness = "Almost Ready";
    else readiness = "Needs Improvement";
  }

  document.getElementById("stat-exams-taken").innerText = totalExams;
  document.getElementById("stat-avg-score").innerText = `${avgScore}%`;
  document.getElementById("stat-streak").innerText = streak;
  document.getElementById("stat-readiness").innerText = readiness;

  // Update goal
  document.getElementById("goal-current").innerText = `${avgScore}% current`;
  document.getElementById("goal-bar").style.transform =
    `translateX(-${100 - Math.min(100, (avgScore / 80) * 100)}%)`;
  if (totalExams > 0)
    document.getElementById("goal-remaining").innerText =
      `${Math.max(0, 80 - avgScore)}% to go — keep practicing!`;

  // Rebuild Subject Bars
  const subjectTotals = {};
  SUBJECTS.forEach((s) => (subjectTotals[s] = { c: 0, t: 0 }));
  history.forEach((r) => {
    SUBJECTS.forEach((s) => {
      if (r.subjectScores && r.subjectScores[s]) {
        subjectTotals[s].c += r.subjectScores[s].correct;
        subjectTotals[s].t += r.subjectScores[s].total;
      }
    });
  });

  const focusAreas = [];
  SUBJECTS.forEach((s) => {
    let t = subjectTotals[s].t;
    let pct = t > 0 ? Math.round((subjectTotals[s].c / t) * 100) : 0;

    let pctEl = document.getElementById(`subj-${s}-pct`);
    let barEl = document.getElementById(`subj-${s}-bar`);
    if (pctEl) pctEl.innerText = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;

    focusAreas.push({ subject: s, score: pct, hasData: t > 0 });
  });

  // Rebuild Focus Areas
  const focusContainer = document.getElementById("focus-areas-list");
  focusContainer.innerHTML = "";
  const weakAreas = focusAreas
    .sort((a, b) => a.score - b.score)
    .filter((f) => f.score < 80);
  const toShow = weakAreas.length > 0 ? weakAreas : focusAreas;

  if (totalExams === 0) {
    focusContainer.innerHTML = `<p class="text-sm font-semibold text-muted-foreground p-3.5">No exam data yet. Take a mock exam to see your focus areas here.</p>`;
  } else {
    toShow.forEach((area) => {
      const label = area.hasData
        ? `Avg: ${area.score}% — needs improvement`
        : "No attempts yet";
      const sName =
        area.subject === "General Information" ? "General Info" : area.subject;
      focusContainer.innerHTML += `
                <div class="flex items-center justify-between p-3.5 rounded-xl bg-background border border-border shadow-sm">
                  <div>
                    <p class="text-sm font-bold text-foreground">${sName}</p>
                    <p class="text-xs font-semibold text-muted-foreground mt-0.5">${label}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold bg-primary text-primary-foreground shadow-sm">${area.score}%</div>
                    <a href="#" onclick="navigate('exam-setup'); setExamTab('subject'); setSubject('${area.subject}'); return false;" class="hover:bg-secondary text-primary p-1.5 rounded-md transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-4 h-4"><path d="m9 18 6-6-6-6"></path></svg>
                    </a>
                  </div>
                </div>`;
    });
  }

  // Rebuild Chart
  const cCont = document.getElementById("performance-chart-container");
  if (totalExams === 0) {
    cCont.innerHTML = `<div class="w-full h-full flex items-center justify-center"><p class="text-sm font-semibold text-muted-foreground">No exams yet — your score trend will appear here.</p></div>`;
  } else {
    const recent = history.slice(-5);
    const w = 670,
      h = 220,
      pl = 65,
      pr = 665,
      pt = 5,
      pb = 185;
    const uw = pr - pl,
      uh = pb - pt,
      n = recent.length;
    const xFor = (i) => (n === 1 ? (pl + pr) / 2 : pl + (uw * i) / (n - 1));
    const yFor = (s) => pb - (uh * Math.min(100, Math.max(0, s))) / 100;

    const pts = recent.map((r, i) => ({
      x: xFor(i),
      y: yFor(r.overallScore),
      ...r,
    }));
    const dStr = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
      .join("");

    const grids = [pb, pb - uh * 0.25, pb - uh * 0.5, pb - uh * 0.75]
      .map(
        (y) =>
          `<line stroke-dasharray="3 3" stroke="hsl(var(--border))" fill="none" x1="${pl}" y1="${y}" x2="${pr}" y2="${y}"></line>`,
      )
      .join("");
    const yLbls = [0, 25, 50, 75, 100]
      .map(
        (pct) =>
          `<text x="${pl - 8}" y="${yFor(pct)}" text-anchor="end" fill="hsl(var(--muted-foreground))" font-size="11"><tspan dy="0.355em">${pct}%</tspan></text>`,
      )
      .join("");
    const xLbls = pts
      .map(
        (p) =>
          `<text x="${p.x}" y="${pb + 8}" text-anchor="middle" fill="hsl(var(--muted-foreground))" font-size="11"><tspan dy="0.71em">${new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</tspan></text>`,
      )
      .join("");
    const dots = pts
      .map(
        (p) =>
          `<circle r="5" stroke="hsl(var(--primary))" stroke-width="3" fill="hsl(var(--card))" cx="${p.x}" cy="${p.y}"></circle>`,
      )
      .join("");

    cCont.innerHTML = `<svg width="100%" height="220" viewBox="0 0 ${w} ${h}" style="width: 100%; height: 100%;"><g class="recharts-cartesian-grid">${grids}</g><line stroke="hsl(var(--border))" fill="none" x1="${pl}" y1="${pb}" x2="${pr}" y2="${pb}"></line><g class="font-semibold">${xLbls}</g><line stroke="hsl(var(--border))" fill="none" x1="${pl}" y1="${pt}" x2="${pl}" y2="${pb}"></line><g class="font-semibold">${yLbls}</g><path stroke="hsl(var(--primary))" stroke-width="3" fill="none" d="${dStr}"></path><g>${dots}</g></svg>`;
  }
}

window.onload = () => {
  navigate("dashboard");
};

// Navbar Scroll
document.addEventListener("DOMContentLoaded", () => {
  const nav = document.getElementById("top-nav");
  if (!nav) return;
  let scrollTimeout;
  window.addEventListener("scroll", () => {
    nav.classList.add("-translate-y-full", "opacity-0");
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      nav.classList.remove("-translate-y-full", "opacity-0");
      if (window.scrollY > 20) {
        nav.classList.add(
          "bg-background/90",
          "backdrop-blur-md",
          "border-b",
          "border-border",
          "shadow-sm",
        );
        nav.classList.remove("bg-transparent");
      } else {
        nav.classList.remove(
          "bg-background/90",
          "backdrop-blur-md",
          "border-b",
          "border-border",
          "shadow-sm",
        );
        nav.classList.add("bg-transparent");
      }
    }, 200);
  });
});
