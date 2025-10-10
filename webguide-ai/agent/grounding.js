const WEIGHTS = {
  exact: 3,
  partial: 2,
  fuzzy: 1,
  roleBonus: 0.5
};

function normalise(str) {
  return (str || '').toLowerCase().trim();
}

function scoreElement(element, instructionTokens) {
  let score = 0;
  const fields = [
    element.text,
    element.title,
    element.ariaLabel,
    element.placeholder,
    element.associatedLabel,
    element.associatedContext
  ].map(normalise);

  const combined = fields.filter(Boolean);
  if (!combined.length) {
    return 0;
  }

  const combinedText = combined.join(' ');
  instructionTokens.forEach((token) => {
    if (!token) {
      return;
    }
    if (combined.some((field) => field === token)) {
      score += WEIGHTS.exact;
      return;
    }
    if (combined.some((field) => field.includes(token))) {
      score += WEIGHTS.partial;
      return;
    }
    if (combinedText.includes(token)) {
      score += WEIGHTS.fuzzy;
    }
  });

  if (element.tag === 'button' || element.tag === 'a') {
    score += WEIGHTS.roleBonus;
  }

  return score;
}

function tokenizeInstruction(instruction) {
  return normalise(instruction)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1);
}

export function rankCandidates(instruction, snapshot, { maxResults = 3 } = {}) {
  const tokens = tokenizeInstruction(instruction);
  if (!tokens.length) {
    return [];
  }

  const scored = snapshot.map((element) => ({
    element,
    score: scoreElement(element, tokens)
  }));

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

export function selectBestCandidate(instruction, snapshot) {
  const ranked = rankCandidates(instruction, snapshot, { maxResults: 1 });
  return ranked.length ? ranked[0] : null;
}
