import type { ActionCard, ActionCardInput } from "./types.js";

const MAX_ACTION_CARDS = 6;

type CardContext = {
  title: string;
  channel: string;
  currentTimeLabel: string;
  chapterHint: string;
  appName: string;
  arxivIdHint: string;
};

type PromptDefinition = {
  id: string;
  title: string;
  description: string;
  prompt: (context: CardContext) => string;
};

const ACTION_CARD_LIBRARY: Record<string, ActionCard> = {
  "summarize-video": workflowCard(
    "summarize-video",
    "Summarize Video",
    "Create a concise summary for the whole video.",
  ),
  "summarize-current-timestamp": workflowCard(
    "summarize-current-timestamp",
    "Summarize This Moment",
    "Explain the currently visible or playing moment.",
  ),
  "draft-blog-post": workflowCard(
    "draft-blog-post",
    "Draft Blog Post",
    "Turn the current page or video into a publishable draft.",
  ),
  "summarize-page": workflowCard(
    "summarize-page",
    "Summarize Page",
    "Summarize the current page with attached context.",
  ),
};

const PROMPTS: Record<string, PromptDefinition[]> = {
  youtube: [
    promptDefinition(
      "youtube-summary-question",
      "Summarize video",
      "Extract the video's main argument and takeaways.",
      ({ title, channel }) =>
        `Summarize the current YouTube video "${title}"${channel ? ` by ${channel}` : ""}. Focus on the main claim, evidence, conclusions, and timestamped moments.`,
    ),
    promptDefinition(
      "youtube-current-moment-question",
      "Explain this moment",
      "Explain the currently visible or playing moment.",
      ({ title, currentTimeLabel }) =>
        `Explain what is happening around ${currentTimeLabel} in the YouTube video "${title}". Include the surrounding context and what I should pay attention to now.`,
    ),
    promptDefinition(
      "youtube-chapter-notes-question",
      "Chapter notes",
      "Turn the video flow into structured notes.",
      ({ title, chapterHint }) =>
        `Create chapter-by-chapter notes for the YouTube video "${title}". For each chapter, separate key ideas, quotable lines, and follow-up actions.\n\nReference chapters:\n${chapterHint}`,
    ),
    promptDefinition(
      "youtube-blog-draft-question",
      "Draft post",
      "Convert the video into a blog or thread draft.",
      ({ title }) =>
        `Write a blog draft based on the YouTube video "${title}". Include 3 title options, an intro, section outline, key takeaways, and a closing CTA.`,
    ),
  ],
  gmail: [
    promptDefinition(
      "gmail-reply-draft",
      "Draft reply",
      "Write a practical reply for the current email.",
      ({ title }) =>
        `Draft a reply to the current Gmail thread "${title}". Acknowledge the request, answer what can be answered, ask any necessary follow-up questions, and keep it ready to send.`,
    ),
    promptDefinition(
      "gmail-thread-summary",
      "Summarize thread",
      "Extract decisions and open questions.",
      () => "Summarize the current Gmail thread into key points, decisions, open questions, and my next actions.",
    ),
    promptDefinition(
      "gmail-action-items",
      "Extract tasks",
      "Find owners, deadlines, and follow-ups.",
      () =>
        "Extract action items, owners, deadlines, and questions from the current email. Mark uncertain items as needs confirmation.",
    ),
    promptDefinition(
      "gmail-polish-reply",
      "Polish reply",
      "Improve a response using this email context.",
      () =>
        "Using the current email context, improve my reply so it is clear, professional, and concise. Offer a short version and a warmer version.",
    ),
  ],
  "korean-mail": [
    promptDefinition(
      "korean-mail-reply-draft",
      "Draft reply",
      "Write a reply for Naver, Daum, or work email.",
      ({ title }) => `Draft a reply to the current email "${title}". Keep it practical, polite, and ready to send.`,
    ),
    promptDefinition(
      "korean-mail-polite-rewrite",
      "Polish politely",
      "Improve the reply in a business-appropriate tone.",
      () =>
        "Rewrite my reply in a natural, polite business email tone that matches the thread language. Provide a concise version and a more formal version.",
    ),
    promptDefinition(
      "korean-mail-action-items",
      "Extract tasks",
      "Find requests, deadlines, and owners.",
      () =>
        "Extract requests, deadlines, owners, and follow-up questions from this email. Mark uncertain items as needs confirmation.",
    ),
    promptDefinition(
      "korean-mail-followup",
      "Follow-up email",
      "Draft a reminder, confirmation, or thank-you email.",
      () => "Draft a follow-up email based on the current thread. Choose the right intent: reminder, confirmation, or thanks.",
    ),
  ],
  "google-docs": [
    promptDefinition(
      "docs-summary",
      "Summarize doc",
      "Extract argument, risks, and actions.",
      ({ title }) =>
        `Summarize the current Google Docs document "${title}" with main claims, evidence, decisions, risks, and next actions.`,
    ),
    promptDefinition(
      "docs-rewrite",
      "Improve writing",
      "Make the document clearer and stronger.",
      () =>
        "Rewrite the current document or selection for clarity, structure, and persuasive tone. Briefly explain the changes.",
    ),
    promptDefinition(
      "docs-exec-brief",
      "Executive brief",
      "Turn the doc into a one-page brief.",
      () => "Convert the current document into a one-page executive brief with background, decisions, risks, and asks.",
    ),
  ],
  "google-sheets": [
    promptDefinition(
      "sheets-insights",
      "Find insights",
      "Identify trends, outliers, and questions.",
      ({ title }) => `Analyze the visible Google Sheets data in "${title}" and identify trends, outliers, and questions to verify.`,
    ),
    promptDefinition(
      "sheets-formulas",
      "Suggest formulas",
      "Recommend formulas and cleanup steps.",
      () => "Suggest formulas, pivots, filters, or cleanup steps for the current spreadsheet task with concrete examples.",
    ),
    promptDefinition(
      "sheets-summary",
      "Report summary",
      "Turn sheet data into a business update.",
      () => "Turn the current sheet into a business update with key metrics, changes, causes, and decision points.",
    ),
  ],
  "google-slides": [
    promptDefinition(
      "slides-critique",
      "Review deck",
      "Improve structure, message, and visuals.",
      ({ title }) => `Review the current Google Slides deck "${title}" for narrative flow, slide structure, and visual improvements.`,
    ),
    promptDefinition(
      "slides-speaker-notes",
      "Speaker notes",
      "Draft notes for the current deck.",
      () => "Write speaker notes for the current deck with talking points and transitions for each slide.",
    ),
    promptDefinition(
      "slides-exec-summary",
      "Decision summary",
      "Turn the deck into an executive summary.",
      () => "Convert the current deck into an executive summary with conclusion, evidence, asks, and risks.",
    ),
  ],
  "google-calendar": [
    promptDefinition(
      "calendar-brief",
      "Meeting brief",
      "Prepare for the current calendar event.",
      () =>
        "Prepare a meeting brief from the current Google Calendar event with purpose, questions, materials to review, and likely decisions.",
    ),
    promptDefinition(
      "calendar-agenda",
      "Draft agenda",
      "Create agenda and time allocation.",
      () => "Draft an agenda and time allocation for the current meeting. Include pre-read or prep items for attendees.",
    ),
    promptDefinition(
      "calendar-followup",
      "Follow-up email",
      "Write a post-meeting follow-up.",
      () => "Draft a follow-up email for this meeting with decisions, action items, owners, and deadlines.",
    ),
  ],
  "google-drive": [
    promptDefinition(
      "google-drive-organize",
      "Organize files",
      "Turn the current Drive view into a useful structure.",
      ({ title }) => `Review the current Google Drive view "${title}" and suggest key files, missing docs, folder structure, and sharing checks.`,
    ),
    promptDefinition(
      "google-drive-brief",
      "Brief materials",
      "Summarize visible files into a project brief.",
      () => "Summarize the visible Drive materials into a project brief with document purpose, priority files, and next actions.",
    ),
    promptDefinition(
      "google-drive-sharing",
      "Sharing check",
      "Find sharing and permission risks.",
      () => "Identify sharing, permission, and cleanup risks in the current Drive view.",
    ),
  ],
  "google-meet": [
    promptDefinition(
      "google-meet-brief",
      "Meeting prep",
      "Prepare agenda, questions, and decisions.",
      ({ title }) => `Prepare for the current Google Meet "${title}" with purpose, questions, decision points, and follow-up actions.`,
    ),
    promptDefinition(
      "google-meet-followup",
      "Meeting follow-up",
      "Draft decisions and next actions.",
      () => "Summarize decisions, action items, owners, deadlines, and draft a follow-up email from this meeting context.",
    ),
    promptDefinition(
      "google-meet-questions",
      "Questions to ask",
      "Suggest timely meeting questions.",
      () => "Suggest the key questions and risks to raise based on the current meeting context.",
    ),
  ],
  "team-chat": [
    promptDefinition(
      "team-chat-summary",
      "Summarize chat",
      "Extract decisions, tasks, owners, and deadlines.",
      ({ title, appName }) =>
        `Summarize the current ${appName} conversation "${title}" into decisions, discussion points, tasks, owners, and deadlines.`,
    ),
    promptDefinition(
      "team-chat-reply",
      "Draft reply",
      "Write a contextual chat response.",
      ({ appName }) => `Draft a ${appName} reply that clearly states progress, blockers, request, and next action.`,
    ),
    promptDefinition(
      "team-chat-catchup",
      "Catch up",
      "Find important missed updates.",
      ({ appName }) => `Catch me up on the current ${appName} channel with important updates, decisions, and people to mention.`,
    ),
  ],
  teams: [
    promptDefinition(
      "teams-meeting-brief",
      "Teams brief",
      "Summarize meeting or channel context.",
      ({ title }) => `Summarize the current Microsoft Teams view "${title}" with decisions, tasks, owners, and next actions.`,
    ),
    promptDefinition(
      "teams-reply",
      "Draft Teams reply",
      "Write a concise channel or thread response.",
      () => "Draft a concise Teams response that includes the necessary work context.",
    ),
    promptDefinition(
      "teams-followup",
      "Follow-up actions",
      "Extract owners, deadlines, and questions.",
      () => "Extract follow-up actions, owners, deadlines, and open questions from the current Teams view.",
    ),
  ],
  github: [
    promptDefinition(
      "github-pr-summary",
      "Summarize PR/issue",
      "Extract changes, risks, and next actions.",
      ({ title }) => `Summarize the current GitHub page "${title}" into changes, discussion points, risks, and next actions.`,
    ),
    promptDefinition(
      "github-review-risks",
      "Review risks",
      "Find bugs, missing tests, and security concerns.",
      () => "Identify likely bugs, missing tests, security risks, and compatibility concerns in the current GitHub PR or issue.",
    ),
    promptDefinition(
      "github-draft-comment",
      "Draft comment",
      "Write a constructive review or response.",
      () => "Draft a constructive GitHub review comment or response based on the current thread.",
    ),
  ],
  notion: [
    promptDefinition(
      "notion-summary",
      "Summarize page",
      "Focus on decisions and tasks.",
      () => "Summarize the current Notion page into decisions, discussion points, tasks, and owners.",
    ),
    promptDefinition(
      "notion-plan",
      "Action plan",
      "Turn the page into executable tasks.",
      () => "Convert the current Notion page into an action plan with priorities, owners, and suggested deadlines.",
    ),
    promptDefinition(
      "notion-rewrite",
      "Rewrite page",
      "Make the page clearer for team sharing.",
      () => "Rewrite the current Notion page so it is clearer, more structured, and ready to share with a team.",
    ),
  ],
  "korean-team-chat": [
    promptDefinition(
      "korean-team-chat-reply",
      "Draft reply",
      "Write a work messenger reply.",
      ({ title, appName }) => `Draft a concise, polite reply for the current ${appName} conversation "${title}".`,
    ),
    promptDefinition(
      "korean-team-chat-summary",
      "Summarize chat",
      "Extract decisions and actions.",
      ({ appName }) =>
        `Summarize the current ${appName} conversation into decisions, tasks, owners, deadlines, and open questions.`,
    ),
    promptDefinition(
      "korean-team-chat-report",
      "Status report",
      "Create a team or manager update.",
      ({ appName }) => `Turn the current ${appName} conversation into a status report for a manager or team.`,
    ),
  ],
  "project-task": [
    promptDefinition(
      "project-task-summary",
      "Task summary",
      "Summarize status, blockers, and next actions.",
      ({ title, appName }) =>
        `Summarize the current ${appName} task "${title}" by goal, status, blockers, owners, deadlines, and next actions.`,
    ),
    promptDefinition(
      "project-task-comment",
      "Draft update",
      "Write a practical task comment.",
      ({ appName }) =>
        `Draft a ${appName} task update that clearly states progress, required decisions, and requests.`,
    ),
    promptDefinition(
      "project-task-plan",
      "Action plan",
      "Break work into subtasks and priorities.",
      ({ appName }) => `Break the current ${appName} work into actionable subtasks with priorities, dependencies, and risks.`,
    ),
  ],
  jira: [
    promptDefinition(
      "jira-issue-summary",
      "Issue summary",
      "Summarize requirements, status, and risks.",
      ({ title }) => `Summarize the current Jira issue "${title}" by requirements, current status, blockers, risks, and next actions.`,
    ),
    promptDefinition(
      "jira-acceptance-criteria",
      "Acceptance criteria",
      "Suggest done criteria and test cases.",
      () => "Write acceptance criteria, test cases, and edge cases for the current Jira issue.",
    ),
    promptDefinition(
      "jira-comment",
      "Draft Jira comment",
      "Write a practical issue update.",
      () => "Draft a Jira update comment that clearly shows progress, blockers, and decisions needed.",
    ),
  ],
  trello: [
    promptDefinition(
      "kanban-card-summary",
      "Card summary",
      "Summarize checklist and next actions.",
      ({ title }) => `Summarize the current Trello card or board "${title}" by goal, checklist, owners, deadlines, and next actions.`,
    ),
    promptDefinition(
      "kanban-card-comment",
      "Draft card comment",
      "Write a status update comment.",
      () => "Draft a progress comment for this Trello card, separating done, in progress, and blocked items.",
    ),
    promptDefinition(
      "kanban-board-plan",
      "Board plan",
      "Suggest priorities and flow changes.",
      () => "Suggest priorities, bottlenecks, and which cards should move next based on the current Trello board or card.",
    ),
  ],
  notes: [
    promptDefinition(
      "notes-summarize",
      "Summarize note",
      "Organize notes into points and actions.",
      ({ title, appName }) => `Summarize the current ${appName} note "${title}" into key points, decisions, tasks, and later checks.`,
    ),
    promptDefinition(
      "notes-rewrite",
      "Restructure note",
      "Turn the note into a readable document.",
      ({ appName }) => `Rewrite the current ${appName} note as a structured document with headings, sections, and checklists.`,
    ),
    promptDefinition(
      "notes-research-brief",
      "Research brief",
      "Turn research notes into a brief.",
      ({ appName }) =>
        `Turn the current ${appName} note into a research brief with claims, evidence, sources to verify, and next questions.`,
    ),
  ],
  "quick-note": [
    promptDefinition(
      "quick-note-organize",
      "Organize note",
      "Classify short notes into tasks and ideas.",
      ({ title, appName }) => `Organize the current ${appName} note "${title}" into tasks, ideas, references, and later checks.`,
    ),
    promptDefinition(
      "quick-note-action",
      "Make checklist",
      "Turn notes into actionable steps.",
      ({ appName }) => `Turn the current ${appName} note into an actionable checklist with priorities and today's tasks.`,
    ),
    promptDefinition(
      "quick-note-expand",
      "Expand idea",
      "Develop the note into a draft or plan.",
      ({ appName }) => `Expand the current ${appName} note into a more concrete draft or plan.`,
    ),
  ],
  "korean-writing": [
    promptDefinition(
      "korean-writing-draft",
      "Draft post",
      "Structure a blog or community post.",
      ({ title }) => `Draft a post from "${title}" with title ideas, intro, outline, conclusion, and CTA.`,
    ),
    promptDefinition(
      "korean-writing-polish",
      "Polish writing",
      "Make writing clearer and smoother.",
      () => "Polish the current writing so it reads naturally, clearly, and professionally in the user's language.",
    ),
    promptDefinition(
      "korean-writing-seo",
      "SEO improve",
      "Suggest titles, headings, and keywords.",
      () => "Improve this post for Naver and Google search with title options, headings, keywords, meta description, and tags.",
    ),
    promptDefinition(
      "korean-writing-comment-reply",
      "Reply to comment",
      "Draft a community or blog response.",
      () => "Draft a response to the current post or comment with empathy, clear answer, and next guidance.",
    ),
  ],
  "korean-work": [
    promptDefinition(
      "korean-work-task-summary",
      "Work summary",
      "Summarize decisions, tasks, owners, and deadlines.",
      () => "Summarize the current work page into decisions, issues, action items, owners, and deadlines.",
    ),
    promptDefinition(
      "korean-work-comment",
      "Draft work comment",
      "Write a clear collaboration-tool comment.",
      () => "Draft a work comment that clearly states progress, issue, request, and next action.",
    ),
    promptDefinition(
      "korean-work-meeting-note",
      "Meeting notes",
      "Convert discussion into notes and action items.",
      () => "Turn the current page into meeting notes with decisions, action items, owners, and deadlines.",
    ),
    promptDefinition(
      "korean-work-status-report",
      "Status report",
      "Write a team or manager update.",
      () => "Write a status update with completed items, in-progress items, blockers, and help needed.",
    ),
  ],
  "korean-community": [
    promptDefinition(
      "korean-community-summary",
      "Summarize thread",
      "Summarize post and comment flow.",
      () => "Summarize the current community post and comments into claims, reactions, disputes, and useful information.",
    ),
    promptDefinition(
      "korean-community-reply",
      "Draft comment",
      "Write a natural community reply.",
      () => "Draft a reply that fits the current community context and avoids escalating conflict.",
    ),
    promptDefinition(
      "korean-community-factcheck",
      "Fact-check points",
      "Identify claims to verify.",
      () => "Identify claims that need verification, weak evidence, and keywords to research next.",
    ),
  ],
  "korean-hiring": [
    promptDefinition(
      "korean-hiring-fit",
      "Job fit analysis",
      "Match requirements to strengths.",
      () =>
        "Analyze the current job posting for requirements, preferred qualifications, hidden expectations, and experiences to emphasize.",
    ),
    promptDefinition(
      "korean-hiring-cover-letter",
      "Cover letter draft",
      "Write a tailored application draft.",
      () => "Draft a tailored cover letter or application response based on this job posting.",
    ),
    promptDefinition(
      "korean-hiring-interview",
      "Interview prep",
      "Create questions and answer angles.",
      () => "Create 10 interview questions and answer angles from this job posting, grouped by technical, collaboration, and impact topics.",
    ),
    promptDefinition(
      "korean-hiring-redflags",
      "Posting risks",
      "Find unclear conditions and questions.",
      () => "Find unclear conditions, risks, and questions to ask during interviews from this job posting.",
    ),
  ],
  figma: [
    promptDefinition(
      "figma-ui-review",
      "UI review",
      "Check hierarchy, spacing, and accessibility.",
      () =>
        "Review the current Figma screen for visual hierarchy, information architecture, spacing, accessibility, and responsive behavior.",
    ),
    promptDefinition(
      "figma-copy",
      "Improve UX copy",
      "Suggest clearer labels and empty states.",
      () => "Improve the buttons, labels, empty states, and onboarding copy in the current Figma design.",
    ),
    promptDefinition(
      "figma-handoff",
      "Dev handoff",
      "Create implementation notes.",
      () =>
        "Turn the current Figma screen into developer handoff notes covering components, states, responsive behavior, and accessibility.",
    ),
  ],
  shopping: [
    promptDefinition(
      "shopping-compare",
      "Compare product",
      "Compare price, pros, cons, and risks.",
      () => "Compare the current product page by price, specs, pros, cons, review risks, and alternatives.",
    ),
    promptDefinition(
      "shopping-review-risk",
      "Review risks",
      "Find repeated praise and complaints.",
      () => "Analyze the product description and reviews for repeated strengths, complaints, hype, and pre-purchase checks.",
    ),
    promptDefinition(
      "shopping-decision",
      "Buying decision",
      "Decide whether this is worth buying.",
      () => "Help me decide whether to buy this product. Separate buy, wait, and look-for-alternatives scenarios.",
    ),
  ],
  travel: [
    promptDefinition(
      "travel-plan",
      "Plan trip",
      "Use this travel page to plan next steps.",
      () => "Use the current travel page to plan itinerary, routing, cost risks, and pre-booking checks.",
    ),
    promptDefinition(
      "travel-compare",
      "Compare options",
      "Compare flights, hotels, or places.",
      () => "Compare the travel options on this page by price, time, location, cancellation policy, and practical risks.",
    ),
    promptDefinition(
      "travel-checklist",
      "Booking checklist",
      "List what to verify before booking.",
      () => "Create a checklist of what to verify before booking from the current travel page.",
    ),
  ],
  news: [
    promptDefinition(
      "news-article-summary",
      "Summarize article",
      "Extract the article's core facts and implications.",
      ({ title }) =>
        `Summarize the current news article "${title}" by core event, background, stakeholders, evidence or quotes, implications, and claims that need verification.`,
    ),
    promptDefinition(
      "news-facts-claims",
      "Separate facts and claims",
      "Distinguish verified facts, interpretation, and uncertainty.",
      ({ title }) =>
        `Separate verified facts, reporter or source interpretation, assumptions, and claims that need verification in the current news article "${title}". Suggest what evidence would verify uncertain points.`,
    ),
    workflowDefinition("news-infographic", "Create infographic", "Turn the article into a visual brief."),
    promptDefinition(
      "news-timeline",
      "Extract timeline",
      "Create a timeline and follow-up watchlist.",
      ({ title }) => `Turn the current news article "${title}" into a chronological timeline and list the follow-up issues to watch next.`,
    ),
  ],
  arxiv: [
    promptDefinition(
      "arxiv-paper-summary",
      "Summarize paper",
      "Extract problem, method, results, and caveats.",
      ({ title, arxivIdHint }) =>
        `Summarize the current arXiv paper "${title}"${arxivIdHint} for Q&A. Separate research problem, core idea, method, experiments and results, limitations, and sections I should read.`,
    ),
    promptDefinition(
      "arxiv-method-review",
      "Review method",
      "Analyze assumptions, experiments, and risks.",
      ({ title }) =>
        `Review the methodology of the current arXiv paper "${title}". Separate what it solves, assumptions, experiment design, baselines, reproducibility risks, and weak evidence.`,
    ),
    promptDefinition(
      "arxiv-related-work",
      "Related work",
      "Find positioning and follow-up reading.",
      ({ title }) =>
        `Explain how the current arXiv paper "${title}" differs from prior work and suggest follow-up paper types and search keywords.`,
    ),
    promptDefinition(
      "arxiv-implementation-plan",
      "Implementation plan",
      "Turn the paper into reproducible steps.",
      ({ title }) =>
        `Create an implementation and reproduction checklist for the arXiv paper "${title}" covering data, model setup, training, evaluation, and validation.`,
    ),
  ],
  "pdf-document": [
    promptDefinition(
      "pdf-document-summary",
      "Summarize PDF",
      "Summarize structure and key content.",
      ({ title }) =>
        `Summarize the current PDF "${title}" by document structure, key claims or information, important tables or numbers, conclusion, and questions to verify.`,
    ),
    promptDefinition(
      "pdf-key-points",
      "Extract key points",
      "Find important lines, numbers, and actions.",
      ({ title }) =>
        `Extract important lines, numbers, definitions, and action items from the current PDF "${title}". Include page or section clues when available.`,
    ),
    promptDefinition(
      "pdf-questions",
      "Ask PDF questions",
      "Generate grounded Q&A from the document.",
      ({ title }) =>
        `Create 10 comprehension questions and answers from the current PDF "${title}". Do not infer anything that is not grounded in the document.`,
    ),
    promptDefinition(
      "pdf-brief",
      "Work brief",
      "Turn the PDF into a business brief.",
      ({ title }) => `Turn the current PDF "${title}" into a work brief with background, key points, risks, decision points, and next actions.`,
    ),
  ],
  research: [
    promptDefinition(
      "research-summary",
      "Summarize key points",
      "Extract claims, evidence, and caveats.",
      ({ title }) => `Summarize "${title}" with main claims, evidence, counterpoints, and reliability checks.`,
    ),
    promptDefinition(
      "research-related",
      "Find related info",
      "Suggest follow-up questions and sources.",
      () => "Suggest follow-up questions, source types, and search keywords based on the current page.",
    ),
    promptDefinition(
      "research-brief",
      "Research brief",
      "Turn the page into a work-ready brief.",
      () => "Turn the current page into a research brief with summary, implications, risks, and next verification steps.",
    ),
  ],
};

const PLATFORM_PROMPT_KEYS: Record<string, string> = {
  youtube: "youtube",
  gmail: "gmail",
  "korean-mail": "korean-mail",
  "google-docs": "google-docs",
  "google-sheets": "google-sheets",
  "google-slides": "google-slides",
  "google-calendar": "google-calendar",
  "google-drive": "google-drive",
  "google-meet": "google-meet",
  "google-chat": "team-chat",
  slack: "team-chat",
  teams: "teams",
  github: "github",
  notion: "notion",
  kakaowork: "korean-team-chat",
  "naver-works": "korean-team-chat",
  flow: "project-task",
  asana: "project-task",
  clickup: "project-task",
  jira: "jira",
  trello: "trello",
  evernote: "notes",
  onenote: "notes",
  "google-keep": "quick-note",
  "samsung-notes": "quick-note",
  "korean-writing": "korean-writing",
  "korean-work": "korean-work",
  "korean-community": "korean-community",
  "korean-hiring": "korean-hiring",
  figma: "figma",
  shopping: "shopping",
  travel: "travel",
  news: "news",
  arxiv: "arxiv",
  "pdf-document": "pdf-document",
  research: "research",
};

export function inferActionCards(input: ActionCardInput): ActionCard[] {
  const cards: ActionCard[] = [];
  const seen = new Set<string>();

  const pushCard = (card: ActionCard) => {
    if (seen.has(card.id)) {
      return;
    }
    seen.add(card.id);
    cards.push(card);
  };

  if (input.readStrategy === "adapter") {
    for (const card of createAdapterSuggestedQuestions(input)) {
      pushCard(card);
    }
    for (const action of input.adapterActions) {
      const card = ACTION_CARD_LIBRARY[action];
      if (card) {
        pushCard(card);
      }
    }
  } else {
    pushCard(ACTION_CARD_LIBRARY["summarize-page"]!);
  }

  return cards.slice(0, MAX_ACTION_CARDS);
}

function createAdapterSuggestedQuestions(input: ActionCardInput): ActionCard[] {
  const platform = getString(input.adapterPayload?.platform);
  const promptKey = PLATFORM_PROMPT_KEYS[platform];
  const definitions = promptKey ? PROMPTS[promptKey] : undefined;
  if (!definitions) {
    return [];
  }

  const context = createContext(input.adapterPayload ?? {}, platform);
  return applyPromptOutputLanguage(definitions.map((definition) => cardFromDefinition(definition, context)), input.locale);
}

function createContext(payload: Record<string, unknown>, platform: string): CardContext {
  const title = getString(payload.title) || fallbackTitleForPlatform(platform);
  const chapterTitles = getStringArray(payload.chapterTitles).slice(0, 5);
  const arxivId = getString(payload.arxivId);
  return {
    title,
    channel: getString(payload.channel),
    currentTimeLabel: formatTimestamp(getFiniteNumber(payload.currentTimeSeconds) ?? 0),
    chapterHint: chapterTitles.length
      ? chapterTitles.map((chapter) => `- ${chapter}`).join("\n")
      : "If chapter metadata is unavailable, segment the video by topic flow.",
    appName: appNameForPlatform(platform),
    arxivIdHint: arxivId ? ` (${arxivId})` : "",
  };
}

function cardFromDefinition(definition: PromptDefinition, context: CardContext): ActionCard {
  if (definition.id === "news-infographic") {
    return workflowCard(definition.id, definition.title, definition.description);
  }
  return promptCard(definition.id, definition.title, definition.description, definition.prompt(context));
}

function promptDefinition(
  id: string,
  title: string,
  description: string,
  prompt: (context: CardContext) => string,
): PromptDefinition {
  return { id, title, description, prompt };
}

function workflowDefinition(id: string, title: string, description: string): PromptDefinition {
  return { id, title, description, prompt: () => "" };
}

function promptCard(id: string, title: string, description: string, prompt: string): ActionCard {
  return { id, title, description, kind: "prompt", prompt };
}

function workflowCard(id: string, title: string, description: string): ActionCard {
  return { id, title, description, kind: "workflow" };
}

function applyPromptOutputLanguage(cards: ActionCard[], locale: string | undefined): ActionCard[] {
  const outputLanguage = getOutputLanguageName(locale);
  if (!outputLanguage) {
    return cards;
  }
  return cards.map((card) =>
    card.kind === "prompt" && card.prompt
      ? {
          ...card,
          prompt: appendOutputLanguageInstruction(card.prompt, outputLanguage),
        }
      : card,
  );
}

function appendOutputLanguageInstruction(prompt: string, outputLanguage: string): string {
  const instruction = `Answer in ${outputLanguage}.`;
  return prompt.includes(instruction) ? prompt : `${prompt}\n\n${instruction}`;
}

function getOutputLanguageName(locale: string | undefined): string {
  const normalized = normalizeLocaleTag(locale);
  if (!normalized) {
    return "";
  }
  return `the user's selected UI language (${normalized})`;
}

function fallbackTitleForPlatform(platform: string): string {
  switch (platform) {
    case "youtube":
      return "this video";
    case "gmail":
    case "korean-mail":
      return "this email";
    case "google-docs":
      return "this document";
    case "google-sheets":
      return "this spreadsheet";
    case "google-slides":
      return "this deck";
    case "news":
      return "this article";
    case "arxiv":
      return "this paper";
    case "pdf-document":
      return "this PDF";
    case "korean-writing":
      return "this post";
    default:
      return "this page";
  }
}

function appNameForPlatform(platform: string): string {
  switch (platform) {
    case "google-chat":
      return "Google Chat";
    case "slack":
      return "Slack";
    case "kakaowork":
      return "Kakao Work";
    case "naver-works":
      return "Naver WORKS";
    case "flow":
      return "flow";
    case "asana":
      return "Asana";
    case "clickup":
      return "ClickUp";
    case "evernote":
      return "Evernote";
    case "onenote":
      return "OneNote";
    case "google-keep":
      return "Google Keep";
    case "samsung-notes":
      return "Samsung Notes";
    default:
      return platform || "current";
  }
}

function normalizeLocaleTag(locale: string | undefined): string {
  return (locale ?? "").trim().replaceAll("_", "-").toLowerCase();
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(getString).filter(Boolean);
}

function getFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatTimestamp(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
}
