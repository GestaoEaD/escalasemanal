# Security Specification - Weekly Schedule System (Sistema de Escala de Serviço)

## Data Invariants
1. **Usuarios**: Unique ID matching the Registro Estatístico (R.E.).
2. **Colaboradores**: Must have unique R.E., valid name, section, and rank (postoGrad).
3. **Escalas (Weekly and Alterations)**: Partitioned by document ID "year_week" (e.g. `2026_01`).
4. **Logs**: Append-only log files tracking who modified what, including user details and fields changed.

## The Dirty Dozen Payloads (Negative Tests)
1. Creating user with empty R.E.
2. Injected scripts inside user names.
3. Accessing logs with malicious queries.
4. Saving invalid status option values.
5. Deleting scales doc without validation.
6. Forging log actions with custom client side metadata.
7. Spoofing RE in global pools.
8. Writing empty schedule row structure.
9. Modifying fields in closed scale periods.
10. Attempting recursion attacks via bulk writes.
11. Changing immutable attributes like `createdAt`.
12. Poisoning ID variables.

## Verification
Rules are set to validate input shapes and document paths.
