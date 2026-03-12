import { findCodeRegions, isInsideCode } from "./code-regions.js";
import { stripReasoningTagsFromText } from "./reasoning-tags.js";

const MEMORY_TAG_RE = /<\s*(\/?)\s*relevant[-_]memories\b[^<>]*>/gi;
const MEMORY_TAG_QUICK_RE = /<\s*\/?\s*relevant[-_]memories\b/i;
const ORPHAN_REASONING_CLOSE_RE = /<\s*\/\s*(?:think(?:ing)?|thought|antthinking)\b[^<>]*>/gi;
const ORPHAN_REASONING_CLOSE_QUICK_RE = /<\s*\/\s*(?:think(?:ing)?|thought|antthinking)\b/i;
const REASONING_OPEN_RE = /<\s*(?!\/)\s*(?:think(?:ing)?|thought|antthinking)\b[^<>]*>/gi;
const REASONING_OPEN_QUICK_RE = /<\s*(?!\/)\s*(?:think(?:ing)?|thought|antthinking)\b/i;

function hasReasoningOpenTagOutsideCode(text: string): boolean {
  if (!text || !REASONING_OPEN_QUICK_RE.test(text)) {
    return false;
  }

  const codeRegions = findCodeRegions(text);
  REASONING_OPEN_RE.lastIndex = 0;
  for (const match of text.matchAll(REASONING_OPEN_RE)) {
    const idx = match.index ?? 0;
    if (!isInsideCode(idx, codeRegions)) {
      return true;
    }
  }
  return false;
}

function stripLeadingOrphanedReasoningLeak(text: string): string {
  if (!text || !ORPHAN_REASONING_CLOSE_QUICK_RE.test(text)) {
    return text;
  }

  const codeRegions = findCodeRegions(text);
  ORPHAN_REASONING_CLOSE_RE.lastIndex = 0;
  for (const match of text.matchAll(ORPHAN_REASONING_CLOSE_RE)) {
    const idx = match.index ?? 0;
    if (isInsideCode(idx, codeRegions)) {
      continue;
    }

    const prefix = text.slice(0, idx);
    if (hasReasoningOpenTagOutsideCode(prefix)) {
      continue;
    }

    const suffix = text.slice(idx + match[0].length);
    if (/^\s*(?:\r?\n)+\s*\S/.test(suffix)) {
      return suffix;
    }
  }

  return text;
}

function stripRelevantMemoriesTags(text: string): string {
  if (!text || !MEMORY_TAG_QUICK_RE.test(text)) {
    return text;
  }
  MEMORY_TAG_RE.lastIndex = 0;

  const codeRegions = findCodeRegions(text);
  let result = "";
  let lastIndex = 0;
  let inMemoryBlock = false;

  for (const match of text.matchAll(MEMORY_TAG_RE)) {
    const idx = match.index ?? 0;
    if (isInsideCode(idx, codeRegions)) {
      continue;
    }

    const isClose = match[1] === "/";
    if (!inMemoryBlock) {
      result += text.slice(lastIndex, idx);
      if (!isClose) {
        inMemoryBlock = true;
      }
    } else if (isClose) {
      inMemoryBlock = false;
    }

    lastIndex = idx + match[0].length;
  }

  if (!inMemoryBlock) {
    result += text.slice(lastIndex);
  }

  return result;
}

export function stripAssistantInternalScaffolding(text: string): string {
  const withoutOrphanedReasoning = stripLeadingOrphanedReasoningLeak(text);
  const withoutReasoning = stripReasoningTagsFromText(withoutOrphanedReasoning, {
    mode: "preserve",
    trim: "start",
  });
  const withoutMemories = stripRelevantMemoriesTags(withoutReasoning);
  const changed =
    withoutOrphanedReasoning !== text ||
    withoutReasoning !== withoutOrphanedReasoning ||
    withoutMemories !== withoutReasoning;
  return changed ? withoutMemories.trimStart() : withoutMemories;
}
