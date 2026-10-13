# Pulse — Fases 1, 2, 3 e 4 | Plano de aceite e evidências (13/10/2026)

## Escopo entregue na branch
- **Fase 1:** Extensão Chrome v0.9.2 herdada da PR #13. Nova página /qualidade, API /api/quality, marcação manual por campo e cálculo de precisão observada. Sem dados reais rotulados, a métrica aparece **sem amostra**, nunca como 100%.
- **Fase 2:** Score de evidência por completude e divergência da identidade empresa-perfil. Review não substitui silenciosamente dados brutos. Histórico de alterações **observadas** em /api/intelligence/history via trigger transacional, sem alegar histórico integral do LinkedIn.
- **Fase 3:** /api/operations/health, observabilidade de falhas, itens travados e versões de dispositivos; reprocessamento idempotente em fila por /api/operations/retry (master). Cron Google Sheets existente no Vercel Hobby mantido em 09:00 UTC. Nenhum agente pago/serviço novo.
- **Fase 4:** /inteligencia: filtros e scoring DCM indicativo com motivos, baseado apenas em textos realmente capturados; CSV de pessoas e empresas, limitado a 2.000 registros, escopado por usuário e protegido contra injeção de fórmulas; histórico de mudanças profissionais.

## QA automatizado
- Validação Manifest Chrome v3, versionamento v0.9.2, sintaxe da extensão e testes do extrator.
- Testes de cenários sintéticos em diferentes arranjos de DOM, não equivalentes a 30–50 perfis reais.
- Testes unitários com 40 registros **sintéticos**: precisão por campo, amostra insuficiente, negativo/falso positivo, conflitos de identidade, scoring não factual e CSV seguro.
- Postgres descartável do Full QA: schema v7, revisão de campo, gatilho de mudança de cargo, multiusuário; build Next.js e API Neon E2E.
- CI em GitHub Actions: **a conclusão do workflow no SHA final** é a evidência real. Não considerar o texto desta documentação prova de execução.

## Aceite factual obrigatório — 30 a 50 perfis REAIS
O Pulse **não possui autorização de sessão LinkedIn** no ambiente de CI e não pode simular testes reais. Executar a v0.9.2 em Chrome autenticado (manual e autorizado) e registrar os perfis no painel /qualidade.

Amostra proposta de 40 perfis sem selecionar somente casos fáceis:
- 10 em português com vinculação de empresa por URL.
- 10 com interface/perfil em inglês e localizações variadas.
- 10 com múltiplas experiências, universidades e afiliações não empregadoras.
- 10 com empresa alterada, homônimas ou botão de empresa sem href canônico.

Para cada perfil, confirmar visualmente na fonte os 10 campos:
1. Nome
2. URL canônica da pessoa
3. Localização
4. Cargo atual
5. Empresa atual no perfil
6. Nome da empresa na página correspondente
7. URL canônica da empresa
8. Descrição
9. Site
10. Número de funcionários

Na página **/qualidade**, selecionar a captura e avaliar cada campo como `correct`, `incorrect` (exige valor correto) ou `unknown` (não visível); verificar origem e data da captura antes de rotular. A métrica da precisão usa **corretos / (corretos + incorretos)**; desconhecidos não entram no denominador, mas diminuem cobertura.

Gate de aceite numérico: 30–50 perfis distintos revisados, pelo menos 30 observações válidas para cada campo crítico (nome, cargo, empresa atual e URL LinkedIn da empresa) e precisão **>= 98% em cada campo crítico**. Mesmo com gate numérico verde, confirmar persistência da captura correta no Neon, visibilidade na página Pessoas, sincronização do registro na planilha e integridade das permissões.

Um `quality_score` derivado da existência dos campos ou dos logs da extensão **não mede precisão factual**. Não usar esse score como homologação. O sistema pode ter alto preenchimento e campos errados.

## Deploy e rollback
1. Esperar **Frontend CI**, **LinkedIn Extension CI** e **Pulse Full QA** verdes no **mesmo SHA**.
2. Confirmar Vercel preview em READY e verificar autenticação, /qualidade, /inteligencia, /operacao e downloads CSV.
3. Aplicar schema v7 via migração integrada após aprovação; validar tabelas `pulse_capture_reviews`, `pulse_role_events`.
4. Revisar dados/versões Neon e Sheets sem inserir dados sintéticos em produção.
5. Não mesclar PR até homologação real documentada; comparar SHA da Vercel com GitHub main antes de declarar produção.
6. Em rollback de código, **não apagar tabelas de revisão e histórico**: dados preservados, versão anterior ignora tabelas extras. Trigger só grava eventos de alteração, não altera vínculo atual.

## Segurança e limites
- Captura assistida por interação e conta autorizada; sem automação para superar limitações de acesso do LinkedIn.
- Métricas e revisões apenas para usuário `master`; exportações e histórico respeitam escopo multiusuário.
- Não coletar mais dados pessoais do que o necessário; minimizar retenção e permitir revisão das rotinas de exclusão LGPD.
- Fit DCM não é análise de crédito nem prova de necessidade de captação, e deve ser confirmado comercialmente.
- Não prometer dados de produção ou precisão real até a execução dos testes autenticados.

## Auditoria adicional — 13/10/2026 — normalização e sincronização
- Código atualizado na branch `feat/pulse-qa-intelligence-2026-10-13`: `lib/linkedin-identity.js` é o normalizador compartilhado de pessoas e empresas. Neon Function, matcher do Google Sheets e cálculo de precisão utilizam URLs HTTPS `www.linkedin.com` sem parâmetros ou variações `br.linkedin.com`. URLs de domínios parecidos, HTTP, credenciais e slugs com barra codificada são rejeitadas.
- O cálculo de precisão agora considera apenas o resultado mais recente por **identidade canônica de perfil e campo**. Quarenta capturas do mesmo perfil não equivalem a quarenta perfis reais; novas regressões cobrem duplicatas e alteração da avaliação.
- GitHub Actions após correções, commit `ed2d01be4267700dc53fd1cfe3e98a81ee5168ae`: [Frontend CI #174](https://github.com/Marcelo-teets/Pulse/actions/runs/38440180688), [LinkedIn Extension CI #139](https://github.com/Marcelo-teets/Pulse/actions/runs/38440180826) e [Pulse Full QA #129](https://github.com/Marcelo-teets/Pulse/actions/runs/38440180659) concluídos com sucesso. **Reexecutar os mesmos gates se houver alterações posteriores**.
- Neon produção `little-hat-27601841`: 0 capturas de perfis, 0 perfis distintos, 0 capturas de empresas e seis dispositivos antigos; portanto, **nenhuma homologação factual de precisão ocorreu**.
- Google Drive contém `Pulse - LinkedIn Capture - Base de Armazenamento`, mas a Vercel registrou erro real em `/api/internal/sheets-sync`: Google Sheets API desabilitada/não utilizada no projeto Google Cloud **116474980565**. Requer habilitar **Google Sheets API** no projeto efetivamente usado pela conta de serviço e testar uma gravação verdadeira. Fila vazia não é prova de integração.
- Vercel rejeitou listar variáveis de ambiente com HTTP 403; não alterar credenciais sem escopo autorizado. Preview READY é apenas build, não smoke test autenticado.
- **Bloqueio de promoção:** cumprir issue #16 e liberar a Fase 1 antes de merge. A Fase 2, 3 e 4 permanecem na branch, mas não estão homologadas nem em produção. Não inventar testes com sessão LinkedIn ou contagens de perfil.
