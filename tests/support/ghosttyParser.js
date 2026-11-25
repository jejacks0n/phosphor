// Ghostty's VT parser (1.4.0: src/terminal/parse_table.zig, and stream.zig's ground state), ported as its table for
// the tests: the bytes a terminal is given, as the sequences Ghostty acts on. It's what a .pho printed in Ghostty is
// read as (src/document/phoTerminal.js), and unlike xterm.js it reads bytes 0x80 to 0x9F inside an escape as C1
// controls: 0x9A there is ESC Z, and 0x9B starts a CSI.
const STATES = ['ground', 'escape', 'escape_intermediate', 'csi_entry', 'csi_param', 'csi_intermediate', 'csi_ignore', 'dcs_entry', 'dcs_param', 'dcs_intermediate', 'dcs_passthrough', 'dcs_ignore', 'osc_string', 'sos_pm_apc_string'];
const table = STATES.map(() => Array.from({ length: 256 }, () => null));
const set = (state, from, to, next, action) => {
  for (let c = from; c <= to; c++) table[STATES.indexOf(state)][c] = [next ?? state, action];
};
const c0 = (state, action) => (set(state, 0x00, 0x17, null, action), set(state, 0x19, 0x19, null, action), set(state, 0x1c, 0x1f, null, action));

for (const state of STATES) {
  set(state, 0x18, 0x18, 'ground', 'execute');
  set(state, 0x1a, 0x1a, 'ground', 'execute');
  set(state, 0x80, 0x8f, 'ground', 'execute');
  set(state, 0x91, 0x97, 'ground', 'execute');
  set(state, 0x99, 0x9a, 'ground', 'execute');
  set(state, 0x9c, 0x9c, 'ground', 'none');
  set(state, 0x1b, 0x1b, 'escape', 'none');
  for (const c of [0x98, 0x9e, 0x9f]) set(state, c, c, 'sos_pm_apc_string', 'none');
  set(state, 0x9b, 0x9b, 'csi_entry', 'none');
  set(state, 0x90, 0x90, 'dcs_entry', 'none');
  set(state, 0x9d, 0x9d, 'osc_string', 'none');
}
c0('escape_intermediate', 'execute');
set('escape_intermediate', 0x20, 0x2f, null, 'collect');
set('escape_intermediate', 0x7f, 0x7f, null, 'ignore');
set('escape_intermediate', 0x30, 0x7e, 'ground', 'esc_dispatch');
c0('sos_pm_apc_string', 'apc_put');
set('sos_pm_apc_string', 0x20, 0x7f, null, 'apc_put');
c0('escape', 'execute');
set('escape', 0x7f, 0x7f, null, 'ignore');
set('escape', 0x30, 0x7e, 'ground', 'esc_dispatch');
set('escape', 0x20, 0x2f, 'escape_intermediate', 'collect');
for (const c of [0x58, 0x5e, 0x5f]) set('escape', c, c, 'sos_pm_apc_string', 'none');
set('escape', 0x50, 0x50, 'dcs_entry', 'none');
set('escape', 0x5b, 0x5b, 'csi_entry', 'none');
set('escape', 0x5d, 0x5d, 'osc_string', 'none');
c0('dcs_entry', 'ignore');
set('dcs_entry', 0x7f, 0x7f, null, 'ignore');
set('dcs_entry', 0x20, 0x2f, 'dcs_intermediate', 'collect');
set('dcs_entry', 0x3a, 0x3a, 'dcs_ignore', 'none');
set('dcs_entry', 0x30, 0x39, 'dcs_param', 'param');
set('dcs_entry', 0x3b, 0x3b, 'dcs_param', 'param');
set('dcs_entry', 0x3c, 0x3f, 'dcs_param', 'collect');
set('dcs_entry', 0x40, 0x7e, 'dcs_passthrough', 'hook');
c0('dcs_intermediate', 'ignore');
set('dcs_intermediate', 0x20, 0x2f, null, 'collect');
set('dcs_intermediate', 0x7f, 0x7f, null, 'ignore');
set('dcs_intermediate', 0x30, 0x3f, 'dcs_ignore', 'none');
set('dcs_intermediate', 0x40, 0x7e, 'dcs_passthrough', 'hook');
c0('dcs_ignore', 'ignore');
set('dcs_ignore', 0x80, 0xff, null, 'ignore');
c0('dcs_param', 'ignore');
set('dcs_param', 0x30, 0x39, null, 'param');
set('dcs_param', 0x3b, 0x3b, null, 'param');
set('dcs_param', 0x7f, 0x7f, null, 'ignore');
set('dcs_param', 0x3a, 0x3a, 'dcs_ignore', 'none');
set('dcs_param', 0x3c, 0x3f, 'dcs_ignore', 'none');
set('dcs_param', 0x20, 0x2f, 'dcs_intermediate', 'collect');
set('dcs_param', 0x40, 0x7e, 'dcs_passthrough', 'hook');
c0('dcs_passthrough', 'put');
set('dcs_passthrough', 0x20, 0x7e, null, 'put');
set('dcs_passthrough', 0x7f, 0x7f, null, 'ignore');
set('dcs_passthrough', 0x80, 0xff, null, 'put');
c0('csi_param', 'execute');
set('csi_param', 0x30, 0x3b, null, 'param');
set('csi_param', 0x7f, 0x7f, null, 'ignore');
set('csi_param', 0x40, 0x7e, 'ground', 'csi_dispatch');
set('csi_param', 0x3c, 0x3f, 'csi_ignore', 'none');
set('csi_param', 0x20, 0x2f, 'csi_intermediate', 'collect');
c0('csi_ignore', 'execute');
set('csi_ignore', 0x20, 0x3f, null, 'ignore');
set('csi_ignore', 0x7f, 0x7f, null, 'ignore');
set('csi_ignore', 0x40, 0x7e, 'ground', 'none');
c0('csi_intermediate', 'execute');
set('csi_intermediate', 0x20, 0x2f, null, 'collect');
set('csi_intermediate', 0x7f, 0x7f, null, 'ignore');
set('csi_intermediate', 0x40, 0x7e, 'ground', 'csi_dispatch');
set('csi_intermediate', 0x30, 0x3f, 'csi_ignore', 'none');
c0('csi_entry', 'execute');
set('csi_entry', 0x7f, 0x7f, null, 'ignore');
set('csi_entry', 0x40, 0x7e, 'ground', 'csi_dispatch');
set('csi_entry', 0x3a, 0x3a, 'csi_ignore', 'none');
set('csi_entry', 0x20, 0x2f, 'csi_intermediate', 'collect');
set('csi_entry', 0x30, 0x39, 'csi_param', 'param');
set('csi_entry', 0x3b, 0x3b, 'csi_param', 'param');
set('csi_entry', 0x3c, 0x3f, 'csi_param', 'collect');
c0('osc_string', 'ignore');
set('osc_string', 0x20, 0xff, null, 'osc_put');
set('osc_string', 0x07, 0x07, 'ground', 'none');

// What Ghostty acts on in the bytes, as { at, kind, text }: an ESC sequence or C1 control ('esc', its intermediates and
// final, a C1 as the ESC it stands for), a CSI ('csi', its parameters, intermediates and final as written), an OSC
// ended by BEL or ESC ('osc', its payload), a DCS ('dcs', up to its final) and an APC ('apc', its payload, as far as
// it goes). In the ground state Ghostty decodes UTF-8, which C1 controls come through ignored, so only ESC leaves it.
export function ghosttyDispatches(bytes) {
  const out = [];
  let state = 'ground', held = '', at = 0, apc = null;
  const latin1 = (c) => String.fromCharCode(c);
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (state === 'ground') {
      if (c === 0x1b) (state = 'escape', held = '', at = i);
      continue;
    }
    const [next, action] = table[STATES.indexOf(state)][c] ?? [state, 'none'];
    if (state === 'osc_string' && next !== 'osc_string' && (c === 0x07 || c === 0x1b)) out.push({ at, kind: 'osc', text: held });
    if (state === 'sos_pm_apc_string' && next !== state && apc) out.push({ at, kind: 'apc', text: held });
    if (action === 'execute' && c >= 0x80) out.push({ at: i, kind: 'esc', text: latin1(c - 0x40) });
    else if (action === 'esc_dispatch') out.push({ at, kind: 'esc', text: held + latin1(c) });
    else if (action === 'csi_dispatch') out.push({ at, kind: 'csi', text: held + latin1(c) });
    else if (action === 'hook') out.push({ at, kind: 'dcs', text: held + latin1(c) });
    else if (['collect', 'param', 'osc_put'].includes(action) || (action === 'apc_put' && c >= 0x20)) held += latin1(c);
    if (next !== state) {
      if (next === 'escape') (held = '', at = i);
      else if (['csi_entry', 'dcs_entry', 'osc_string', 'sos_pm_apc_string'].includes(next)) (held = '', at = c >= 0x80 ? i : at);
      if (next === 'sos_pm_apc_string') apc = c === 0x5f || c === 0x9f;
    }
    state = next;
  }
  return out;
}
