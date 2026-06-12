#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  ArrDash — Proxmox LXC Deploy Script
#  Run this on your Proxmox node (not inside an LXC)
#  Usage: bash deploy.sh
# ─────────────────────────────────────────────────────────────

set -e

# ── CONFIG ───────────────────────────────────────────────────
GITHUB_REPO="https://github.com/Andrewsc42/arrdash.git"  # ← change this

CT_ID=""                    # Leave blank to auto-select next available ID
CT_HOSTNAME="arrdash"
CT_PASSWORD="changeme123"   # Root password for the LXC
CT_IP=""                    # e.g. 192.168.1.50/24 — leave blank for DHCP
CT_GATEWAY=""               # e.g. 192.168.1.1    — leave blank for DHCP
CT_BRIDGE="vmbr0"
CT_CORES=1
CT_RAM=512
CT_DISK=4
CT_STORAGE="local-lvm"      # Your Proxmox storage pool
TEMPLATE="debian-12-standard_12.7-1_amd64.tar.zst"
TEMPLATE_STORAGE="local"
ARRDASH_PORT=3000
# ─────────────────────────────────────────────────────────────

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[arrdash]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
die()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       ArrDash LXC Installer          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── CHECKS ───────────────────────────────────────────────────
command -v pct   >/dev/null || die "pct not found — run this on a Proxmox node"
command -v pvesh >/dev/null || die "pvesh not found — run this on a Proxmox node"

[[ "$GITHUB_REPO" == *"YOURUSERNAME"* ]] && die "Update GITHUB_REPO in this script before running"

# ── CONTAINER ID ─────────────────────────────────────────────
if [[ -z "$CT_ID" ]]; then
  CT_ID=$(pvesh get /cluster/nextid)
  log "Using next available CT ID: $CT_ID"
fi

# ── DOWNLOAD TEMPLATE IF NEEDED ──────────────────────────────
TEMPLATE_PATH="/var/lib/vz/template/cache/${TEMPLATE}"
if [[ ! -f "$TEMPLATE_PATH" ]]; then
  log "Downloading Debian 12 template..."
  pveam update
  pveam download ${TEMPLATE_STORAGE} ${TEMPLATE} || die "Template download failed"
fi
ok "Template ready"

# ── CREATE LXC ───────────────────────────────────────────────
log "Creating LXC ${CT_ID} (${CT_HOSTNAME})..."

NETWORK_ARG="name=eth0,bridge=${CT_BRIDGE}"
if [[ -n "$CT_IP" ]]; then
  NETWORK_ARG+=",ip=${CT_IP}"
  [[ -n "$CT_GATEWAY" ]] && NETWORK_ARG+=",gw=${CT_GATEWAY}"
else
  NETWORK_ARG+=",ip=dhcp"
fi

pct create ${CT_ID} ${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE} \
  --hostname ${CT_HOSTNAME} \
  --password ${CT_PASSWORD} \
  --cores ${CT_CORES} \
  --memory ${CT_RAM} \
  --rootfs ${CT_STORAGE}:${CT_DISK} \
  --net0 "${NETWORK_ARG}" \
  --features nesting=1 \
  --unprivileged 1 \
  --start 1 \
  --onboot 1 \
  || die "Failed to create LXC"

ok "LXC created and started"

# ── WAIT FOR NETWORK ─────────────────────────────────────────
log "Waiting for LXC to be ready..."
sleep 8

# Get the LXC IP if DHCP
if [[ -z "$CT_IP" ]]; then
  for i in {1..15}; do
    LXC_IP=$(pct exec ${CT_ID} -- ip -4 addr show eth0 2>/dev/null | grep -oP '(?<=inet\s)\d+\.\d+\.\d+\.\d+' | head -1)
    [[ -n "$LXC_IP" ]] && break
    sleep 2
  done
  [[ -z "$LXC_IP" ]] && die "Could not determine LXC IP — check your network config"
else
  LXC_IP=$(echo $CT_IP | cut -d'/' -f1)
fi

ok "LXC IP: ${LXC_IP}"

# ── INSTALL ARRDASH ──────────────────────────────────────────
log "Installing ArrDash inside LXC..."

pct exec ${CT_ID} -- bash -c "
  set -e

  # System update
  apt-get update -qq
  apt-get install -y -qq curl git

  # Node.js 20 LTS
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs

  # Clone repo
  git clone ${GITHUB_REPO} /opt/arrdash

  # Install deps
  cd /opt/arrdash
  npm install --production --quiet

  # Copy .env template
  cp .env.example .env

  # Create systemd service
  cat > /etc/systemd/system/arrdash.service << 'SERVICE'
[Unit]
Description=ArrDash
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/arrdash
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable arrdash
  # Don't start yet — .env needs filling in first
"

ok "ArrDash installed"

# ── DONE ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ArrDash deployed successfully!                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}LXC ID:${NC}     ${CT_ID}"
echo -e "  ${CYAN}IP:${NC}         ${LXC_IP}"
echo -e "  ${CYAN}Dashboard:${NC}  http://${LXC_IP}:${ARRDASH_PORT}"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo -e "  1. Edit the .env file with your service URLs and API keys:"
echo -e "     ${CYAN}pct exec ${CT_ID} -- nano /opt/arrdash/.env${NC}"
echo ""
echo -e "  2. Start ArrDash:"
echo -e "     ${CYAN}pct exec ${CT_ID} -- systemctl start arrdash${NC}"
echo ""
echo -e "  3. Check it's running:"
echo -e "     ${CYAN}pct exec ${CT_ID} -- systemctl status arrdash${NC}"
echo ""
