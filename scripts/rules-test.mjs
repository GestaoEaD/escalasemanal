/**
 * Banco de testes das regras do Firestore (API oficial firebaserules:test).
 * Avalia o firestore.rules local contra requisições simuladas de cada perfil,
 * sem tocar em dados reais.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/rules-test.mjs
 */
import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

const project = "escalaead";
const DB = "(default)";
const P = (col, id) => `/databases/${DB}/documents/${col}/${id}`;

const DIV_A = "202002500";
const DIV_B = "202001800";

const PERFIS = {
  gerente: { email: "gerente@x.com", re: "124342-0", perfil: "Gerente", divisaoId: DIV_A },
  admin: { email: "admin@x.com", re: "962596-8", perfil: "Administrador", divisaoId: DIV_A },
  gestor: { email: "gestor@x.com", re: "111111-1", perfil: "Gestor", divisaoId: DIV_A },
  operador: { email: "op@x.com", re: "222222-2", perfil: "Operador", divisaoId: DIV_A },
};

/** Mocks de get()/exists() em auth_index para o caller. */
function authMocks(p) {
  const path = P("auth_index", p.email);
  return [
    { function: "exists", args: [{ exact_value: path }], result: { value: true } },
    {
      function: "get",
      args: [{ exact_value: path }],
      result: {
        value: { data: { perfil: p.perfil, divisaoId: p.divisaoId, re: p.re, email: p.email } },
      },
    },
  ];
}

const casos = [];
function caso(nome, perfilKey, { method, col, id, resource, data, expect, extraMocks = [] }) {
  const p = PERFIS[perfilKey];
  casos.push({
    nome: `[${p.perfil}] ${nome}`,
    esperado: expect,
    testCase: {
      expectation: expect,
      request: {
        auth: { uid: p.re, token: { email: p.email, email_verified: true } },
        path: P(col, id),
        method,
        ...(data ? { resource: { data } } : {}),
      },
      ...(resource !== undefined ? { resource: resource ? { data: resource } : null } : {}),
      functionMocks: [...authMocks(p), ...extraMocks],
    },
  });
}

// ---- Foco do bug: abrir escala inexistente numa Divisão nova ----
for (const k of ["gerente", "admin", "gestor", "operador"]) {
  caso("get escala INEXISTENTE (Divisão nova)", k, {
    method: "get",
    col: "escalas_semanais",
    id: `${DIV_B}_2026_31`,
    resource: null,
    expect: "ALLOW",
  });
  caso("get escala existente da própria Divisão", k, {
    method: "get",
    col: "escalas_semanais",
    id: `${DIV_A}_2026_31`,
    resource: { divisaoId: DIV_A, status: "em_edicao" },
    expect: "ALLOW",
  });
  caso("get controle_frequencia INEXISTENTE", k, {
    method: "get",
    col: "controle_frequencia",
    id: `${DIV_B}_2026_07`,
    resource: null,
    expect: "ALLOW",
  });
  caso("get colaborador INEXISTENTE", k, {
    method: "get",
    col: "colaboradores",
    id: "nao-existe",
    resource: null,
    expect: "ALLOW",
  });
}

// ---- Isolamento entre Divisões (não-Gerente não lê outra Divisão) ----
for (const k of ["admin", "gestor", "operador"]) {
  caso("get escala de OUTRA Divisão deve negar", k, {
    method: "get",
    col: "escalas_semanais",
    id: `${DIV_B}_2026_31`,
    resource: { divisaoId: DIV_B, status: "em_edicao" },
    expect: "DENY",
  });
  caso("get colaborador de OUTRA Divisão deve negar", k, {
    method: "get",
    col: "colaboradores",
    id: "x",
    resource: { divisaoId: DIV_B },
    expect: "DENY",
  });
}
caso("get escala de OUTRA Divisão é permitido", "gerente", {
  method: "get",
  col: "escalas_semanais",
  id: `${DIV_B}_2026_31`,
  resource: { divisaoId: DIV_B, status: "em_edicao" },
  expect: "ALLOW",
});

// ---- Criação de escala na Divisão ativa ----
for (const [k, exp] of [["gerente", "ALLOW"], ["admin", "ALLOW"], ["operador", "ALLOW"], ["gestor", "DENY"]]) {
  caso("create escala em_edicao na própria Divisão", k, {
    method: "create",
    col: "escalas_semanais",
    id: `${DIV_A}_2026_31`,
    resource: null,
    data: { divisaoId: DIV_A, status: "em_edicao", ano: 2026, semana: 31 },
    expect: exp,
  });
}
caso("create escala em Divisão nova (Gerente)", "gerente", {
  method: "create",
  col: "escalas_semanais",
  id: `${DIV_B}_2026_31`,
  resource: null,
  data: { divisaoId: DIV_B, status: "em_edicao", ano: 2026, semana: 31 },
  expect: "ALLOW",
});

// ---- Divisões ----
caso("create divisão", "gerente", {
  method: "create", col: "divisoes", id: DIV_B, resource: null,
  data: { codigo: DIV_B, nome: "Div Ens Pesq", ativo: true }, expect: "ALLOW",
});
caso("create divisão deve negar", "admin", {
  method: "create", col: "divisoes", id: DIV_B, resource: null,
  data: { codigo: DIV_B, nome: "X", ativo: true }, expect: "DENY",
});
for (const k of ["admin", "gestor", "operador"]) {
  caso("list/get divisões (para seletor)", k, {
    method: "get", col: "divisoes", id: DIV_A,
    resource: { codigo: DIV_A, nome: "EaD", ativo: true }, expect: "ALLOW",
  });
}

// ---- Seções (necessário para vincular colaborador) ----
for (const [k, exp] of [["gerente", "ALLOW"], ["admin", "ALLOW"], ["gestor", "DENY"], ["operador", "DENY"]]) {
  caso("create seção na própria Divisão", k, {
    method: "create", col: "secoes", id: "P1", resource: null,
    data: { nome: "P/1", divisaoId: DIV_A }, expect: exp,
  });
}
caso("create seção em Divisão nova", "gerente", {
  method: "create", col: "secoes", id: "NOVA", resource: null,
  data: { nome: "Nova", divisaoId: DIV_B }, expect: "ALLOW",
});

// ---- Logs (auditoria) ----
caso("create log com timestamp do servidor", "gerente", {
  method: "create", col: "logs", id: "LOG-000999", resource: null,
  data: { timestamp: "request.time", divisaoId: DIV_A, tipo: "ALTERAR_CONFIGURACAO" },
  expect: "ALLOW",
});

async function main() {
  const auth = new GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const source = {
    files: [{ name: "firestore.rules", content: readFileSync("firestore.rules", "utf8") }],
  };

  const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${project}:test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source, testSuite: { testCases: casos.map((c) => c.testCase) } }),
  });
  const json = await res.json();

  if (json.error) {
    console.error("ERRO NA API:", JSON.stringify(json.error).slice(0, 1200));
    process.exit(1);
  }
  if (json.issues?.length) {
    console.error("PROBLEMAS NO RULES:");
    for (const i of json.issues) console.error(`  ${i.severity} ${i.description} (linha ${i.sourcePosition?.line})`);
  }

  const results = json.testResults || [];
  let falhas = 0;
  for (let i = 0; i < casos.length; i++) {
    const c = casos[i];
    const r = results[i];
    const state = r?.state || "SEM RESULTADO";
    const ok = state === "SUCCESS";
    if (!ok) falhas++;
    console.log(`${ok ? "PASS" : "FALHA"}  ${c.nome}  (esperado ${c.esperado})`);
    if (!ok && r?.errorPosition) {
      console.log(`        erro na linha ${r.errorPosition.line} do rules`);
    }
    if (!ok && r?.debugMessages?.length) {
      console.log(`        ${r.debugMessages.slice(0, 2).join(" | ")}`);
    }
  }
  console.log(`\n${casos.length - falhas}/${casos.length} passaram | ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
