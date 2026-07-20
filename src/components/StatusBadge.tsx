import React from "react";
import { EscalaStatus, ESCALA_STATUS_LABELS, ESCALA_STATUS_EMOJI } from "../types";
import { normalizeEscalaStatus } from "../utils/approvalService";

const STYLES: Record<EscalaStatus, string> = {
  em_edicao: "bg-blue-100 text-blue-800 border-blue-200",
  aguardando_aprovacao: "bg-amber-100 text-amber-800 border-amber-200",
  aprovada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejeitada: "bg-red-100 text-red-800 border-red-200",
};

interface StatusBadgeProps {
  status?: EscalaStatus | null;
  className?: string;
  size?: "sm" | "md";
  showEmoji?: boolean;
}

export default function StatusBadge({
  status,
  className = "",
  size = "sm",
  showEmoji = true,
}: StatusBadgeProps) {
  const st = normalizeEscalaStatus(status);
  const sizeCls = size === "md" ? "text-xs px-2.5 py-1" : "text-[10px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-bold uppercase tracking-wider ${STYLES[st]} ${sizeCls} ${className}`}
      title={ESCALA_STATUS_LABELS[st]}
    >
      {showEmoji && <span aria-hidden="true">{ESCALA_STATUS_EMOJI[st]}</span>}
      <span>{ESCALA_STATUS_LABELS[st]}</span>
    </span>
  );
}
