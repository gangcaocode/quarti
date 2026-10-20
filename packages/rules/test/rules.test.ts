import { describe, expect, test } from 'vitest';
import {
  addDays, dayStats, dayStatus, durationLabel, errorCode, hhmm, isActiveOn, isCover, overlaps, parseHHMM, periodFor, rateFor,
  shiftTimesError, span, weekRange, weekday, whyNot, type Slot, type StaffMember,
} from '../src';

const remi: StaffMember = { id: 'rl', fullName: 'Rémi Lapointe', status: 'active', mainPositionId: 'barista', rates: { barista: 2100, cook: 2300 } };
const s = (o: Partial<Slot>): Slot => ({ id: 'x', day: '2026-10-02', positionId: 'cook', periodId: null, startMin: 420, endMin: 720, staffId: null, confirm: 'ok', ...o });

describe('days and times', () => {
  test('weeks run Monday to Sunday', () => {
    expect(weekday('2026-10-05')).toBe(0);
    expect(weekRange('2026-10-04')).toEqual(['2026-09-28', '2026-10-04']);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  test('times past midnight', () => {
    expect(hhmm(1560)).toBe('02:00');
    expect(span(1320, 120)).toEqual({ startMin: 1320, endMin: 1560 });
    expect(span(420, 420)).toEqual({ startMin: 420, endMin: 1860 });
    expect(parseHHMM('7:05')).toBe(425);
    expect(parseHHMM('24:00')).toBeNull();
    expect(durationLabel(330)).toBe('5 h 30');
  });
  test('the same limits as the database', () => {
    expect(shiftTimesError(420, 720)).toBeNull();
    expect(shiftTimesError(420, 440)).toBe('too_short');
    expect(shiftTimesError(420, 420 + 961)).toBe('too_long');
    expect(shiftTimesError(1440, 1500)).toBe('bad_times');
  });
});

describe('periods', () => {
  const P = [{ id: 'm', name: 'Morning', startMin: 420, endMin: 720 }, { id: 'l', name: 'Lunch', startMin: 720, endMin: 1020 }];
  test('the one a shift overlaps most', () => {
    expect(periodFor(600, 900, P)?.id).toBe('l');
    expect(periodFor(600, 840, P)?.id).toBe('m');
    expect(periodFor(1200, 1300, P)).toBeNull();
  });
});

describe('who can take a slot', () => {
  test('overlaps across midnight and days', () => {
    expect(overlaps(s({ day: '2026-10-02', startMin: 1320, endMin: 1560 }), s({ day: '2026-10-03', startMin: 60, endMin: 300 }))).toBe(true);
    expect(overlaps(s({ startMin: 420, endMin: 720 }), s({ startMin: 720, endMin: 1020 }))).toBe(false);
  });
  test('reasons, in order', () => {
    const slot = s({ id: 'a', positionId: 'cook', startMin: 720, endMin: 1020 });
    expect(whyNot(remi, slot, [])).toBeNull();
    expect(whyNot({ ...remi, removed: true }, slot, [])?.code).toBe('removed');
    expect(whyNot({ ...remi, status: 'inactive', backOn: '2026-10-05' }, slot, [])?.code).toBe('inactive');
    expect(whyNot({ ...remi, status: 'inactive', backOn: '2026-10-01' }, slot, [])).toBeNull();
    const clash = s({ id: 'b', staffId: 'rl', startMin: 900, endMin: 1200 });
    expect(whyNot(remi, slot, [clash])).toEqual({ code: 'double_booked', clash });
    expect(whyNot(remi, slot, [{ ...clash, status: 'cancelled' }])).toBeNull();
    expect(whyNot({ ...remi, rates: {}, mainPositionId: null }, slot, [])?.code).toBe('no_rate');
  });
  test('covering pays the main rate', () => {
    expect(rateFor(remi, 'cook')).toBe(2300);
    expect(rateFor(remi, 'cashier')).toBe(2100);
    expect(isCover(remi, 'cashier')).toBe(true);
    expect(isActiveOn({ ...remi, status: 'inactive' }, '2026-10-02')).toBe(false);
  });
});

describe('a day at a glance', () => {
  test('counts and the next thing to do', () => {
    const st = dayStats([s({ id: '1' }), s({ id: '2', staffId: 'a', confirm: 'draft' }), s({ id: '3', staffId: 'b', confirm: 'pending' }), s({ id: '4', staffId: 'c' }), s({ id: '5', status: 'cancelled' })]);
    expect(st).toEqual({ slots: 4, open: 1, draft: 1, pending: 1, confirmed: 1, declined: 0 });
    expect(dayStatus(st)).toBe('open');
    expect(dayStatus({ ...st, open: 0 })).toBe('unsent');
    expect(dayStatus({ ...st, open: 0, draft: 0 })).toBe('waiting');
    expect(dayStatus({ ...st, open: 0, draft: 0, pending: 0 })).toBe('staffed');
    expect(dayStatus(dayStats([]))).toBe('empty');
  });
  test('error codes from the database', () => {
    expect(errorCode('double_booked')).toBe('double_booked');
    expect(errorCode('new row for relation "staff_positions" violates check constraint "staff_positions_rate_cents_check"')).toBe('bad_input');
    expect(errorCode('something else')).toBe('unknown');
  });
});
