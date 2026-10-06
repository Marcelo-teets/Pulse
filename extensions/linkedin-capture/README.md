# Pulse LinkedIn Capture v0.8.9

Extensão Chrome Manifest V3 para captura assistida de perfis do LinkedIn e dados da empresa atual.

## Segurança
- O pacote não contém token permanente da API.
- O Chrome é pareado com código de uso único e expiração curta.
- O backend entrega um token aleatório exclusivo do dispositivo e armazena somente seu hash.
- A credencial do dispositivo fica em `chrome.storage.local` com acesso restrito a `TRUSTED_CONTEXTS`.
- Tokens expiram em 90 dias e podem ser revogados individualmente.
- A API registra telemetria técnica sem expor credenciais.

## Captura
- O extrator trabalha somente em `linkedin.com/in/...`.
- Nome, cargo/headline e uma empresa atual demonstrável no perfil são obrigatórios. A URL canônica da empresa precisa ser resolvida antes do salvamento.
- Se a identidade do perfil não puder ser comprovada no DOM, a captura falha fechada em vez de salvar dados aproximados.
- A empresa atual é obtida do cabeçalho ou da experiência atual, nunca de cards laterais/Atividades.
- A página da empresa é aberta em segundo plano para coletar descrição, site e faixa de funcionários.

## Resiliência
- Service worker Manifest V3.
- Outbox local com até 100 capturas.
- Request ID idempotente.
- Retry automático com backoff exponencial.
- Badge mostra pendências locais.
- Captura histórica + camada canônica deduplicada de pessoas/empresas.
- Content script possui guard por versão para evitar código antigo preso em abas já abertas.

## Instalação
1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `extensions/linkedin-capture`.
5. Confirme que o popup mostra **v0.8.9**.
6. Faça o pareamento usando o código fornecido pelo Pulse.
7. Recarregue a aba do LinkedIn após atualizar a extensão.
8. Abra um perfil `linkedin.com/in/...` e capture.
