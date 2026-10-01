# Pulse

Infraestrutura e aplicações do projeto Pulse.

## LinkedIn Capture

Extensão Chrome (Manifest V3) que captura um perfil de pessoa no LinkedIn e os dados da empresa do cargo atual.

### Dados da pessoa
- Nome
- URL do LinkedIn
- Localização
- Cargo atual
- Empresa atual
- Data/hora da captura
- JSON bruto limitado aos mesmos campos

### Dados da empresa
- Nome
- Descrição
- Site
- Número/faixa de funcionários exibido pelo LinkedIn
- Data/hora da captura

## Arquitetura

LinkedIn -> Chrome Extension -> Neon Function -> Neon/Postgres -> fila de sync -> Google Sheets

- Neon project: `little-hat-27601841`
- Branch: `production`
- Database: `neondb`
- Function: `linkedin`
- Google Sheet ID: `1EKbcfGbp1lvuDSBRv4H87bqhQVx17XgUwRO9FH6iDkQ`
- Drive folder ID: `1qSOyiLFDfy2Y3iUnnDnRNzaJ5geiKLtR`

### Tabelas
- `public.linkedin_profile_captures`
- `public.linkedin_company_captures`
- `public.linkedin_sheet_sync_queue`
- `public.linkedin_capture_config`
- view `public.linkedin_sheet_sync_payload`

A planilha do Google Drive é um espelho operacional. O Neon/Postgres é a fonte transacional.

## Segurança

Não versione:
- `PULSE_EXTENSION_TOKEN`
- `DATABASE_URL`
- tokens OAuth
- credenciais Google

A extensão distribuída localmente pode receber o token por `chrome.storage.local`. Em uma futura distribuição pública, substitua o token compartilhado por autenticação individual.


## Frontend operacional

O Pulse possui um frontend Next.js preparado para Vercel.

### Rotas

- `/` — visão geral e KPIs
- `/pessoas` — base de profissionais com busca
- `/empresas` — empresas consolidadas e pessoas relacionadas
- `/sincronizacao` — fila Neon → Google Sheets
- `/api/dashboard` — dados resumidos do dashboard
- `/api/people` — consulta de pessoas
- `/api/companies` — consulta de empresas
- `/api/sync` — consulta da fila de sincronização
- `/api/health` — healthcheck da aplicação e do banco

### Ambiente

O frontend precisa de:

```bash
DATABASE_URL=postgresql://...
```

No Vercel, configure `DATABASE_URL` para o projeto Neon `little-hat-27601841`, branch `production`, database `neondb`.

### Desenvolvimento

```bash
npm install
npm run dev
```

### Build de produção

```bash
npm run build
npm start
```

O workflow `.github/workflows/frontend-ci.yml` valida o build do Next.js em cada push para `main`.

### Deploy Vercel

O projeto Vercel existente é `pulse`. A Production Branch deve ser `main` e o repositório conectado deve ser `Marcelo-teets/Pulse`.

Por segurança, o frontend trata a ausência de `DATABASE_URL` como estado degradado e continua carregando sem expor credenciais.
