# Benchmarks de coleta e resolução de identidade

## Objetivo

O Pulse não deve tratar o DOM do LinkedIn como banco de dados. O DOM é uma fonte de **sinais de identidade**. A aplicação deve separar:

1. **Identify** — reconhecer pessoa/empresa na página atual.
2. **Resolve** — casar os sinais com uma entidade canônica já conhecida.
3. **Enrich** — buscar/completar dados somente quando a base canônica não estiver suficientemente fresca/completa.
4. **Validate** — exigir consistência entre pessoa, empresa e identificadores.
5. **Persist** — salvar captura + entidade canônica + proveniência.

## Benchmarks usados

### Apollo

Documentação pública:
- Chrome Extension Overview: https://knowledge.apollo.io/hc/en-us/articles/4409226637453-Apollo-Chrome-Extension-Overview
- People Enrichment: https://docs.apollo.io/reference/people-enrichment
- Organization Enrichment: https://docs.apollo.io/reference/organization-enrichment
- Retrieve LinkedIn Profiles: https://docs.apollo.io/docs/retrieve-linkedin-profiles-for-prospects

Padrões úteis:
- A extensão identifica a página e tenta casá-la com o banco canônico.
- LinkedIn URL é sinal forte de identidade.
- Matching aceita múltiplos sinais e produz confiança.
- Search e enrichment são etapas diferentes.
- Empresa pode ser identificada por LinkedIn URL, domínio, website e nome.

### Lusha

Documentação pública:
- Chrome Extension: https://www.lusha.com/lusha-extension/
- Privacy notice: https://www.lusha.com/legal/privacy-notice-feb25/
- Data methodology: https://www.lusha.com/blog/what-makes-lushas-data-different/

Padrões úteis:
- A extensão é uma superfície de identificação/enriquecimento, não a única fonte de verdade.
- Registros são comparados/mesclados com base B2B própria.
- Atualização e verificação usam múltiplas fontes.

### People Data Labs

Documentação pública:
- Enrichment Testing Guide: https://www.peopledatalabs.com/data-lab/datafication/enrichment-data-testing-guide

Padrões úteis:
- LinkedIn URL é um dos inputs com maior probabilidade de match.
- Benchmarks precisam usar amostras reais e diversas de produção.
- Matching deve ser medido por precisão, cobertura e falsos positivos, não apenas preenchimento.

## Arquitetura Pulse adotada

### Thin extension

A extensão captura somente sinais necessários da página:
- URL canônica do perfil.
- nome visível.
- headline/cargo atual.
- localização.
- empresa atual visível.
- URL da empresa, quando exposta.

Ela não deve navegar para a página da empresa se o backend já tiver uma entidade canônica confiável, fresca e suficientemente completa.

### Thick resolver

Nova rota autenticada: `POST /resolve`.

Estratégias, em ordem:
1. pessoa por LinkedIn URL exata;
2. empresa vinculada à pessoa canônica;
3. empresa por LinkedIn URL exata;
4. empresa por nome exato único, com confiança menor.

Política inicial:
- match exato por LinkedIn URL: confiança 100;
- match único só por nome: confiança 85;
- base considerada fresca: 30 dias;
- cache reutilizável exige confiança >= 95 + frescor + dados úteis.

### Proveniência

A captura registra em `meta`:
- `identity_confidence`;
- `resolution_source`;
- `field_sources`.

Exemplos de fontes:
- `linkedin_profile_page`;
- `linkedin_company_about`;
- `pulse_canonical_database`;
- `manual_override`.

### Fallback

Se o resolver não tiver match reutilizável:
1. tenta URL direta da empresa;
2. tenta Experience;
3. tenta afiliação clicável;
4. abre `/company/.../about/`;
5. valida redirect e nome da empresa antes de aceitar.

Falhas do resolver por indisponibilidade do backend não devem eliminar o fallback local. Falhas de autenticação continuam fail-closed.

## Métricas de qualidade recomendadas

Para QA real, acompanhar:
- precisão de nome da pessoa;
- precisão de empresa atual;
- precisão da URL canônica da empresa;
- cobertura de localização;
- cobertura de site/headcount;
- taxa de uso do cache canônico;
- taxa de fallback para leitura da página da empresa;
- falsos positivos;
- capturas recusadas por baixa evidência;
- idade média dos dados reutilizados.

Amostra recomendada para regressão humana: perfis reais em PT/EN, pessoas com múltiplos cargos, founders, holdings, empresas com nomes semelhantes, perfis sem link direto da empresa, e diferentes layouts/A-B tests do LinkedIn.
