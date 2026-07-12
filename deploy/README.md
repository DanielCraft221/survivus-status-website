# Deploy - Status Page
# status.survivus.com.br

## Arquitetura

```
Usuário → Cloudflare (CDN/WAF/SSL) → VPS (Nginx IPv6) → Next.js (PM2) → Supabase (PostgreSQL)
```

## Primeiro Deploy

### 1. No Cloudflare
- Criar registro DNS **A** (ou **AAAA** para IPv6) para `status.survivus.com.br` → IP da VPS
- Ativar **Proxy** (nuvem laranja)
- **SSL/TLS → Overview** → **Full (Strict)**
- **SSL/TLS → Origin Server** → **Create Certificate** → copiar cert + key

### 2. Na VPS (primeira vez)
```bash
# Enviar o projeto
rsync -avz --exclude='node_modules' --exclude='.next' --exclude='db' \
  ./ root@SUA_VPS_IP:/var/www/statuspage/

# Executar setup (instala tudo: Nginx, PM2, Bun, Firewall)
ssh root@SUA_VPS_IP "bash /var/www/statuspage/deploy/deploy.sh"
```

### 3. Configurar .env na VPS
```bash
ssh root@SUA_VPS_IP
nano /var/www/statuspage/.env
```
Conteúdo:
```
DATABASE_URL="postgresql://postgres.PROJETO:[SUA_SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
ADMIN_USER=admin
ADMIN_PASSWORD=SUA_SENHA_FORTE
JWT_SECRET=gerar-uma-string-aleatoria-de-32-chars
CRON_SECRET=outra-string-aleatoria
```

### 4. Build e seed
```bash
cd /var/www/statuspage
npx prisma db push
npx prisma generate
npx tsx src/lib/seed.ts
bun run build
pm2 start ecosystem.config.cjs
pm2 save
```

## Atualizações

Quando quiser enviar uma nova versão:
```bash
# Da sua máquina → VPS
rsync -avz --exclude='node_modules' --exclude='.next' --exclude='db' \
  ./ root@SUA_VPS_IP:/var/www/statuspage/

# Na VPS
ssh root@SUA_VPS_IP "bash /var/www/statuspage/deploy/update.sh"
```

## Comandos úteis na VPS

```bash
pm2 status                    # Verificar status do app
pm2 logs statuspage           # Ver logs em tempo real
pm2 logs statuspage --err     # Só erros
pm2 restart statuspage        # Reiniciar
pm2 stop statuspage           # Parar
pm2 monit                     # Monitor de recursos

nginx -t                      # Testar config Nginx
systemctl reload nginx        # Recarregar Nginx
systemctl status nginx        # Status Nginx

ufw status                    # Ver firewall
```

## Portas

| Porta | Uso | Acesso |
|-------|-----|--------|
| 22    | SSH | Seu IP |
| 80    | HTTP → redireciona 443 | Cloudflare |
| 443   | HTTPS | Cloudflare |
| 3000  | Next.js | Somente localhost |