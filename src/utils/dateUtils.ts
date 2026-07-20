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
