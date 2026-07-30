/**
 * FrequenciaApp — fluxo Ano → Seção → Mês → Editor.
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

  // Editor: seção + mês
  if (secaoId && month) {
    return (
      <FrequenciaEditor
        usuario={usuario}
        year={year}
        month={month}
        secaoId={secaoId}
        secao={displaySecao}
        onBack={() => onNavigateFrequencia({ year, secaoId, secao: displaySecao || undefined })}
        onOpenApproval={onOpenApproval}
      />
    );
  }

  // Após escolher a seção: selecionar o mês
  if (secaoId) {
    return (
      <FrequenciaMonthSelector
        usuario={usuario}
        year={year}
        secaoId={secaoId}
        secao={displaySecao}
        onBack={() => onNavigateFrequencia({ year })}
        onSelectMonth={(m) =>
          onNavigateFrequencia({
            year,
            secaoId,
            secao: displaySecao || undefined,
            month: m,
          })
        }
      />
    );
  }

  // Primeiro passo: seções disponíveis
  return (
    <FrequenciaSecaoSelector
      usuario={usuario}
      year={year}
      onBack={onBack}
      onSelectSecao={(nextSecaoId) =>
        onNavigateFrequencia({ year, secaoId: nextSecaoId })
      }
    />
  );
}
