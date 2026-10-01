# Pulse LinkedIn Capture v0.7

Extensão Chrome Manifest V3 para captura assistida de perfis do LinkedIn e dados da empresa atual.

## Segurança v0.7
- O pacote não contém token permanente da API.
- O Chrome é pareado uma vez com código de uso único.
- O backend entrega um token aleatório exclusivo do dispositivo e armazena somente seu hash.
- A credencial do dispositivo fica em `chrome.storage.local` com acesso restrito a `TRUSTED_CONTEXTS`.
- Credenciais podem ser revogadas individualmente no backend.
- A API registra somente telemetria técnica em tabela de auditoria; os dados comerciais continuam nas tabelas já definidas.

## Resiliência
- Service worker Manifest V3.
- Outbox local com até 100 capturas.
- Request ID idempotente.
- Retry automático com backoff exponencial.
- Badge mostra a quantidade de pendências locais.
- Captura histórica + camada canônica deduplicada de pessoas/empresas.

## Instalação
1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione esta pasta.
5. Abra a extensão e informe o código de pareamento fornecido pelo Pulse.
6. Abra um perfil `linkedin.com/in/...` e capture normalmente.
