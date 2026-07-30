/**
 * FrequenciaApp — fluxo Ano → Mês → Seção → Editor.
 */
import React from "react";
import { TipoEscalaDocumento, Usuario } from "../../types";
import FrequenciaMonthSelector from "./FrequenciaMonthSelector";
import FrequenciaSecaoSelector from "./FrequenciaSecaoSelector";
import FrequenciaEditor from "./FrequenciaEditor";
import { loadSecaoById } from "../../utils/secaoCodigo";
import { resolveActiveDivisaoId } from "../../utils/divisaoContext";

export type FrequenciaNavState = {
  year: number;
  month?: number;
  secaoId?: string;
  secao?: string;
};

interface Props {
  usuario: Usuario;
  year: number;
  month?: number | null;
  secaoId?: string | null;
  secao?: string | null;
  onBack: () => void;
  onOpenApproval?: (escalaId: string, tipo?: TipoEscalaDocumento) => void;
  onNavigateFrequencia: (next: FrequenciaNavState) => void;
}

export default function FrequenciaApp({
  usuario,
  year,
  month = null,
  secaoId = null,
  secao = null,
  onBack,
  onOpenApproval,
  onNavigateFrequencia,
}: Props) {
  const [secaoNome, setSecaoNome] = React.useState<string>(secao || "");

  React.useEffect(() => {
    let cancelled = false;
    if (secao) {
      setSecaoNome(secao);
      return () => {
        cancelled = true;
      };
    }
    if (!secaoId) {
      setSecaoNome("");
      return () => {
        cancelled = true;
      };
    }
    void loadSecaoById(secaoId, resolveActiveDivisaoId(usuario)).then((secaoDoc) => {
      if (!cancelled) {
        setSecaoNome(secaoDoc?.nome || secaoId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [secao, secaoId, usuario]);

  const displaySecao = secaoNome || secao || secaoId || "";

  // Editor: mês + seção
  if (month && secaoId) {
    return (
      <FrequenciaEditor
        usuario={usuario}
        year={year}
        month={month}
        secaoId={secaoId}
        secao={displaySecao}
        onBack={() => onNavigateFrequencia({ year, month })}
        onOpenApproval={onOpenApproval}
      />
    );
  }

  // Após escolher o mês: selecionar Seção
  if (month) {
    return (
      <FrequenciaSecaoSelector
        usuario={usuario}
        year={year}
        month={month}
        onBack={() => onNavigateFrequencia({ year })}
        onSelectSecao={(nextSecaoId) =>
          onNavigateFrequencia({ year, month, secaoId: nextSecaoId })
        }
      />
    );
  }

  // Primeiro passo: mês
  return (
    <FrequenciaMonthSelector
      usuario={usuario}
      year={year}
      onBack={onBack}
      onSelectMonth={(m) => onNavigateFrequencia({ year, month: m })}
    />
  );
}
