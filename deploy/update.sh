#!/bin/bash
# =============================================================
#  Update Script - status.survivus.com.br
#  Execute na VPS após enviar novo código
# =============================================================

set -e

APP_DIR="/var/www/statuspage"
DOMAIN="status.survivus.com.br"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

echo ""
echo "=== Atualizando $DOMAIN ==="
echo ""

cd $APP_DIR

# 1. Instalar dependências
info "Instalando dependências..."
bun install --frozen-lockfile 2>/dev/null || bun install
log "Dependências instaladas"

# 2. Gerar Prisma Client
info "Gerando Prisma Client..."
npx prisma generate
log "Prisma OK"

# 3. Build
info "Fazendo build..."
bun run build
log "Build completo"

# 4. Reiniciar
info "Reiniciando app..."
pm2 restart statuspage || pm2 start /var/www/statuspage/ecosystem.config.cjs
pm2 save
log "App reiniciado"

# 5. Nginx reload
systemctl reload nginx
log "Nginx recarregado"

echo ""
echo -e "${GREEN}=== Atualização concluída! ===${NC}"
echo ""
echo "  Ver status:  pm2 status"
echo "  Ver logs:    pm2 logs statuspage"
echo "  Ver erro:    pm2 logs statuspage --err"
echo ""