# Pulse 2.0 — implementação das fases 1 a 4

## Estado e arquitetura
Branch feat/pulse-intelligence-phases-1-4, construída sobre PR #13. Código candidato, não publicado em produção.
Neon é a fonte transacional. Sheets é espelho e recebe dados pela fila existente.

## Fase 1 — Extração e validação
A extensão v0.9.2 mantém a extração fail-closed e continua sujeita ao teste de navegador real.
O módulo lib/pulse-intelligence.js calcula completude, identidade e alertas, sem confundir presença de dados com precisão.
Testes unitários incluem 40 variações SINTÉTICAS; não são 40 perfis reais.

## Fase 2 — Identidade e revisão
Rota /qualidade e API /api/quality com GET paginado e POST autenticado/escopado por usuário.
Tabela pulse_quality_reviews com estados pending, approved, rejected e justificativa humana.
Rastreamento histórico pulse_role_history por trigger de alteração de cargo/empresa no banco.
Schema runtime v7 e migração SQL 006_pulse_intelligence.sql.
Origem de cada campo é reportada na trilha de auditoria e não comprova por si só a veracidade do valor.
Aprovar uma captura NÃO altera seus dados nem a identidade canônica.

## Fase 3 — Operação e sincronização
Na tela /sincronizacao, usuário master pode acionar reprocessamento do próximo batch de falhas.
API /api/sync/retry verifica sessão, usuário master e origem HTTP antes de chamar worker com segredo interno.
Backoff exponencial na fila e job diário às 09:00 UTC no Vercel Hobby.

## Fase 4 — Inteligência de originação
Filtros por cargo/localização e histórico em /pessoas; sinais descritivos e score em /empresas.
CSV autenticado de até 5000 registros, protegido contra fórmula de planilha.
Os sinais são heurísticos, NÃO representam rating, elegibilidade de operação ou estimativa de PL/FIDC.

## Gates de aceitação
1. Frontend CI, LinkedIn Extension CI, Pulse Full QA e Vercel preview no SHA final.
2. Teste manual com 30–50 perfis reais PT/EN e suas empresas atuais, com comparação campo a campo.
3. Validar isolamento multiusuário, identidade, tela Qualidade, revisão, exportação, histórico e sync.
4. Validar Neon schema v7 e gatilhos, worker Sheets real, fila e autenticação.
5. Somente depois promover PRs e conferir produção.
6. Zero associações incorretas de empresas na amostra controlada não garante 100% de acerto futuro.