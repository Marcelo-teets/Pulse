# Pulse LinkedIn Capture — arquitetura

## Fluxo
LinkedIn -> Chrome Extension -> Neon Function -> Postgres -> fila de sincronização -> Google Sheets.

## Segurança
A extensão v0.7 não contém segredo compartilhado. O primeiro uso exige um pairing code de uso único. O backend troca o código por um token aleatório exclusivo do dispositivo, armazena apenas SHA-256 do token e permite revogação individual. Tokens expiram em 90 dias.

## Dados
As tabelas `linkedin_profile_captures` e `linkedin_company_captures` preservam histórico. `linkedin_people`, `linkedin_companies` e `linkedin_current_roles` mantêm o estado canônico deduplicado. Metadados técnicos ficam separados em `linkedin_api_audit`.

## Resiliência
Request IDs impedem duplicação. A extensão mantém outbox local, retry automático e backoff. A fila do Sheets é idempotente por `sync_id` e não é a fonte transacional.

## Operação
`linkedin_ops_summary` expõe métricas para dashboard. `linkedin_canonical_contacts` fornece uma visão pronta para CRM/originação.
