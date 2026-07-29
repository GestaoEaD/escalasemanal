# Matriz final de permissões

`secaoId` identifica lotação e particiona documentos de escala/frequência.
Dentro da própria Divisão, **não** limita o acesso de Operador, Gestor ou Administrador.
Somente o **Gerente** cruza Divisões e administra recursos globais.

## Perfis

| Funcionalidade | Operador | Gestor | Administrador | Gerente |
|---|---|---|---|---|
| Trocar Divisão | Não | Não | Não | Sim |
| Selecionar qualquer Seção da própria Divisão | Sim | Sim | Sim | Sim (todas) |
| Editar escala / frequência (conforme status) | Sim | Não | Sim | Sim |
| Enviar para aprovação | Sim | Não | Sim | Sim |
| Aprovar / solicitar revisão / reabrir | Não | Sim | Não | Sim |
| Ver pendências da Divisão | Não | Sim | Não | Sim |
| Exportar | Sim | Sim | Sim | Sim |
| CRUD Seções / Postos / Colaboradores | Não | Não | Própria Divisão | Todas |
| Usuários / perfis | Não | Não | Op/Gestor/Admin (própria Divisão) | Todos + Gerente |
| Legendas (catálogo global) | Leitura | Leitura | Leitura | CRUD |
| Configurações Gerais | Não | Não | Não | Sim |
| Divisões | Não | Não | Não | CRUD |
| Central de Testes / diagnósticos | Não | Não | Não | Sim |
| Logs | Não | Não | Própria Divisão | Global |

## IDs físicos

- Escala: `{divisaoId}__{secaoId}__{ano}__{semana}`
- Frequência: `{divisaoId}__{secaoId}__{ano}__{mes}`
- Colaborador: `{divisaoId}__{re}`
- Legenda: `{sigla}` (global, sem `divisaoId`)

## Inventário de UI

O inventário operacional (tela → botão → perfil) vive em
`src/utils/testCenter/inventory.ts` e é exercitado pela Central de Testes (Gerente).
