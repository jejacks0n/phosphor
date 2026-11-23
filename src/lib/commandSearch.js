// The command list's search: a command matches when the query's letters are in its words in order, not necessarily
// together ("exa" finds "Export .ans"), case and the query's spaces aside. Best first: the query's words each a whole
// word of the command's, in order (3); each the start of one (2); the letters anywhere (1). Ties keep the list's order.
const wordsOf = (text) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Each term fits a word after the last one's, in order.
const inOrder = (terms, words, fits) => {
  let at = 0;
  return terms.every((term) => {
    while (at < words.length && !fits(words[at], term)) at++;
    return at++ < words.length;
  });
};

export function searchCommands(query, commands) {
  const letters = query.toLowerCase().replace(/\s+/g, ''), terms = wordsOf(query);
  if (!letters) return [];
  return commands.flatMap(({ id, words }) => {
    const text = words.toLowerCase();
    let from = 0;
    if (![...letters].every((ch) => (from = text.indexOf(ch, from) + 1) > 0)) return [];
    const list = wordsOf(words);
    const whole = terms.length && inOrder(terms, list, (word, term) => word === term);
    const starts = terms.length && inOrder(terms, list, (word, term) => word.startsWith(term));
    return [{ id, score: whole ? 3 : starts ? 2 : 1 }];
  }).sort((a, b) => b.score - a.score); // a stable sort: ties stay in order
}
