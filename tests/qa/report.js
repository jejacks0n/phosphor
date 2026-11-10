// The report a QA run writes, as plain Markdown.
import { keyboardScore, eventCheck } from './score.js';

export const FINDING_KINDS = ['bug', 'visual', 'performance', 'friction', 'oversight', 'keyboard', 'a11y'];
export const SEVERITIES = ['blocker', 'major', 'minor', 'polish'];
export const PROBES = ['again', 'undo-redo', 'back-out', 'interrupt', 'out-of-order', 'extremes', 'speed', 'free'];

// A step's name as a file name: lower case words joined by dashes, never empty and never long.
export function slug(text) {
  const words = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return words.slice(0, 60).replace(/-+$/, '') || 'step';
}

const SOFTWARE = /swiftshader|llvmpipe|software/i;

function stepLines(step) {
  const lines = [`### ${step.name}`, ''];
  lines.push(step.rated ? `- Rating: ${step.how}${step.want ? ` (wanted: ${step.want})` : ''}` : '- Rating: not rated');
  lines.push(`- Events: ${step.events?.keys ?? 0} keys, ${step.events?.pointers ?? 0} pointers`);
  if (step.probes?.length) for (const probe of step.probes) lines.push(`- Probe ${probe.kind}: ${probe.note}`);
  for (const t of step.timings || []) lines.push(`- Timing ${t.name}: ${t.ms} ms of ${t.budget} ms${t.over ? ' (over)' : ''}`);
  for (const shot of step.shots || []) lines.push(`- Shot: ${shot}`);
  const warning = eventCheck(step);
  if (warning) lines.push(`- Warning: ${warning}`);
  return [...lines, ''];
}

export function renderReport(run) {
  const out = [];
  const renderer = run.machine?.renderer;
  if (!renderer) out.push('Renderer unknown: timings may not be real', '');
  else if (SOFTWARE.test(renderer)) out.push('Software renderer: timings are not real', '');
  const { persona, seed, traits = {}, commit, scriptCommit, machine = {} } = run;
  out.push(`# QA run: ${persona}, seed ${seed}`, '');
  out.push(`- Traits: ${Object.entries(traits).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  out.push(`- Commit: ${commit}, script commit: ${scriptCommit}`);
  out.push(`- Machine: ${machine.os}, ${machine.cpu}, ${machine.browser}, ${machine.renderer}`, '');

  const { score, rated, costs } = keyboardScore(run.steps);
  out.push('## Keyboard', '');
  out.push(score === null ? 'Keyboard score: not rated' : `Keyboard score: ${score} / 100 (${rated} rated steps)`, '');
  for (const cost of costs) out.push(`- ${cost.step} (${cost.how}): ${cost.want}`);
  if (costs.length) out.push('');

  out.push('## Findings', '');
  const findings = [...run.findings].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  if (!findings.length) out.push('None.', '');
  for (const f of findings) {
    out.push(`### ${f.severity}, ${f.kind}: ${f.step}`, '');
    out.push(`- Expected: ${f.expected}`, `- Actual: ${f.actual}`, `- Repro: ${f.repro}`);
    if (f.shot) out.push(`- Shot: ${f.shot}`);
    out.push('');
  }

  out.push('## Steps', '');
  for (const step of run.steps) out.push(...stepLines(step));

  const unprobed = run.steps.filter((step) => !step.probes?.length);
  if (unprobed.length) out.push('## No probes tried', '', ...unprobed.map((step) => `- ${step.name}`), '');

  if (run.memory?.length) out.push('## Memory', '', ...run.memory.map((m) => `- ${m.step}: ${m.bytes} bytes`), '');
  if (run.snippets?.length) {
    out.push('## Snippets', '');
    for (const s of run.snippets) out.push(`- ${s.file}: ${s.ok ? 'ok' : `failed (${s.error})`}, ${s.ms} ms`);
    out.push('');
  }
  return out.join('\n');
}
