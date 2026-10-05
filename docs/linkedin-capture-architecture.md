# Pulse LinkedIn Capture — arquitetura

## Fluxo
LinkedIn -> Chrome Extension v0.8.5 -> Neon Function/API v0.7.0 -> Postgres -> fila de sincronização -> Google Sheets.

## Segurança
A extensão não contém segredo compartilhado. O primeiro uso exige pairing code de uso único. O backend troca o código por token aleatório exclusivo do dispositivo, armazena apenas SHA-256 do token e permite revogação individual. Tokens expiram em 90 dias.

## Extração
A extensão isola o top card do perfil por múltiplos sinais do DOM. Nome, headline/cargo e empresa atual com URL `/company/` são obrigatórios. Quando esses sinais não existem de forma confiável, a captura é interrompida. A coleta da empresa usa a página `/company/.../about/` correspondente à empresa atual.

## Dados
`linkedin_profile_captures` e `linkedin_company_captures` preservam histórico. `linkedin_people`, `linkedin_companies` e `linkedin_current_roles` mantêm estado canônico deduplicado. Metadados técnicos ficam em `linkedin_api_audit`.

## Resiliência
Request IDs impedem duplicação. A extensão mantém outbox local, retry automático e backoff. A fila do Sheets usa `FOR UPDATE SKIP LOCKED` para claim concorrente e só marca como `synced` depois da escrita concluir.

## Operação
`linkedin_ops_summary` expõe métricas para dashboard. `linkedin_canonical_contacts` fornece visão pronta para CRM/originação. O Vercel Cron atual executa o worker do Sheets uma vez ao dia às 09:00 UTC no plano Hobby.
