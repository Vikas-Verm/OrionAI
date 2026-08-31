"use strict";

const { chatComplete } = require("./llmService");

const SYSTEM_PROMPT = [
  "You are OrionAI, a learning coach embedded in a knowledge-assistant app.",
  "You help users study any topic — school, exams, interviews, languages, certifications,",
  "creative skills, business, technical, and personal learning.",
  "",
  "RULES:",
  "1. Adapt your output to the topic. Do not assume coding, math, or any single subject.",
  "2. Only include subject-specific blocks (formulas, code, vocabulary, case examples) when",
  "   the topic clearly requires them. Otherwise omit those blocks completely.",
  "3. Never invent exam dates, official syllabus, user progress, or completed topics.",
  "4. Respond ONLY with a valid JSON object that matches the requested schema.",
  "5. No markdown, no code fences, no commentary outside the JSON.",
].join("\n");

function extractJson(raw) {
  if (typeof raw !== "string") throw new Error("LLM returned no string");
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  // Try the cleaned form first; fall back to greedy braces.
  const candidates = [cleaned, raw];
  for (const candidate of candidates) {
    const match = candidate.match(/\{[\s\S]*\}/);
    if (!match) continue;
    try {
      return JSON.parse(match[0]);
    } catch {
      // try the next candidate
    }
  }
  throw new Error("LLM returned non-JSON content");
}

function asStringArray(value, { max = 10 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

function asTermArray(value, max = 10) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const term = typeof entry.term === "string" ? entry.term.trim() : "";
      const meaning =
        typeof entry.meaning === "string" ? entry.meaning.trim() : "";
      if (!term || !meaning) return null;
      return { term, meaning };
    })
    .filter(Boolean)
    .slice(0, max);
}

function describeGoalContext({ goal, topic, level } = {}) {
  const lines = [];
  if (topic?.title) lines.push(`Topic: ${topic.title}`);
  if (topic?.subject) lines.push(`Subject: ${topic.subject}`);
  if (topic?.category) lines.push(`Category: ${topic.category}`);
  if (topic?.difficulty) lines.push(`Topic difficulty: ${topic.difficulty}`);
  if (goal?.title) lines.push(`Learning goal: ${goal.title}`);
  if (goal?.purpose) lines.push(`Goal purpose: ${goal.purpose}`);
  if (goal?.targetDate) {
    lines.push(
      `Target date: ${new Date(goal.targetDate).toISOString().slice(0, 10)}`
    );
  }
  if (goal?.dailyTimeMinutes) {
    lines.push(`Daily time available: ${goal.dailyTimeMinutes} minutes`);
  }
  const effectiveLevel = level || goal?.level;
  if (effectiveLevel) lines.push(`Learner level: ${effectiveLevel}`);
  if (goal?.preferredLearningStyle) {
    lines.push(`Preferred learning style: ${goal.preferredLearningStyle}`);
  }
  return lines.join("\n");
}

// ── Topic suggestions ────────────────────────────────────────────────────
async function suggestTopicsForGoal({
  goal,
  existingTitles = [],
  weakTitles = [],
  completedTitles = [],
  limit = 10,
} = {}) {
  if (!goal?.title) throw new Error("Goal title required");
  const context = describeGoalContext({ goal });
  const safeLimit = Math.max(3, Math.min(15, Math.floor(Number(limit) || 10)));

  const existingBlock = existingTitles.length
    ? [
        "Topics already saved for this goal (do NOT repeat or rephrase these):",
        ...existingTitles.slice(0, 60).map((t) => `- ${t}`),
      ].join("\n")
    : "No topics saved yet for this goal.";

  const weakBlock = weakTitles.length
    ? `Topics the learner currently finds weak: ${weakTitles
        .slice(0, 10)
        .join("; ")}.`
    : "";
  const completedBlock = completedTitles.length
    ? `Topics already completed: ${completedTitles
        .slice(0, 20)
        .join("; ")}.`
    : "";

  const userPrompt = [
    `Suggest the next ${safeLimit} study topics for this learning goal.`,
    "Adapt to the goal — they may be chapters, units, concepts, skills, or modules.",
    "Avoid anything subject-specific that the goal does not need.",
    "",
    context,
    "",
    existingBlock,
    weakBlock,
    completedBlock,
    "",
    "Return JSON with this exact shape:",
    `{
      "topics": [
        {
          "title": "string",
          "subject": "string (optional, can be empty)",
          "difficulty": "easy | medium | hard",
          "estimatedMinutes": 30,
          "reason": "one short sentence on why this topic belongs in the plan"
        }
      ]
    }`,
    "",
    "Rules:",
    "- Continue the learning sequence after the topics already saved.",
    "- Never repeat or near-repeat any topic that is already saved.",
    "- If the existing topics already cover the goal well, suggest deeper or related next topics.",
    "- If you cannot confidently suggest topics for this goal, return an empty topics array.",
    "- Do not invent official syllabus or exam content. Be generic and useful.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chatComplete(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    1600,
    0.4
  );
  const parsed = extractJson(raw);
  const topics = Array.isArray(parsed.topics) ? parsed.topics : [];

  const existingSet = new Set(
    existingTitles.map((t) => normalizeTitleKey(t)).filter(Boolean)
  );
  const seen = new Set();

  return topics
    .map((entry) => normalizeSuggestedTopic(entry))
    .filter(Boolean)
    .filter((t) => {
      const key = normalizeTitleKey(t.title);
      if (!key || existingSet.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, safeLimit);
}

function normalizeTitleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSuggestedTopic(entry) {
  if (!entry || typeof entry !== "object") return null;
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  if (!title) return null;
  const subject =
    typeof entry.subject === "string" ? entry.subject.trim() : "";
  const difficultyRaw =
    typeof entry.difficulty === "string"
      ? entry.difficulty.trim().toLowerCase()
      : "medium";
  const difficulty = ["easy", "medium", "hard"].includes(difficultyRaw)
    ? difficultyRaw
    : "medium";
  let estimatedMinutes = Number(entry.estimatedMinutes);
  if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
    estimatedMinutes = 30;
  }
  estimatedMinutes = Math.min(180, Math.round(estimatedMinutes));
  const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
  return { title, subject, difficulty, estimatedMinutes, reason };
}

// ── Lesson generation ────────────────────────────────────────────────────
async function generateLessonForTopic({
  goal,
  topic,
  notes = [],
  materials = [],
  weakMemories = [],
  preTopicReview = null,
  mode = "",
} = {}) {
  if (!topic?.title) throw new Error("Topic title required");
  const context = describeGoalContext({ goal, topic });
  const notesBlock = notes.length
    ? `Existing learner notes:\n${notes
        .slice(0, 5)
        .map((n) => `- ${n.content || n}`)
        .join("\n")}`
    : "";
  const materialsBlock = materials.length
    ? `Selected material excerpts:\n${materials
        .slice(0, 4)
        .map(
          (m, idx) =>
            `[${idx + 1}] ${m.title}: ${String(
              m.text || m.extractedText || m.contentText || ""
            ).slice(0, 1200)}`
        )
        .join("\n\n")}`
    : "";
  const weakBlock = weakMemories.length
    ? `Known weak areas:\n${weakMemories
        .slice(0, 5)
        .map((m) => `- ${m.content}`)
        .join("\n")}`
    : "";
  const reviewBlock = preTopicReview?.weakConcepts?.length
    ? `Quick prerequisite refresher needed for: ${preTopicReview.weakConcepts.join("; ")}.`
    : "";

  const userPrompt = [
    "Write a detailed, accurate, study-ready lesson on this topic. Adapt to the topic type.",
    "The lesson should teach the topic deeply enough that the learner can explain it, recognize common traps, and apply it in practice.",
    "Cover conceptual foundations, how it works, why it matters, step-by-step reasoning, and concrete applications.",
    "Only include sections that genuinely help for this topic, but do not be shallow.",
    mode ? `Requested lesson mode: ${mode}.` : "",
    "",
    context,
    notesBlock,
    materialsBlock,
    weakBlock,
    reviewBlock,
    "",
    "Return JSON with this exact shape (leave optional arrays empty if irrelevant):",
    `{
      "title": "string (lesson title)",
      "introduction": "2 to 3 short paragraphs that orient the learner and explain the big picture",
      "explanation": "6 to 10 short paragraphs of clear, accurate teaching. Include step-by-step reasoning, important distinctions, and deeper intuition. Use \\n\\n between paragraphs.",
      "whyItMatters": "2 to 4 sentences on why this topic is useful and where it fits in the larger subject",
      "practicalExercise": "a useful exercise or task with clear instructions and expected learning outcome, empty string if not useful",
      "quickRecap": "a compact recap paragraph that reinforces the core lesson",
      "keyPoints": ["8 to 12 important, non-redundant bullets", "..."],
      "examples": ["3 to 6 concrete examples or worked mini-examples", "..."],
      "commonMistakes": ["4 to 8 mistakes learners make and how to avoid them", "..."],
      "revisionNotes": ["8 to 12 short revision-card-style notes", "..."],
      "prerequisites": ["topic name or skill plus why it matters", "..."],
      "importantTerms": [{ "term": "string", "meaning": "precise but learner-friendly meaning" }],
      "practicalUseCases": ["specific real-world, exam, interview, or project use case", "..."]
    }`,
    "",
    "Rules:",
    "- Plain text inside strings — no markdown, no code fences.",
    "- Skip a section by returning an empty array for it.",
    "- Only include code / formulas / vocabulary / case examples when the topic requires them.",
    "- Use selected material excerpts only when present and relevant.",
    "- If selected material excerpts are present, prioritize them for definitions, examples, terminology, and scope.",
    "- If weak/prerequisite context is present, add a short refresher.",
    "- Prefer precise, verifiable explanations over generic motivational text.",
    "- For technical topics, include accurate terminology, edge cases, complexity/tradeoffs, and worked examples when relevant.",
    "- For non-technical topics, include definitions, context, examples, misconceptions, and practical application.",
    "- Do not invent factual claims (specific dates, official documents, named studies).",
  ].filter(Boolean).join("\n");

  const raw = await chatComplete(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    4200,
    0.35
  );
  const parsed = extractJson(raw);

  return {
    title:
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : topic.title,
    explanation:
      typeof parsed.explanation === "string" ? parsed.explanation.trim() : "",
    introduction:
      typeof parsed.introduction === "string" ? parsed.introduction.trim() : "",
    whyItMatters:
      typeof parsed.whyItMatters === "string"
        ? parsed.whyItMatters.trim()
        : "",
    practicalExercise:
      typeof parsed.practicalExercise === "string"
        ? parsed.practicalExercise.trim()
        : "",
    quickRecap:
      typeof parsed.quickRecap === "string" ? parsed.quickRecap.trim() : "",
    keyPoints: asStringArray(parsed.keyPoints, { max: 14 }),
    examples: asStringArray(parsed.examples, { max: 10 }),
    commonMistakes: asStringArray(parsed.commonMistakes, { max: 10 }),
    revisionNotes: asStringArray(parsed.revisionNotes, { max: 14 }),
    prerequisites: asStringArray(parsed.prerequisites, { max: 10 }),
    importantTerms: asTermArray(parsed.importantTerms, 16),
    practicalUseCases: asStringArray(parsed.practicalUseCases, { max: 10 }),
  };
}

// ── Practice questions ───────────────────────────────────────────────────
async function generatePracticeQuestions({
  goal,
  topic,
  count = 5,
  difficulty = "medium",
  questionType = "auto",
}) {
  if (!topic?.title) throw new Error("Topic title required");
  const context = describeGoalContext({ goal, topic });
  const safeCount = Math.max(1, Math.min(20, Math.floor(Number(count) || 5)));

  const userPrompt = [
    `Generate ${safeCount} practice questions about this topic.`,
    `Difficulty target: ${difficulty}.`,
    questionType === "auto"
      ? "Choose question types that fit the topic — concept, mcq, true_false, fill_blank, short_answer, scenario, practical, problem_solving, or coding only when relevant."
      : `Preferred question type: ${questionType}.`,
    "",
    context,
    "",
    "Return JSON with this exact shape:",
    `{
      "questions": [
        {
          "question": "string",
          "type": "concept | mcq | true_false | fill_blank | short_answer | scenario | practical | problem_solving | coding | other",
          "options": ["only for mcq / true_false"],
          "correctAnswer": "expected answer (short)",
          "explanation": "1-3 sentence explanation",
          "difficulty": "easy | medium | hard"
        }
      ]
    }`,
    "",
    "Rules:",
    "- For mcq include 3-4 options; correctAnswer must match one of them.",
    "- For true_false, options must be [\"True\", \"False\"].",
    "- For other types, leave options as an empty array.",
    "- Never include coding questions unless the topic clearly involves coding.",
    "- Do not repeat the same idea across questions.",
  ].join("\n");

  const raw = await chatComplete(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    2000,
    0.6
  );
  const parsed = extractJson(raw);
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  return questions
    .map((entry) => normalizeQuestion(entry))
    .filter(Boolean)
    .slice(0, safeCount);
}

function normalizeQuestion(entry) {
  if (!entry || typeof entry !== "object") return null;
  const question =
    typeof entry.question === "string" ? entry.question.trim() : "";
  if (!question) return null;
  const allowedTypes = [
    "concept",
    "mcq",
    "true_false",
    "fill_blank",
    "short_answer",
    "scenario",
    "practical",
    "problem_solving",
    "coding",
    "other",
  ];
  const typeRaw =
    typeof entry.type === "string" ? entry.type.trim().toLowerCase() : "concept";
  const type = allowedTypes.includes(typeRaw) ? typeRaw : "concept";

  let options = Array.isArray(entry.options)
    ? entry.options
        .map((opt) => (typeof opt === "string" ? opt.trim() : ""))
        .filter(Boolean)
        .slice(0, 6)
    : [];
  if (type === "true_false") options = ["True", "False"];
  if (type !== "mcq" && type !== "true_false") options = [];

  const correctAnswer =
    typeof entry.correctAnswer === "string"
      ? entry.correctAnswer.trim()
      : "";
  const explanation =
    typeof entry.explanation === "string" ? entry.explanation.trim() : "";
  const difficultyRaw =
    typeof entry.difficulty === "string"
      ? entry.difficulty.trim().toLowerCase()
      : "medium";
  const difficulty = ["easy", "medium", "hard"].includes(difficultyRaw)
    ? difficultyRaw
    : "medium";

  return {
    question,
    type,
    options,
    correctAnswer,
    explanation,
    difficulty,
  };
}

// ── Flashcards ───────────────────────────────────────────────────────────
async function generateFlashcards({ goal, topic, lesson, count = 8 }) {
  if (!topic?.title) throw new Error("Topic title required");
  const context = describeGoalContext({ goal, topic });
  const lessonSnippet = lesson
    ? [
        lesson.explanation ? `Explanation: ${lesson.explanation}` : "",
        Array.isArray(lesson.keyPoints) && lesson.keyPoints.length
          ? `Key points: ${lesson.keyPoints.join("; ")}`
          : "",
        Array.isArray(lesson.revisionNotes) && lesson.revisionNotes.length
          ? `Revision notes: ${lesson.revisionNotes.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const safeCount = Math.max(3, Math.min(20, Math.floor(Number(count) || 8)));

  const userPrompt = [
    `Generate ${safeCount} short flashcards for this topic.`,
    "Cards should be quick to review: short question on the front, short answer on the back.",
    "Cover the most important ideas, definitions, examples, or steps.",
    "",
    context,
    lessonSnippet ? `\nLesson context:\n${lessonSnippet}` : "",
    "",
    "Return JSON with this exact shape:",
    `{
      "cards": [
        {
          "front": "short prompt",
          "back": "short answer (1-2 sentences max)",
          "difficulty": "easy | medium | hard"
        }
      ]
    }`,
    "",
    "Rules:",
    "- Front and back must each be under 200 characters.",
    "- No code or formulas unless the topic needs them.",
    "- Each card should stand on its own.",
  ].join("\n");

  const raw = await chatComplete(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    1800,
    0.5
  );
  const parsed = extractJson(raw);
  const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
  return cards
    .map((entry) => normalizeFlashcard(entry))
    .filter(Boolean)
    .slice(0, safeCount);
}

function normalizeFlashcard(entry) {
  if (!entry || typeof entry !== "object") return null;
  const front = typeof entry.front === "string" ? entry.front.trim() : "";
  const back = typeof entry.back === "string" ? entry.back.trim() : "";
  if (!front || !back) return null;
  const difficultyRaw =
    typeof entry.difficulty === "string"
      ? entry.difficulty.trim().toLowerCase()
      : "medium";
  const difficulty = ["easy", "medium", "hard"].includes(difficultyRaw)
    ? difficultyRaw
    : "medium";
  return { front: front.slice(0, 240), back: back.slice(0, 320), difficulty };
}

// ── Doubt chat reply ─────────────────────────────────────────────────────
// Returns a structured object so the frontend can render badge / explanation /
// follow-up cleanly. Falls back to a plain-string explanation if JSON parsing
// fails so the UI never breaks.
async function answerTopicDoubt({
  goal,
  topic,
  lesson,
  history = [],
  question,
  materialContext = [],
  allowGeneralKnowledge = true,
} = {}) {
  if (!question) throw new Error("question required");
  if (!topic?.title) throw new Error("topic required");
  const context = describeGoalContext({ goal, topic });
  const lessonSnippet = lesson
    ? [
        lesson.explanation
          ? `Lesson explanation: ${String(lesson.explanation).slice(0, 1200)}`
          : "",
        Array.isArray(lesson.keyPoints) && lesson.keyPoints.length
          ? `Key points: ${lesson.keyPoints.slice(0, 8).join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const recent = Array.isArray(history) ? history.slice(-6) : [];
  const materialBlock =
    Array.isArray(materialContext) && materialContext.length
      ? [
          "Authorized selected material excerpts:",
          ...materialContext.slice(0, 6).map((m, idx) =>
            `[${idx + 1}] ${m.title || "Material"}: ${String(m.text || "").slice(0, 1400)}`
          ),
        ].join("\n\n")
      : "";
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: [
        "You are answering a learner's doubt about a specific topic.",
        context,
        lessonSnippet,
        materialBlock,
        "",
        "Return JSON with this exact shape:",
        `{
  "answerType": "OrionAI explanation",
  "explanation": "your full answer in plain prose. Use \\n\\n between paragraphs.",
  "usedAttachedMaterial": false,
  "followupSuggestion": "one short follow-up the learner might ask next, or empty string"
}`,
        "",
        "Rules:",
        "- Be concise, adaptive to the topic, and beginner-friendly when needed.",
        "- If the question is off-topic, gently steer back to the topic.",
        "- Set usedAttachedMaterial to true only if you used the authorized selected material excerpts.",
        "- If selected material excerpts are present but do not contain the answer, say that clearly.",
        allowGeneralKnowledge
          ? "- You may add a clearly labeled general explanation after material-grounded limitations."
          : "- Do not use general knowledge beyond the selected material excerpts.",
        "- Set answerType to \"OrionAI explanation\" by default; use \"Based on attached material\" only when usedAttachedMaterial is true.",
        "- Plain text inside strings only — no markdown headers, no code fences.",
        "- Keep followupSuggestion to one short sentence, or set it to \"\".",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  for (const entry of recent) {
    const role = entry?.role === "assistant" ? "assistant" : "user";
    const content = typeof entry?.content === "string" ? entry.content : "";
    if (content) messages.push({ role, content });
  }
  messages.push({ role: "user", content: String(question).slice(0, 2000) });

  const raw = await chatComplete(messages, 1000, 0.5);
  return normalizeDoubtReply(raw, { hasLesson: materialContext.length > 0 });
}

function normalizeDoubtReply(raw, { hasLesson = false } = {}) {
  const fallbackAnswerType = "OrionAI explanation";
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      answerType: fallbackAnswerType,
      explanation: "",
      usedAttachedMaterial: false,
      followupSuggestion: "",
    };
  }
  let parsed = null;
  try {
    parsed = extractJson(raw);
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === "object") {
    const explanation =
      typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    const followupSuggestion =
      typeof parsed.followupSuggestion === "string"
        ? parsed.followupSuggestion.trim()
        : "";
    const usedAttachedMaterial = parsed.usedAttachedMaterial === true;
    const answerTypeRaw =
      typeof parsed.answerType === "string" ? parsed.answerType.trim() : "";
    const answerType = answerTypeRaw || fallbackAnswerType;
    return {
      answerType,
      explanation: explanation || raw.trim(),
      usedAttachedMaterial: usedAttachedMaterial && hasLesson,
      followupSuggestion,
    };
  }
  // Plain text fallback — strip any stray JSON braces.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return {
    answerType: fallbackAnswerType,
    explanation: cleaned,
    usedAttachedMaterial: false,
    followupSuggestion: "",
  };
}

module.exports = {
  suggestTopicsForGoal,
  generateLessonForTopic,
  generatePracticeQuestions,
  generateFlashcards,
  answerTopicDoubt,
  normalizeTitleKey,
  // exported for tests
  _internal: {
    extractJson,
    normalizeSuggestedTopic,
    normalizeQuestion,
    normalizeFlashcard,
    normalizeTitleKey,
    normalizeDoubtReply,
  },
};
