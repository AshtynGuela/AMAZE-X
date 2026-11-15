// Shared by the API and chat, including replies restored from history.
export function rockySpeech(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Rocky needs another try. Statement.";
  const marker = text.match(/\b(question|statement|warning|agreement|disagreement)[.!?]*$/i);
  if (marker) {
    const word = marker[1].toLowerCase();
    return text.slice(0, marker.index) + word[0].toUpperCase() + word.slice(1) + (word === "question" ? "?" : ".");
  }
  return text + (/[.!?][\u201d"']?$/.test(text) ? " " : ". ") + (/\?[\u201d"']?$/.test(text) ? "Question?" : "Statement.");
}
