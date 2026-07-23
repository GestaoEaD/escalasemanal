/**
 * Contorno em gradiente para cards de semana/mês.
 * Prioridade: aguardando > 100% aprovado > atual > futuro/passado (cinza).
 */
import type { CSSProperties } from "react";

export type CardBorderTone =
  | "aguardando"
  | "aprovada"
  | "atual"
  | "futuro"
  | "passado";

const GRADIENTS: Record<CardBorderTone, string> = {
  aguardando: "linear-gradient(135deg, #f5d76e 0%, #c9a227 55%, #8a6d1a 100%)",
  aprovada: "linear-gradient(135deg, #86efac 0%, #22c55e 50%, #15803d 100%)",
  atual: "linear-gradient(135deg, #93c5fd 0%, #3b82f6 50%, #1d4ed8 100%)",
  futuro: "linear-gradient(135deg, #e5e7eb 0%, #9ca3af 55%, #6b7280 100%)",
  passado: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 55%, #9ca3af 100%)",
};

export function cardBorderStyle(tone: CardBorderTone): CSSProperties {
  const fill =
    tone === "aprovada"
      ? "#f0fdf4"
      : tone === "aguardando"
        ? "#fffbeb"
        : tone === "atual"
          ? "#eff6ff"
          : tone === "passado"
            ? "#f3f4f6"
            : "#ffffff";

  return {
    border: "2px solid transparent",
    backgroundImage: `linear-gradient(${fill}, ${fill}), ${GRADIENTS[tone]}`,
    backgroundOrigin: "border-box",
    backgroundClip: "padding-box, border-box",
  };
}

export function resolveWeekCardTone(options: {
  weeklyStatus: string;
  altStatus: string;
  temporal: "current" | "past" | "future";
}): CardBorderTone {
  const waiting =
    options.weeklyStatus === "aguardando_aprovacao" ||
    options.altStatus === "aguardando_aprovacao";
  if (waiting) return "aguardando";

  const fullyApproved =
    options.weeklyStatus === "aprovada" && options.altStatus === "aprovada";
  if (fullyApproved) return "aprovada";

  if (options.temporal === "current") return "atual";
  if (options.temporal === "future") return "futuro";
  return "passado";
}

export function resolveMonthCardTone(options: {
  status?: string;
  year: number;
  month: number;
  now?: Date;
}): CardBorderTone {
  if (options.status === "aguardando_aprovacao") return "aguardando";
  if (options.status === "aprovada") return "aprovada";

  const now = options.now ?? new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (options.year === y && options.month === m) return "atual";
  if (options.year > y || (options.year === y && options.month > m)) {
    return "futuro";
  }
  return "passado";
}
