# NF-e License API

Sistema de controle de licenças para o NF-e Desktop.

## Stack
- **Next.js 14** (App Router) — Vercel
- **MongoDB Atlas** — banco de dados
- **Resend** — envio de email
- **Hotmart Webhook** — automação de compras

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Copiar variáveis de ambiente
cp .env.example .env.local
# Preencher os valores no .env.local

# 3. Rodar em desenvolvimento
npm run dev
# Acesse: http://localhost:3000
```

## Configuração dos serviços

### MongoDB Atlas
1. Criar conta em https://cloud.mongodb.com
2. Criar cluster gratuito (M0)
3. Criar usuário e liberar IP 0.0.0.0/0
4. Copiar a connection string para MONGODB_URI

### Resend (email)
1. Criar conta em https://resend.com
2. Verificar seu domínio
3. Criar API key e copiar para RESEND_API_KEY
4. Definir EMAIL_FROM com o domínio verificado

### Hotmart Webhook
1. Hotmart > Ferramentas > Webhooks
2. URL: https://SEU-PROJETO.vercel.app/api/webhook/hotmart
3. Copiar o token gerado para HOTMART_WEBHOOK_TOKEN
4. Eventos: PURCHASE_APPROVED, PURCHASE_REFUNDED, PURCHASE_CHARGEBACK

### Credenciais do admin
Definir no Vercel (ou .env.local):
- ADMIN_EMAIL=seu-email@dominio.com
- ADMIN_PASSWORD=senha-forte-aqui
- JWT_SECRET=string-aleatoria-longa

## Deploy no Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Ou conectar o repositório GitHub no painel do Vercel.

## Painel Admin
Acesse: https://SEU-PROJETO.vercel.app/admin.html

## Endpoints

### Público (chamados pelo app desktop)
- `POST /api/license/activate`      — ativa chave + salva machine_id
- `POST /api/license/validate`      — revalidação silenciosa dos 30 dias
- `POST /api/license/reset-password` — valida chave para permitir reset de senha

### Webhook
- `POST /api/webhook/hotmart`       — recebe eventos da Hotmart

### Admin (requer JWT)
- `POST /api/admin/auth`            — login
- `GET  /api/admin/stats`           — métricas do dashboard
- `GET  /api/admin/licenses`        — lista com filtro e paginação
- `POST /api/admin/licenses`        — gerar chave manual
- `POST /api/admin/revoke`          — revogar chave

## Estrutura do banco (MongoDB)

### Collection `licenses`
```json
{
  "chave":         "ERPA-XXXX-XXXX-XXXX",
  "email":         "cliente@email.com",
  "nome":          "João da Silva",
  "order_id":      "HP-123456789",
  "status":        "ativa",
  "machine_id":    "a1b2c3d4e5f6...",
  "data_compra":   "2026-04-28T00:00:00Z",
  "data_ativacao": "2026-05-10T00:00:00Z",
  "ultimo_acesso": "2026-05-10T00:00:00Z"
}
```

### Collection `activations`
Histórico de cada ativação com IP e user-agent.

### Collection `events`
Log completo de todas as ações (compra, ativação, validação, revogação, erro).
