/**
 * Testes unitários do vínculo de login: e-mail Google entre Colaborador e
 * Permissão (`usuarios`). Executar: npx tsx scripts/permissao-email.test.ts
 */
import assert from "node:assert/strict";
import { reconcileColaboradoresUsuarios } from "../src/services/configuracaoService";
import {
  contaEmailKey,
  prepareUsuarioDocument,
  validateUsuarioEmail,
} from "../src/utils/usuarioHelpers";
import type { Colaborador, Usuario } from "../src/types";

function colaborador(email: string, secao = "Seção A", secaoId = "SEC_A"): Colaborador {
  return {
    re: "111111-1",
    nome: "SILVA",
    nomeCompleto: "JOAO DA SILVA",
    postoGrad: "CB PM",
    secao,
    secaoId,
    email,
    divisaoId: "202002500",
    ativo: true,
    ordem: 1,
    observacao: "",
  } as Colaborador;
}

function permissao(email: string, secao = "Seção A", secaoId = "SEC_A"): Usuario {
  return {
    re: "111111-1",
    nome: "SILVA",
    nomeCompleto: "JOAO DA SILVA",
    postoGrad: "CB PM",
    secao,
    secaoId,
    email,
    divisaoId: "202002500",
    perfil: "Operador",
    ativo: true,
    secoesResponsaveisIds: [],
  } as Usuario;
}

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log("OK", name);
  } catch (e) {
    console.error("FAIL", name, e);
    process.exitCode = 1;
  }
}

check("e-mail alterado no colaborador passa a valer no login", () => {
  const result = reconcileColaboradoresUsuarios(
    [colaborador("novo@gmail.com")],
    [permissao("antigo@gmail.com")],
    [colaborador("antigo@gmail.com")],
    [permissao("antigo@gmail.com")]
  );
  assert.equal(result.usuarios[0]?.email, "novo@gmail.com");
  assert.equal(result.colaboradores[0]?.email, "novo@gmail.com");
});

check("e-mail alterado na permissão prevalece e volta ao cadastro", () => {
  const result = reconcileColaboradoresUsuarios(
    [colaborador("antigo@gmail.com")],
    [permissao("novo@gmail.com")],
    [colaborador("antigo@gmail.com")],
    [permissao("antigo@gmail.com")]
  );
  assert.equal(result.usuarios[0]?.email, "novo@gmail.com");
  assert.equal(result.colaboradores[0]?.email, "novo@gmail.com");
});

check("permissão legada sem e-mail herda o do cadastro", () => {
  const result = reconcileColaboradoresUsuarios(
    [colaborador("acesso@gmail.com")],
    [permissao("")],
    [colaborador("acesso@gmail.com")],
    [permissao("")]
  );
  assert.equal(result.usuarios[0]?.email, "acesso@gmail.com");
});

check("cadastro sem e-mail não apaga o vínculo de login", () => {
  const result = reconcileColaboradoresUsuarios(
    [colaborador("")],
    [permissao("acesso@gmail.com")],
    [colaborador("")],
    [permissao("acesso@gmail.com")]
  );
  assert.equal(result.usuarios[0]?.email, "acesso@gmail.com");
  assert.equal(result.colaboradores[0]?.email, "acesso@gmail.com");
});

check("e-mail é normalizado antes de virar vínculo de login", () => {
  const result = reconcileColaboradoresUsuarios(
    [colaborador("  Novo.Acesso@Gmail.COM ")],
    [permissao("antigo@gmail.com")],
    [colaborador("antigo@gmail.com")],
    [permissao("antigo@gmail.com")]
  );
  assert.equal(result.usuarios[0]?.email, "novo.acesso@gmail.com");
});

check("colaborador ativo sem permissão vira Operador automaticamente", () => {
  const result = reconcileColaboradoresUsuarios(
    [colaborador("sem.permissao@gmail.com")],
    [],
    [colaborador("")],
    []
  );
  assert.equal(result.usuarios.length, 1);
  assert.equal(result.usuarios[0]?.perfil, "Operador");
  assert.equal(result.usuarios[0]?.ativo, true);
  assert.equal(result.usuarios[0]?.email, "sem.permissao@gmail.com");
});

check("colaborador inativo permanece cadastrado e perde acesso", () => {
  const inativo = { ...colaborador("inativo@gmail.com"), ativo: false };
  const gestor = { ...permissao("inativo@gmail.com"), perfil: "Gestor" as const };
  const result = reconcileColaboradoresUsuarios(
    [inativo],
    [gestor],
    [colaborador("inativo@gmail.com")],
    [gestor]
  );
  assert.equal(result.colaboradores.length, 1);
  assert.equal(result.usuarios[0]?.perfil, "Gestor");
  assert.equal(result.usuarios[0]?.ativo, false);
});

check("reativar colaborador preserva perfil elevado", () => {
  const ativo = colaborador("gestor@gmail.com");
  const gestorInativo = {
    ...permissao("gestor@gmail.com"),
    perfil: "Gestor" as const,
    ativo: false,
  };
  const result = reconcileColaboradoresUsuarios(
    [ativo],
    [gestorInativo],
    [{ ...ativo, ativo: false }],
    [gestorInativo]
  );
  assert.equal(result.usuarios[0]?.perfil, "Gestor");
  assert.equal(result.usuarios[0]?.ativo, true);
});

check("seção vazia dos dois lados não é tratada como alteração", () => {
  const result = reconcileColaboradoresUsuarios(
    [colaborador("acesso@gmail.com", "", "")],
    [permissao("acesso@gmail.com", "", "")],
    [colaborador("acesso@gmail.com", "", "")],
    [permissao("acesso@gmail.com", "", "")]
  );
  assert.equal(result.usuarios[0]?.secao, "");
  assert.equal(result.usuarios[0]?.secaoId, "");
});

check("Gmail com ponto e +alias é a mesma conta", () => {
  assert.equal(contaEmailKey("jdsc.historia@gmail.com"), "jdschistoria@gmail.com");
  assert.equal(contaEmailKey("jdschistoria+escala@gmail.com"), "jdschistoria@gmail.com");
  assert.notEqual(contaEmailKey("jdsc.historia@outro.com"), contaEmailKey("jdschistoria@outro.com"));
});

check("duplicidade aponta o RE em conflito", () => {
  const result = validateUsuarioEmail({
    email: "jdsc.historia@gmail.com",
    re: "222222-2",
    isNew: true,
    existingUsers: [permissao("jdschistoria@gmail.com")],
  });
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.ok(result.message.includes("111111-1"));
  }
});

check("permissão gravada leva emailKey para a busca do login", () => {
  const doc = prepareUsuarioDocument(permissao("JDSC.Historia@Gmail.com "));
  assert.equal(doc.email, "jdsc.historia@gmail.com");
  assert.equal(doc.emailKey, "jdschistoria@gmail.com");

  const semEmail = prepareUsuarioDocument(permissao(""));
  assert.equal(semEmail.email, "");
  assert.equal(semEmail.emailKey, "");
});

check("e-mail livre é aceito", () => {
  const result = validateUsuarioEmail({
    email: "novo.acesso@gmail.com",
    re: "222222-2",
    isNew: true,
    existingUsers: [permissao("outro@gmail.com")],
  });
  assert.deepEqual(result, { ok: true, email: "novo.acesso@gmail.com" });
});

console.log(`\n${passed} checks finished`);
