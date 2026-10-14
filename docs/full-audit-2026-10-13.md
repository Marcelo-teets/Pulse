# Auditoria integral — Pulse — 13/10/2026

## Escopo e limitações

Inspeção independente do snapshot integral do repositório (67 arquivos versionados, aproximadamente 7.880 linhas em código/configuração/documentação), incluindo aplicativo Next.js, extensão Chrome, Neon Function, Postgres, migrations, sincronização Google Sheets, CI e documentação.

O snapshot é uma evidência do estado do código; não substitui a validação de DOM real autenticado no navegador do usuário. O Vercel Sandbox está indisponível por cota de armazenamento de snapshots (erro 402). A alternativa escolhida é GitHub Actions, CI com PostgreSQL descartável e regressões Node.

## Infraestrutura verificada

- Repositório e integridade Git: verificados.
- Gestão de usuários, autenticação, cookies, sessões e escopo multiusuário: revisados.
- Rotas de busca e paginação, operações, dashboard e fila: revisadas.
- Extração de perfil LinkedIn, resolução de empresa, company About, cache canônico, proveniência e revisão manual: revisados.
- Versionamento e Manifest V3 do Chrome: revisados.
- API Neon: pareamento, autorização, resolver, persistência, idempotência, auditoria e schema: revisados.
- Google Sheets: worker com fila, retry, sincronização e deduplicação de pessoas/empresas: revisados.
- Dependências: `npm audit --omit=dev` não apontou vulnerabilidades no snapshot auditado.
- QA: regressões específicas de múltiplos formatos LinkedIn, usuários e integração Postgres.

## Defeitos reais corrigidos nesta PR

1. **Colisão entre empresas homônimas no Sheets**: duas entidades com o mesmo nome, mas URLs LinkedIn diferentes, podiam sobrescrever a mesma linha. Agora o matching prioriza a URL canônica e exige evidência única antes de migrar uma linha legada.
2. **Empresa visual substituída silenciosamente**: a extensão alterava `person.current_company` para o nome extraído da página de destino. Agora preserva a evidência do perfil, avisa sobre a divergência e impede salvar campos inconsistentes sem revisão.
3. **URL de empresa externa aceita como candidata**: links com caminho `/company/...` em domínios que não fossem LinkedIn podiam entrar no fluxo. Agora URL de empresa exige HTTPS e hostname LinkedIn.
4. **Universidade antes do empregador no cartão**: a primeira afiliação clicável podia ser uma instituição de ensino. A experiência profissional atual com vínculo canônico passa a prevalecer em caso de conflito, com regressão dedicada.
5. **Dispositivos antigos tratados visualmente como aptos**: o painel agora destaca extensões incompatíveis com a versão mínima aceita pela API.
6. **Pessoas e empresas limitadas à primeira página**: APIs e interface agora oferecem paginação; entradas inválidas para limite/página recebem fallback controlado.

## Observação de produção

A consulta somente leitura ao banco Neon no momento da auditoria retornou **0 pessoas, 0 empresas e 0 capturas** no banco da API, com **6 dispositivos ativos por validade de credencial**, mas versões reportadas antigas (nenhum uso demonstrado da versão mais recente). Fila Sheets sem backlog não comprova sucesso quando não houve capturas. Não confundir testes automatizados verdes com aceitação de usuários reais.

## Gates antes de promover

- [ ] Frontend CI verde no mesmo SHA final.
- [ ] LinkedIn Extension CI verde no mesmo SHA final.
- [ ] Pulse Full QA verde (auditoria de dependências, regressões, Postgres real, API bundled E2E e build).
- [ ] Preview Vercel READY no mesmo SHA.
- [ ] Main e PR sem divergência.
- [ ] Merge e deploy de produção correspondendo ao SHA promovido.
- [ ] Health banco, health Neon Function, worker Sheets e runtime pós-deploy.
- [ ] Manifest na raiz do pacote instalável v0.9.2.
- [ ] Teste prático com perfis reais PT/EN e empresas diferentes (requer Chrome com LinkedIn autenticado).

## Riscos remanescentes e recomendações

- **DOM real do LinkedIn**: layouts variam entre contas, idiomas e testes A/B. Montar golden dataset de 30–50 perfis com comparação humana campo a campo e métricas de falsos positivos, priorizando company URL, cargo e empresa atual.
- **Dados canônicos**: URLs `br.linkedin.com` e `www.linkedin.com` podem representar a mesma entidade. Planejar migração de normalização/deduplicação no Neon antes de alterar chaves globais, preservando vínculos existentes.
- **Sheets**: Google Sheets é espelho operacional, não fonte transacional. Em grande volume, otimizar escrita em lotes e monitorar cota/latência do cron.
- **Configuração e QA visual**: validar diretamente login, pareamento, estados de erro, navegação em tabelas paginadas e instalação no Chrome.
- **Formatação e manutenção**: ferramentas de lint sinalizam divergências de estilo em grande parte do código legado; formatar separadamente para evitar misturar churn cosmético com correções funcionais.

**Política de qualidade:** não afirmar eficácia integral ou ausência absoluta de bugs sem teste controlado de produção e validação humana dos perfis reais.
