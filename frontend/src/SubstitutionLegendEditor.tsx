import { useState } from 'react';
import { pb } from './api';
import { substitutionCodes, substitutionName } from './substitutionLabels';
type School = { id: string; sub_option_names?: Record<string, string>; [key: string]: any };
export function SubstitutionLegendEditor({ daycare, onRefresh }: { daycare: School; onRefresh: () => Promise<void> }) {
  return <><h3>Substitution Legend</h3><p className="muted small">Changes save automatically when you leave a field.</p><div className="legend-edit">{substitutionCodes.map(code => <LegendOption key={code} daycare={daycare} code={code} onRefresh={onRefresh} />)}</div></>;
}
function LegendOption({ daycare, code, onRefresh }: { daycare: School; code: string; onRefresh: () => Promise<void> }) {
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  async function save(field: 'name' | 'description', input: HTMLInputElement) {
    const value = input.value.trim();
    const previous = field === 'name' ? substitutionName(daycare, code) : daycare[`sub_${code.toLowerCase()}_label`] || '';
    if (value === previous) { input.value = value; return; }
    if (field === 'name' && !value) { setStatus('Enter a label.'); input.value = previous; return; }
    setSaving(previous => ({ ...previous, [field]: true })); setStatus('Saving…');
    try {
      await pb.send('/api/substitution-legend', { method: 'POST', body: { daycare: daycare.id, code, field, value }, requestKey: null });
      input.value = value; await onRefresh(); setStatus('Saved');
    } catch (error) { input.value = previous; setStatus(error instanceof Error ? error.message : 'Could not save. Try again.'); }
    finally { setSaving(previous => ({ ...previous, [field]: false })); }
  }
  return <div className="legend-option"><label>Label<input aria-label={`Substitution ${code} label`} defaultValue={substitutionName(daycare, code)} maxLength={40} disabled={saving.name} onBlur={event => void save('name', event.currentTarget)} /></label><label>Description<input aria-label={`Substitution ${code} description`} defaultValue={daycare[`sub_${code.toLowerCase()}_label`] || ''} maxLength={100} disabled={saving.description} onBlur={event => void save('description', event.currentTarget)} /></label><small role="status">{status}</small></div>;
}
