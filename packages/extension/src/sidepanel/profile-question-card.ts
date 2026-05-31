import { escapeAttribute, escapeHtml } from "./html-escape.js";
import { getUiStrings } from "./i18n.js";
import { type PendingProfileQuestionState } from "./profile-question.js";
import { renderUiIcon } from "./ui-icons.js";

interface ProfileQuestionCardLabels {
  fallbackProfile: string;
  title: string;
  placeholder: string;
  submit: string;
  dismiss: string;
}

interface RenderProfileQuestionCardOptions {
  pending: PendingProfileQuestionState | null;
  uiLocale: string;
  fallbackProfileLabel: string;
  canSubmit: boolean;
}

export function renderPendingProfileQuestionCard(options: RenderProfileQuestionCardOptions): string {
  const { pending } = options;
  if (!pending) {
    return "";
  }

  const labels = getProfileQuestionCardLabels(options.uiLocale, options.fallbackProfileLabel);
  const disabled = options.canSubmit ? "" : "disabled";
  const optionHtml = renderProfileQuestionOptions(pending, disabled);
  const textareaHtml = renderProfileQuestionTextarea(pending, labels, disabled);

  return `
    <section class="profile-question-card" data-profile-question-id="${escapeAttribute(pending.id)}">
      <div class="profile-question-eyebrow">
        <span class="profile-question-icon" aria-hidden="true">${renderUiIcon("question")}</span>
        <span>${escapeHtml(labels.title)}</span>
        <span class="profile-question-profile">${escapeHtml(pending.profileName || labels.fallbackProfile)}</span>
      </div>
      <p class="profile-question-text">${escapeHtml(pending.question)}</p>
      ${optionHtml}
      ${textareaHtml}
      <div class="profile-question-actions">
        <button type="button" class="settings-compact-button" data-profile-question-dismiss>${escapeHtml(labels.dismiss)}</button>
        <button type="button" class="settings-compact-button primary" data-profile-question-submit ${disabled}>${escapeHtml(labels.submit)}</button>
      </div>
    </section>
  `;
}

function getProfileQuestionCardLabels(uiLocale: string, fallbackProfileLabel: string): ProfileQuestionCardLabels {
  const strings = getUiStrings(uiLocale);
  return {
    fallbackProfile: fallbackProfileLabel,
    title: strings.profileQuestion.title,
    placeholder: strings.profileQuestion.placeholder,
    submit: strings.profileQuestion.submit,
    dismiss: strings.profileQuestion.dismiss,
  };
}

function renderProfileQuestionOptions(pending: PendingProfileQuestionState, disabled: string): string {
  if (!pending.options.length) {
    return "";
  }

  return `
    <div class="profile-question-options">
      ${pending.options
        .map(
          (option) => `
            <button type="button" class="profile-question-option" data-profile-question-option="${escapeAttribute(option)}" ${disabled}>
              ${escapeHtml(option)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderProfileQuestionTextarea(
  pending: PendingProfileQuestionState,
  labels: ProfileQuestionCardLabels,
  disabled: string,
): string {
  if (!pending.allowFreeform && pending.options.length) {
    return "";
  }

  return `
    <textarea
      id="profile-question-answer"
      class="profile-question-answer"
      rows="2"
      placeholder="${escapeAttribute(labels.placeholder)}"
      ${disabled}
    >${escapeHtml(pending.answer)}</textarea>
  `;
}
