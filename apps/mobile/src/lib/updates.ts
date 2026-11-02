// Updates are stored as events (kind + details) and written out here in the reader's language
// (rules: Languages, "Events, not sentences"). Older updates without details fall back to their English text.
import { timesLabel } from '@quarti/rules';
import type { TFunction } from 'i18next';
import i18n from '../i18n';
import type { Update } from './data';
import { dayLabel } from './dates';

export function updateText(t: TFunction, u: Update): { title: string; body: string } {
  const title = t(`updates.${u.kind}`, { defaultValue: u.title });
  const { day, start_min, end_min, why } = u.details ?? {};
  if (typeof day === 'string' && typeof start_min === 'number' && typeof end_min === 'number') {
    const when = `${dayLabel(day)} · ${timesLabel({ startMin: start_min, endMin: end_min })}`;
    return { title, body: typeof why === 'string' && i18n.exists(`updateWhy.${why}`) ? `${when} · ${t(`updateWhy.${why}`)}` : when };
  }
  if (i18n.exists(`updateBody.${u.kind}`)) return { title, body: t(`updateBody.${u.kind}`) };
  return { title, body: u.body };
}
