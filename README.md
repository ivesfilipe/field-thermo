# FIELD 2.0 - Plataforma de gestão de serviços técnicos

Plataforma para controlar clientes, equipamentos, equipes, Ordens de Serviço, execução em campo, relatórios técnicos e oportunidades comerciais.

## Arquitetura

- **API:** Node.js + Express + SQLite (arquivos em `server/`)
- **Banco:** SQLite em `server/data/field.db` (100% local, sem servidor de banco)
- **Autenticação:** JWT + bcrypt
- **Uploads:** fotos e assinaturas em `server/uploads/`
- **Frontend:** Next.js em `app-tmp/` (integrados à API local)

## Configuração local

```bash
# 1. Terminal 1 - API
npm install
npm run seed        # cria banco + usuários demo
npm run dev         # API em http://localhost:3001

# 2. Terminal 2 - Frontend (Next.js)
cd app-tmp
npm install
npm run dev         # site em http://localhost:3000

# Testes
npm test            # suite completa de testes da API (53 testes)
```

Acesse **http://localhost:3000** no navegador e faça login com um dos perfis abaixo.

## Perfis do sistema

| Perfil | Acesso |
|--------|--------|
| Administrador | Usuários, equipes e permissões (superusuário nos módulos do gestor) |
| Gestor | Clientes, locais, responsáveis, equipamentos, equipes, agenda, OS e validação |
| Técnico | Somente suas OS: diagnóstico, serviço executado, fotos, assinatura, conclusão |
| Comercial | Somente relatórios aprovados, recomendações, fotos e oportunidades |

Usuários demo (criados pelo seed):

```
admin@field.com     / admin123     (Administrador)
gestor@field.com    / gestor123    (Gestor)
tecnico@field.com   / tecnico123   (Técnico)
comercial@field.com / comercial123 (Comercial)
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste:

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta da API (padrão 3001) |
| `JWT_SECRET` | Segredo dos tokens (obrigatório forte em produção) |
| `TOKEN_EXPIRES_IN` | Validade do token (ex.: `12h`, `1d`) |
| `DB_PATH` | Caminho do banco SQLite |
| `UPLOADS_DIR` | Diretório de fotos e assinaturas |
| `BACKUP_DIR` | Diretório de backups (usado pelo `npm run backup`) |
| `CORS_ORIGINS` | Origens liberadas no CORS, separadas por vírgula. Vazio libera tudo (apenas dev) |

Gerar um segredo forte:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Preparação para servidor (deploy)

### 1. Banco de produção

Use o SQLite já existente (arquivo `server/data/field.db`) ou mova-o para um volume persistente. Em produção, defina `DB_PATH` e `UPLOADS_DIR` como caminhos absolutos.

### 2. Variáveis de ambiente no servidor

Defina todas as variáveis acima, com `JWT_SECRET` forte e `NODE_ENV=production`. A API se recusa a iniciar em produção com o segredo padrão de desenvolvimento.

### 3. Executar a API

```bash
npm ci --omit=dev
NODE_ENV=production npm start
```

Recomendado gerenciar com **PM2**:

```bash
npm install -g pm2
pm2 start server/index.js --name field20
pm2 save
```

### 4. Domínio e SSL

Use um proxy reverso (Nginx ou Caddy) apontando para a porta da API:

- **Nginx:** configurar `proxy_pass http://127.0.0.1:3001;` e obter certificado com `certbot --nginx` (Let's Encrypt).
- **Caddy:** `field2.suadominio.com { reverse_proxy 127.0.0.1:3001 }` — SSL automático.

O frontend Next.js (quando integrado) deve consumir a API pelo mesmo domínio para evitar problemas de CORS.

### 5. Backup

- `npm run backup` gera um arquivo `field-<data>.db` em `./backups/` (com checkpoint do WAL).
- Agende execução automática (cron):

```cron
# diariamente às 3h
0 3 * * * cd /caminho/do/field_thermo && npm run backup
```

- Armazene os backups em local externo (outra máquina/S3) — um backup no mesmo disco não protege contra falha de disco.

### 6. Deploy

1. Rode `npm test` no servidor (ou antes do deploy).
2. Copie o código (exceto `node_modules`, `server/data`, `server/uploads`, `.env`).
3. Configure o `.env`.
4. `npm ci --omit=dev` e reinicie o serviço.
5. Valide: `curl https://seu-dominio/api/health` deve retornar `{"status":"ok",...}`.

## Fases de desenvolvimento

1. Estrutura base (API, banco SQLite) — concluída
2. Login e permissões — concluída
3. Administrador (usuários e equipes) — concluída
4. Gestor (clientes, locais, equipamentos, OS, agenda, validação) — concluída
5. Técnico (execução de campo, fotos, assinatura) — concluída
6. Comercial (relatórios e oportunidades) — concluída
7. Testes completos — concluída (53 testes automatizados)
8. Preparação para servidor — concluída (documentada neste README)
