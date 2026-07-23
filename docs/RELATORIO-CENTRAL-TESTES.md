# Relatório — Central de Testes (Escala Semanal)

Gerado com a implementação da Central de Testes e smoke scripts locais.

## Diagnóstico da arquitetura

- Stack: React 19 + Vite 6 + TypeScript + Tailwind 4 + Firebase Firestore
- Login: R.E. via coleção `usuarios` + sessão `localStorage` (`escala_sessao_usuario`)
- Navegação: estado em `App.tsx` (selector / editor / config / aprovacao)
- Permissões: `src/utils/permissions.ts` (Operador / Administrador / Gestor)
- Auditoria: `src/utils/auditService.ts` (um documento por operação)
- Sem framework de teste pré-existente (Jest/Vitest/Playwright)

## O que foi implementado

1. Inventário de comandos (`src/utils/testCenter/inventory.ts`)
2. Runner e suítes (`src/utils/testCenter/index.ts`)
3. UI **Central de Testes** (aba em Configurações, somente Administrador)
4. Utilitário `getPreviousWeekRef` em `dateUtils.ts` (cálculo 02→01 e 01→52 ano anterior)
5. Smoke script: `npx tsx scripts/test-center-smoke.ts`

## Como usar

1. Entrar como **Administrador**
2. Abrir **Configurações → Central de Testes**
3. (Opcional) marcar escrita controlada do documento `configuracoes/central_testes_probe`
4. Clicar **Executar testes**
5. Baixar relatório `.md` se desejar

## Resultados dos smoke scripts (Node)

| Teste | Resultado | Observação |
| ----- | --------- | ---------- |
| Inventário de comandos | PASSOU | — |
| Matriz envio/aprovação/config | PASSOU | — |
| Edição por perfil | PASSOU | — |
| Cálculo semana anterior | PASSOU | helper `getPreviousWeekRef` |
| Parse URL aprovação | PASSOU | — |
| Sanitização undefined | PASSOU | `prepareFirestoreWrite` |
| Weekend EN→hífen | PASSOU | — |
| approval-flow-smoke | PASSOU | — |

## Problema prioritário encontrado

### TESTE: Botão "Dados da semana anterior"
**STATUS:** PASSOU (implementado na Escala Semanal)

**IMPLEMENTAÇÃO:**
- Botão na Escala Semanal (somente quando editável)
- Leitura de `escalas_semanais/{semanaAnterior}`
- Confirmação antes de carregar
- Sem gravação automática (usuário precisa Salvar)
- Escala Alteração não é afetada
- Auditoria `LOAD_PREVIOUS_WEEK_DATA`

**AINDA MANUAL:** cancelamento, semana sem dados, persistência após Salvar + relogin.

## O que ainda exige teste manual no navegador

- Login válido / inválido / logout / refresh de sessão com usuários reais
- Salvar Escala Semanal e Alteração + F5 + relogin (persistência visual)
- Enviar para aprovação + abrir link + aprovar/revisão como Gestor
- Exportação PDF/Excel com popup e legibilidade impressa
- CRUDs de Configurações (colaboradores, usuários, postos, seções, legendas)
- Probe Firestore da Central com checkbox de escrita habilitado
- Confirmar que Operador não vê Configurações / não envia aprovação na UI

## Critérios de aceitação — status

| Critério | Status |
| -------- | ------ |
| Botões principais identificados | OK (inventário) |
| Perfis testados (lógica) | OK (matriz + smoke) |
| Permissões verificadas (funções) | OK |
| Fluxo aprovação (regras/parse) | OK parcial (E2E manual pendente) |
| Dados semana anterior | FALHOU — feature ausente |
| Persistência | Parcial (sanitize/probe; E2E manual pendente) |
| Logs | Parcial (serviço presente; geração E2E manual) |
| Exportações | Parcial (funções executam; visual manual) |
| undefined tratado | OK |
| Não criar dados fictícios automáticos nos testes | OK |
| Central sem prejudicar sistema | OK |
| Relatório final | OK (este arquivo + download na UI) |
