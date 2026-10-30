// What a host's browser counts while it hosts: who came and went, messages, who was removed, the most at once.
// Plain mutation of the object passed in; RoomStore holds it in reactive state.

export const newSession = () => ({ liveSince: null, most: 0, messages: 0, people: [] });

const find = (s, sub) => s.people.find((p) => p.sub === sub);

// A person arrives, or comes back (one person, their times added up); the name is the latest.
export function sessionJoined(s, { sub, name, guest }, ts) {
  const person = find(s, sub);
  if (!person) s.people.push({ sub, name, guest, since: ts, total: 0, left: null, removed: null, said: 0 });
  else Object.assign(person, { name, guest, since: ts, left: null });
}

export function sessionLeft(s, sub, ts) {
  const person = find(s, sub);
  if (!person || person.since === null) return;
  Object.assign(person, { total: person.total + ts - person.since, since: null, left: ts });
}

// Only the first time: the leaving after it doesn't clear it.
export function sessionRemoved(s, sub, ts) {
  const person = find(s, sub);
  if (person && person.removed === null) person.removed = ts;
}

export function sessionSaid(s, sub) {
  s.messages += 1;
  const person = find(s, sub);
  if (person) person.said += 1;
}

export function sessionSaw(s, here) {
  s.most = Math.max(s.most, here);
}

export const timeIn = (person, now) => person.total + (person.since === null ? 0 : now - person.since);

export const removedCount = (s) => s.people.filter((p) => p.removed !== null).length;
