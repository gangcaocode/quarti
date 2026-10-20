// Tick the positions someone can work, each with its own hourly rate ($15–60). The first ticked is their main position.
import { Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PositionRate } from '../lib/api';
import type { Position } from '../lib/data';
import { Chip, Field, Row, T } from '../ui/kit';
import { C } from '../ui/theme';

export type PosDraft = { on: Record<string, boolean>; rate: Record<string, string>; main: string | null };

export function draftFrom(rates: Record<string, number>, main: string | null): PosDraft {
  return { on: Object.fromEntries(Object.keys(rates).map((k) => [k, true])), rate: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, (v / 100).toFixed(2)])), main };
}

/** null and an error key when something is wrong */
export function draftToRates(d: PosDraft, positions: Position[]): { list: PositionRate[]; main: string } | { error: string } {
  const picked = positions.filter((p) => d.on[p.id]);
  if (!picked.length) return { error: 'staff.needPosition' };
  const list: PositionRate[] = [];
  for (const p of picked) {
    const v = Number((d.rate[p.id] ?? '').replace(',', '.'));
    if (!Number.isFinite(v) || v < 15 || v > 60) return { error: 'staff.badRate' };
    list.push({ position_id: p.id, rate_cents: Math.round(v * 100) });
  }
  const main = d.main && d.on[d.main] ? d.main : picked[0].id;
  return { list: [list.find((x) => x.position_id === main)!, ...list.filter((x) => x.position_id !== main)], main };
}

export function PositionsEditor({ positions, value, onChange }: { positions: Position[]; value: PosDraft; onChange: (d: PosDraft) => void }) {
  const { t } = useTranslation();
  return (
    <View>
      {positions.map((p) => {
        const on = !!value.on[p.id];
        return (
          <View key={p.id} style={{ paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.b }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="strong">{p.name}</T>
              <Switch value={on} onValueChange={(v) => onChange({ ...value, on: { ...value.on, [p.id]: v }, main: !v && value.main === p.id ? null : value.main })} accessibilityLabel={p.name} trackColor={{ true: C.br }} />
            </Row>
            {on ? (
              <Row>
                <View style={{ width: 120 }}><Field label={t('staff.rate')} value={value.rate[p.id] ?? ''} onChangeText={(v) => onChange({ ...value, rate: { ...value.rate, [p.id]: v } })} keyboardType="decimal-pad" placeholder="20.00" /></View>
                <Chip label={t('staff.main')} on={(value.main ?? positions.find((x) => value.on[x.id])?.id) === p.id} onPress={() => onChange({ ...value, main: p.id })} />
              </Row>
            ) : null}
          </View>
        );
      })}
      <T v="tiny" style={{ marginTop: 6 }}>{t('staff.mainNote')}</T>
    </View>
  );
}
