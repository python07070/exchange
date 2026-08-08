/**
 * Opening-hours engine.
 *
 * Every business stores its own UTC offset, so "open right now" is always
 * evaluated in the business's local time rather than the server's. Hours are
 * stored as minutes after local midnight; a `closes` value above 1440 means the
 * shift runs past midnight (e.g. a diner open 20:00–02:00 stores 1200 → 1560).
 */

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CLOSING_SOON_MINUTES = 45;
const OPENING_SOON_MINUTES = 60;

/** Wall-clock position inside the business's own timezone. */
export function localNow(tzOffsetMinutes = 0, now = Date.now()) {
  const shifted = new Date(now + tzOffsetMinutes * 60_000);
  return {
    dow: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** 545 → "9:05 AM" */
export function formatMinutes(minutes) {
  if (minutes == null) return '';
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function slotsFor(hours, dow) {
  return hours.filter((h) => h.dow === dow && !h.closed && h.opens != null && h.closes != null);
}

/**
 * @param {Array<{dow:number,opens:number,closes:number,closed:number}>} hours
 * @returns {{open:boolean, status:string, label:string, detail:string,
 *            minutesUntilClose:number|null, minutesUntilOpen:number|null,
 *            todayHours:string}}
 */
export function openState(hours, tzOffsetMinutes = 0, now = Date.now()) {
  const { dow, minutes } = localNow(tzOffsetMinutes, now);

  if (!hours || hours.length === 0) {
    return {
      open: false,
      status: 'unknown',
      label: 'Hours not listed',
      detail: '',
      minutesUntilClose: null,
      minutesUntilOpen: null,
      todayHours: 'Hours not listed',
    };
  }

  // A slot that started yesterday can still be running (e.g. 20:00–02:00).
  const yesterday = (dow + 6) % 7;
  const candidates = [
    ...slotsFor(hours, dow).map((s) => ({ opens: s.opens, closes: s.closes })),
    ...slotsFor(hours, yesterday)
      .filter((s) => s.closes > 1440)
      .map((s) => ({ opens: s.opens - 1440, closes: s.closes - 1440 })),
  ];

  const active = candidates.find((s) => minutes >= s.opens && minutes < s.closes);

  if (active) {
    const minutesUntilClose = active.closes - minutes;
    const closingSoon = minutesUntilClose <= CLOSING_SOON_MINUTES;
    return {
      open: true,
      status: closingSoon ? 'closing_soon' : 'open',
      label: closingSoon ? `Closing in ${minutesUntilClose} min` : 'Open now',
      detail: `Closes ${formatMinutes(active.closes)}`,
      minutesUntilClose,
      minutesUntilOpen: null,
      todayHours: todayHoursLabel(hours, dow),
    };
  }

  // Not open — find the next opening within the coming week.
  const next = nextOpening(hours, dow, minutes);
  const minutesUntilOpen = next ? next.inMinutes : null;
  const openingSoon = minutesUntilOpen != null && minutesUntilOpen <= OPENING_SOON_MINUTES;

  return {
    open: false,
    status: openingSoon ? 'opens_soon' : 'closed',
    label: openingSoon ? `Opens in ${minutesUntilOpen} min` : 'Closed',
    detail: next
      ? next.dayOffset === 0
        ? `Opens ${formatMinutes(next.opens)}`
        : next.dayOffset === 1
          ? `Opens tomorrow ${formatMinutes(next.opens)}`
          : `Opens ${DAY_SHORT[next.dow]} ${formatMinutes(next.opens)}`
      : 'Temporarily closed',
    minutesUntilClose: null,
    minutesUntilOpen,
    todayHours: todayHoursLabel(hours, dow),
  };
}

function nextOpening(hours, dow, minutes) {
  for (let offset = 0; offset < 8; offset += 1) {
    const day = (dow + offset) % 7;
    const slots = slotsFor(hours, day).sort((a, b) => a.opens - b.opens);
    for (const slot of slots) {
      const inMinutes = offset * 1440 + slot.opens - minutes;
      if (inMinutes > 0) {
        return { dow: day, dayOffset: offset, opens: slot.opens, inMinutes };
      }
    }
  }
  return null;
}

function todayHoursLabel(hours, dow) {
  const slots = slotsFor(hours, dow).sort((a, b) => a.opens - b.opens);
  if (slots.length === 0) return 'Closed today';
  return slots.map((s) => `${formatMinutes(s.opens)} – ${formatMinutes(s.closes)}`).join(', ');
}

/** Sunday-first week, ready to render as a table on the business page. */
export function weekSchedule(hours, tzOffsetMinutes = 0, now = Date.now()) {
  const { dow: today } = localNow(tzOffsetMinutes, now);
  return DAY_NAMES.map((name, dow) => {
    const slots = slotsFor(hours, dow).sort((a, b) => a.opens - b.opens);
    return {
      dow,
      day: name,
      short: DAY_SHORT[dow],
      isToday: dow === today,
      closed: slots.length === 0,
      label: slots.length
        ? slots.map((s) => `${formatMinutes(s.opens)} – ${formatMinutes(s.closes)}`).join(', ')
        : 'Closed',
    };
  });
}
