import React from "react";
import { TipoEscalaDocumento, Usuario } from "../../types";
import FrequenciaMonthSelector from "./FrequenciaMonthSelector";
import FrequenciaSecaoSelector from "./FrequenciaSecaoSelector";
import FrequenciaEditor from "./FrequenciaEditor";

export type FrequenciaNavState = {
  year: number;
  month?: number;
  secao?: string;
};

interface Props {
  usuario: Usuario;
  year: number;
  /** Controlado pela URL: secao → mês → editor. */
  month?: number | null;
  secao?: string | null;
  onBack: () => void;
  onOpenApproval?: (escalaId: string, tipo?: TipoEscalaDocumento) => void;
  onNavigateFrequencia: (next: FrequenciaNavState) => void;
}

export default function FrequenciaApp({
  usuario,
  year,
  month = null,
  secao = null,
  onBack,
  onOpenApproval,
  onNavigateFrequencia,
}: Props) {
  // Editor: seção + mês
  if (secao && month) {
    return (
      <FrequenciaEditor
        usuario={usuario}
        year={year}
        month={month}
        secao={secao}
        onBack={() => onNavigateFrequencia({ year, secao })}
        onOpenApproval={onOpenApproval}
      />
    );
  }

  // Meses da seção
  if (secao) {
    return (
      <FrequenciaMonthSelector
        usuario={usuario}
        year={year}
        secao={secao}
        onBack={() => onNavigateFrequencia({ year })}
        onSelectMonth={(m) => onNavigateFrequencia({ year, secao, month: m })}
      />
    );
  }

  // Primeiro passo: seções
  return (
    <FrequenciaSecaoSelector
      usuario={usuario}
      year={year}
      onBack={onBack}
      onSelectSecao={(s) => onNavigateFrequencia({ year, secao: s })}
    />
  );
}
