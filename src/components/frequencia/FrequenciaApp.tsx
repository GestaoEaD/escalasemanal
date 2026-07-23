import React, { useState } from "react";
import { TipoEscalaDocumento, Usuario } from "../../types";
import FrequenciaMonthSelector from "./FrequenciaMonthSelector";
import FrequenciaSecaoSelector from "./FrequenciaSecaoSelector";
import FrequenciaEditor from "./FrequenciaEditor";

interface Props {
  usuario: Usuario;
  year: number;
  onBack: () => void;
  onOpenApproval?: (escalaId: string, tipo?: TipoEscalaDocumento) => void;
}

type Step = "meses" | "secoes" | "editor";

export default function FrequenciaApp({
  usuario,
  year,
  onBack,
  onOpenApproval,
}: Props) {
  const [step, setStep] = useState<Step>("meses");
  const [month, setMonth] = useState<number | null>(null);
  const [secao, setSecao] = useState<string | null>(null);

  if (step === "editor" && month && secao) {
    return (
      <FrequenciaEditor
        usuario={usuario}
        year={year}
        month={month}
        secao={secao}
        onBack={() => setStep("secoes")}
        onOpenApproval={onOpenApproval}
      />
    );
  }

  if (step === "secoes" && month) {
    return (
      <FrequenciaSecaoSelector
        usuario={usuario}
        year={year}
        month={month}
        onBack={() => {
          setSecao(null);
          setStep("meses");
        }}
        onSelectSecao={(s) => {
          setSecao(s);
          setStep("editor");
        }}
      />
    );
  }

  return (
    <FrequenciaMonthSelector
      usuario={usuario}
      year={year}
      onBack={onBack}
      onSelectMonth={(m) => {
        setMonth(m);
        setStep("secoes");
      }}
    />
  );
}
