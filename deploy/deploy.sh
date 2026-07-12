#!/bin/bash
# =============================================================
#  Deploy Script - Status Page → status.survivus.com.br
#  VPS com IPv6 | Cloudflare Full (Strict) | Nginx + PM2
# =============================================================

set -e

# ── Configurações ──────────────────────────────────────────────
DOMAIN="status.survivus.com.br"
APP_DIR="/var/www/statuspage"
APP_USER="www-data"
NODE_VERSION="20"
BUN_VERSION="1.1.38"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

# ── Verificar root ─────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Execute como root: sudo bash deploy.sh"
fi

echo ""
echo "=========================================="
echo "  Deploy - $DOMAIN"
echo "=========================================="
echo ""

# ── 1. Atualizar sistema ───────────────────────────────────────
info "Atualizando pacotes do sistema..."
apt update && apt upgrade -y
log "Sistema atualizado"

# ── 2. Instalar dependências ───────────────────────────────────
info "Instalando dependências..."
apt install -y curl wget git nginx ufw certbot \
  software-properties-common build-essential

# Instalar Bun
if ! command -v bun &> /dev/null; then
  info "Instalando Bun..."
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  # Tornar disponível globalmente
  ln -sf $BUN_INSTALL/bin/bun /usr/local/bin/bun
  log "Bun instalado"
else
  log "Bun já instalado: $(bun --version)"
fi

# Instalar PM2
if ! command -v pm2 &> /dev/null; then
  info "Instalando PM2..."
  bun add -g pm2
  ln -sf $(bun pm2 bin 2>/dev/null || which pm2) /usr/local/bin/pm2 2>/dev/null || true
  pm2 startup systemd -u $APP_USER --hp /home/$APP_USER 2>/dev/null || true
  log "PM2 instalado"
else
  log "PM2 já instalado"
fi

# ── 3. Criar diretório do app ─────────────────────────────────
info "Configurando diretório $APP_DIR..."
mkdir -p $APP_DIR
log "Diretório criado"

# ── 4. Copiar certificados Cloudflare ─────────────────────────
CERT_DIR="/etc/cloudflare"
mkdir -p $CERT_DIR

if [ ! -f "$CERT_DIR/origin.pem" ] || [ ! -f "$CERT_DIR/origin-key.pem" ]; then
  warn "Certificados Cloudflare não encontrados!"
  echo ""
  echo "  1. Vá em: Cloudflare → SSL/TLS → Origin Server → Create Certificate"
  echo "  2. Salve o certificado em: $CERT_DIR/origin.pem"
  echo "  3. Salve a private key em: $CERT_DIR/origin-key.pem"
  echo "  4. Execute este script novamente"
  echo ""
  echo "  Ou cole agora (Ctrl+D para pular):"

  if [ ! -f "$CERT_DIR/origin.pem" ]; then
    echo -e "${CYAN}Cole o CERTIFICADO (-----BEGIN CERTIFICATE----- ...):${NC}"
    cat > $CERT_DIR/origin.pem
  fi

  if [ ! -f "$CERT_DIR/origin-key.pem" ]; then
    echo -e "${CYAN}Cole a PRIVATE KEY (-----BEGIN PRIVATE KEY----- ...):${NC}"
    cat > $CERT_DIR/origin-key.pem
  fi
fi

chmod 644 $CERT_DIR/origin.pem
chmod 600 $CERT_DIR/origin-key.pem
log "Certificados configurados"

# ── 5. Configurar Nginx ───────────────────────────────────────
info "Configurando Nginx para $DOMAIN..."

cat > /etc/nginx/sites-available/$DOMAIN << 'NGINX_CONF'
# Status Page - status.survivus.com.br
# Cloudflare Full (Strict) + IPv6

# Redireciona HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name status.survivus.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name status.survivus.com.br;

    # Cloudflare Origin Certificate
    ssl_certificate     /etc/cloudflare/origin.pem;
    ssl_certificate_key /etc/cloudflare/origin-key.pem;

    # Segurança SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_stapling off;
    ssl_stapling_verify off;

    # Headers de segurança
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Cloudflare Real IP (IPv4 + IPv6)
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    # Cloudflare IPv6
    set_real_ip_from 2400:cb00::/32;
    set_real_ip_from 2606:4700::/32;
    set_real_ip_from 2803:f800::/32;
    set_real_ip_from 2405:b500::/32;
    set_real_ip_from 2405:8100::/32;
    set_real_ip_from 2a06:98c0::/29;
    set_real_ip_from 2c0f:f248::/32;
    real_ip_header CF-Connecting-IP;

    # Limites de upload
    client_max_body_size 10M;

    # Proxy para Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $http_connecting_ip;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # Cache de assets estáticos (Next.js)
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /favicon.ico {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=86400";
    }
}
NGINX_CONF

# Ativar site
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Testar configuração
nginx -t && log "Nginx configurado" || err "Nginx config inválida!"

# ── 6. Configurar Firewall ────────────────────────────────────
info "Configurando firewall (UFW)..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP (Cloudflare)
ufw allow 443/tcp     # HTTPS (Cloudflare)
ufw allow 3000/tcp    # Next.js (só localhost, Nginx faz proxy)
# Mas restringir porta 3000 ao localhost via iptables
iptables -I INPUT -p tcp --dport 3000 ! -s 127.0.0.1 ! -s ::1 -j DROP 2>/dev/null || true
ufw --force enable
log "Firewall configurado"

# ── 7. Configurar PM2 ─────────────────────────────────────────
info "Configurando PM2..."

cat > $APP_DIR/ecosystem.config.cjs << 'PM2_CONF'
module.exports = {
  apps: [{
    name: "statuspage",
    script: "/var/www/statuspage/.next/standalone/server.js",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      HOSTNAME: "127.0.0.1"
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: "512M",
    error_file: "/var/log/statuspage/error.log",
    out_file: "/var/log/statuspage/out.log",
    time: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
}
PM2_CONF

mkdir -p /var/log/statuspage
log "PM2 configurado"

# ── 8. Prisma generate (garantir client atualizado) ───────────
info "Gerando Prisma Client..."
if [ -f "$APP_DIR/node_modules/.bin/prisma" ]; then
  cd $APP_DIR && npx prisma generate
  log "Prisma Client gerado"
fi

# ── 9. Reiniciar serviços ─────────────────────────────────────
info "Reiniciando serviços..."
systemctl restart nginx
log "Nginx reiniciado"

# PM2 — só reiniciar se já existir, senão só salvar
if pm2 describe statuspage &> /dev/null; then
  pm2 restart statuspage
  log "PM2 reiniciou o app"
else
  warn "PM2: app ainda não iniciado. Execute 'pm2 start' após o build."
fi
pm2 save 2>/dev/null || true

# ── Done ──────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=========================================="
echo "  Deploy configurado com sucesso!"
echo "==========================================${NC}"
echo ""
echo "  Próximos passos:"
echo ""
echo "  1. Copie o projeto para a VPS:"
echo -e "     ${CYAN}rsync -avz --exclude='node_modules' --exclude='.next' ./ user@SUA_VPS:$APP_DIR/${NC}"
echo ""
echo "  2. Configure o .env na VPS:"
echo -e "     ${CYAN}nano $APP_DIR/.env${NC}"
echo ""
echo "  3. Instale dependências e faça build:"
echo -e "     ${CYAN}cd $APP_DIR && bun install && npx prisma generate && npx prisma db push && bun run build${NC}"
echo ""
echo "  4. Crie o admin:"
echo -e "     ${CYAN}cd $APP_DIR && npx tsx src/lib/seed.ts${NC}"
echo ""
echo "  5. Inicie com PM2:"
echo -e "     ${CYAN}pm2 start $APP_DIR/ecosystem.config.cjs${NC}"
echo ""
echo "  6. No Cloudflare:"
echo "     - DNS: Adicione registro A/AAAA para $DOMAIN → IP da VPS (proxy habilitado)"
echo "     - SSL/TLS: Full (Strict)"
echo ""
echo -e "  ${YELLOW}Importante: libere a porta 3000 só para localhost se o iptables acima não persistir${NC}"
echo ""