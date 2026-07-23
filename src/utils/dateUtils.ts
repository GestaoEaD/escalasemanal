export interface WeekInfo {
  numero: number; // 1 to 52 or 53
  label: string; // "Semana 01"
  periodo: string; // "05 Jan a 11 Jan"
  id: string; // "year_week" e.g. "2026_01"
  startDate: Date;
  endDate: Date;
}

const MESES_ABR = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export function getFirstMondayOfYear(year: number): Date {
  const date = new Date(year, 0, 1);
  const day = date.getDay();
  if (day !== 1) {
    let daysToAdd = (8 - day) % 7;
    if (day === 0) daysToAdd = 1; // Sunday is 0, add 1 day to reach Monday
    date.setDate(date.getDate() + daysToAdd);
  }
  return date;
}

export function getWeeksForYear(year: number): WeekInfo[] {
  const weeks: WeekInfo[] = [];
  const firstMonday = getFirstMondayOfYear(year);
  const current = new Date(firstMonday);

  // Generate 52 weeks for the year (standard)
  for (let i = 1; i <= 52; i++) {
    const monday = new Date(current);
    const sunday = new Date(current);
    sunday.setDate(current.getDate() + 6);

    const startDia = String(monday.getDate()).padStart(2, "0");
    const startMes = MESES_ABR[monday.getMonth()];
    const endDia = String(sunday.getDate()).padStart(2, "0");
    const endMes = MESES_ABR[sunday.getMonth()];

    const periodo = `${startDia} ${startMes} a ${endDia} ${endMes}`;
    const label = `Semana ${String(i).padStart(2, "0")}`;
    const id = `${year}_${String(i).padStart(2, "0")}`;

    weeks.push({
      numero: i,
      label,
      periodo,
      id,
      startDate: monday,
      endDate: sunday,
    });

    // Advance to next Monday
    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

/** Chaves de coluna das escalas semanais (segunda → domingo). */
export type WeekDayKey = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export const WEEK_DAY_KEYS: WeekDayKey[] = [
  "seg",
  "ter",
  "qua",
  "qui",
  "sex",
  "sab",
  "dom",
];

const WEEKDAY_ABBR_MON_FIRST = [
  "SEG",
  "TER",
  "QUA",
  "QUI",
  "SEX",
  "SÁB",
  "DOM",
] as const;

/** Índice JS getDay(): 0=domingo … 6=sábado */
const WEEKDAY_ABBR_SUN0 = [
  "DOM",
  "SEG",
  "TER",
  "QUA",
  "QUI",
  "SEX",
  "SÁB",
] as const;

/** Ex.: SEG (10) */
export function formatDayColumnLabel(
  weekdayAbbr: string,
  dayOfMonth: number
): string {
  return `${weekdayAbbr} (${dayOfMonth})`;
}

/**
 * Cabeçalhos Seg–Dom com o dia do mês da semana (a partir da segunda).
 * Ex.: SEG (10), TER (11), …
 */
export function getWeekDayColumnHeaders(weekStartMonday: Date): {
  key: WeekDayKey;
  label: string;
  dayOfMonth: number;
}[] {
  const y = weekStartMonday.getFullYear();
  const m = weekStartMonday.getMonth();
  const base = weekStartMonday.getDate();
  return WEEK_DAY_KEYS.map((key, i) => {
    const d = new Date(y, m, base + i);
    const dayOfMonth = d.getDate();
    return {
      key,
      dayOfMonth,
      label: formatDayColumnLabel(WEEKDAY_ABBR_MON_FIRST[i], dayOfMonth),
    };
  });
}

/**
 * Cabeçalho de um dia do mês no Controle de Frequência.
 * Ex.: dia 10/07/2026 (sexta) → SEX (10)
 */
export function getMonthDayColumnLabel(
  year: number,
  month: number,
  day: number
): string {
  const d = new Date(year, month - 1, day);
  return formatDayColumnLabel(WEEKDAY_ABBR_SUN0[d.getDay()], day);
}

/**
 * Identifica a semana imediatamente anterior no calendário do sistema.
 * - Semana N (N>1) → Semana N-1 do mesmo ano
 * - Semana 01 → última semana gerada para o ano anterior (via getWeeksForYear)
 *
 * Não consulta Firestore, não cria documentos e não busca dados.
 */
export function getPreviousWeekRef(
  year: number,
  weekNumber: number
): { year: number; weekNumber: number; id: string; label: string } {
  if (!Number.isFinite(year) || !Number.isFinite(weekNumber) || weekNumber < 1) {
    throw new Error("Referência de semana inválida.");
  }

  if (weekNumber > 1) {
    const prev = Math.floor(weekNumber) - 1;
    return {
      year,
      weekNumber: prev,
      id: `${year}_${String(prev).padStart(2, "0")}`,
      label: `Semana ${String(prev).padStart(2, "0")}/${year}`,
    };
  }

  const prevYear = year - 1;
  const prevYearWeeks = getWeeksForYear(prevYear);
  if (!prevYearWeeks.length) {
    throw new Error(`Não há semanas válidas cadastradas para o ano ${prevYear}.`);
  }
  const last = prevYearWeeks[prevYearWeeks.length - 1];
  return {
    year: prevYear,
    weekNumber: last.numero,
    id: last.id,
    label: `Semana ${String(last.numero).padStart(2, "0")}/${prevYear}`,
  };
}

export function formatTimestamp(timestamp: any): string {
  if (!timestamp) return "";
  let date: Date;
  if (typeof timestamp.toDate === "function") {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }

  const dia = String(date.getDate()).padStart(2, "0");
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const ano = date.getFullYear();
  const hora = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${dia}/${mes}/${ano} às ${hora}:${min}`;
}
