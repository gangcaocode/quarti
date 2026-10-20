// The handful of building blocks every screen uses, styled like the prototype.
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, S } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({ title, right, back, children, onRefresh, refreshing, scroll = true }: {
  title?: string; right?: ReactNode; back?: { label: string; onPress: () => void }; children: ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean;
}) {
  const head = title || right || back ? (
    <View>
      {back ? (
        <Pressable onPress={back.onPress} accessibilityRole="button" accessibilityLabel={back.label} hitSlop={10} style={st.back}>
          <Ionicons name="chevron-back" size={20} color={C.br} /><Text style={st.backText}>{back.label}</Text>
        </Pressable>
      ) : null}
      {title || right ? <View style={st.head}>{title ? <Text style={st.title} accessibilityRole="header">{title}</Text> : <View />}{right}</View> : null}
    </View>
  ) : null;
  return (
    <SafeAreaView style={st.screen} edges={['top', 'left', 'right']}>
      {head}
      {scroll ? (
        <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.br} /> : undefined}>
          {children}
        </ScrollView>
      ) : <View style={[st.content, { flex: 1 }]}>{children}</View>}
    </SafeAreaView>
  );
}

export function T({ children, v = 'body', style, numberOfLines }: { children: ReactNode; v?: 'body' | 'small' | 'tiny' | 'strong' | 'h2' | 'label'; style?: object; numberOfLines?: number }) {
  return <Text style={[st[v], style]} numberOfLines={numberOfLines}>{children}</Text>;
}

export function Card({ children, style, onPress, tone }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; tone?: 'open' | 'wait' | 'ok' | 'info' }) {
  const bg = tone === 'open' ? C.col : tone === 'wait' ? C.aml : tone === 'ok' ? C.brl : tone === 'info' ? C.bll : C.s2;
  const inner = <View style={[st.card, { backgroundColor: bg }, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>{inner}</Pressable> : inner;
}

export function Button({ label, onPress, kind = 'primary', icon, disabled, busy, small }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: IconName; disabled?: boolean; busy?: boolean; small?: boolean;
}) {
  const bg = kind === 'primary' ? C.br : kind === 'danger' ? C.rd : kind === 'ghost' ? 'transparent' : C.s0;
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : kind === 'ghost' ? C.br : C.t1;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || busy) }}
      style={({ pressed }) => [small ? st.btnSm : st.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, borderWidth: kind === 'secondary' ? StyleSheet.hairlineWidth : 0 }]}>
      {busy ? <ActivityIndicator color={fg} /> : (
        <View style={st.row}>
          {icon ? <Ionicons name={icon} size={small ? 14 : 17} color={fg} /> : null}
          <Text style={[small ? st.btnTxtSm : st.btnTxt, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({ label, error, ...p }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={st.label}>{label}</Text>
      <TextInput placeholderTextColor={C.t3} style={[st.input, error ? { borderColor: C.co } : null]} accessibilityLabel={label} {...p} />
      {error ? <Text style={st.err}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} style={[st.chip, on ? { backgroundColor: C.brl, borderColor: C.br } : null]}>
      <Text style={[st.chipTxt, on ? { color: C.brd } : null]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'grey' }: { label: string; tone?: 'grey' | 'green' | 'amber' | 'coral' | 'blue' }) {
  const [bg, fg] = tone === 'green' ? [C.brl, C.brd] : tone === 'amber' ? [C.aml, C.amd] : tone === 'coral' ? [C.col, C.cod] : tone === 'blue' ? [C.bll, C.bld] : [C.s0, C.t2];
  return <View style={[st.badge, { backgroundColor: bg }]}><Text style={[st.badgeTxt, { color: fg }]}>{label}</Text></View>;
}

export function Section({ title, right }: { title: string; right?: ReactNode }) {
  return <View style={[st.row, { justifyContent: 'space-between', marginTop: S.lg, marginBottom: S.sm }]}><Text style={st.section}>{title}</Text>{right}</View>;
}

export function Empty({ icon, text, children }: { icon: IconName; text: string; children?: ReactNode }) {
  return <View style={st.empty}><Ionicons name={icon} size={28} color={C.t3} /><Text style={[st.small, { textAlign: 'center' }]}>{text}</Text>{children}</View>;
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' | 'ok' }) {
  const [bg, fg] = tone === 'error' ? [C.rdl, C.rdd] : tone === 'ok' ? [C.brl, C.brd] : [C.bll, C.bld];
  return <View style={[st.notice, { backgroundColor: bg }]} accessibilityLiveRegion="polite"><Text style={[st.small, { color: fg }]}>{text}</Text></View>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) { return <View style={[st.row, style]}>{children}</View>; }

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const ini = name.split(/\s+/).map((x) => x[0] ?? '').join('').slice(0, 2).toUpperCase();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.brl, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: size * 0.36, color: C.brd, fontWeight: '600' }}>{ini}</Text></View>;
}

/** a bottom sheet: the prototype's pattern for choices and confirmations */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={st.sheet}>
        <View style={st.grab} />
        <Text style={[st.h2, { marginBottom: S.sm }]}>{title}</Text>
        <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function Loading() { return <View style={st.empty}><ActivityIndicator color={C.br} /></View>; }

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.s1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.sm },
  title: { fontSize: 22, fontWeight: '600', color: C.t1 },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: S.md, paddingTop: S.sm },
  backText: { fontSize: 15, color: C.br, fontWeight: '500' },
  content: { paddingHorizontal: S.lg, paddingBottom: 40 },
  body: { fontSize: 15, color: C.t1, lineHeight: 21 },
  small: { fontSize: 13, color: C.t2, lineHeight: 18 },
  tiny: { fontSize: 11, color: C.t3, lineHeight: 15 },
  strong: { fontSize: 15, color: C.t1, fontWeight: '600' },
  h2: { fontSize: 17, color: C.t1, fontWeight: '600' },
  label: { fontSize: 12, color: C.t2, marginBottom: 4 },
  section: { fontSize: 12, color: C.t3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: R.lg, padding: S.md, marginBottom: S.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: C.b },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  btn: { minHeight: 46, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.lg, marginTop: S.sm, borderColor: C.bs },
  btnSm: { minHeight: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.md, borderColor: C.bs },
  btnTxt: { fontSize: 15, fontWeight: '600' },
  btnTxtSm: { fontSize: 13, fontWeight: '500' },
  input: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: C.bs, borderRadius: R.md, backgroundColor: C.s2, paddingHorizontal: S.md, fontSize: 16, color: C.t1 },
  err: { fontSize: 12, color: C.co, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: C.bs, backgroundColor: C.s2, marginRight: 6, marginBottom: 6 },
  chipTxt: { fontSize: 13, color: C.t2, fontWeight: '500' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: S.sm, paddingVertical: S.xl },
  notice: { borderRadius: R.md, padding: S.md, marginBottom: S.md },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: C.s2, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: S.lg, paddingBottom: 34 },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.bs, marginBottom: S.md },
});
