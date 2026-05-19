#!/bin/bash
# scripts/azure-deploy.sh — Despliegue automatizado en Microsoft Azure
# ═══════════════════════════════════════════════════════════════════
# Compatible con GitHub Student Developer Pack (Azure for Students)
# Cubre: IaaS, Disponibilidad, Persistencia, Seguridad, Escalabilidad
#
# Uso: bash scripts/azure-deploy.sh
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colores ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }

# ── Configuración ────────────────────────────────────────────────────────────
RESOURCE_GROUP="${RESOURCE_GROUP:-movi-rg}"
VM_NAME="${VM_NAME:-movi-vm}"
LOCATION="${LOCATION:-brazilsouth}"      # Región más cercana a Argentina (São Paulo)
# Standard_B2s = 2 vCPU, 4 GB RAM, ~$30/mes → ~3 meses con $100 de crédito
VM_SIZE="${VM_SIZE:-Standard_B2s}"
OS_IMAGE="Canonical:ubuntu-24_04-lts:server:latest"
ADMIN_USER="${ADMIN_USER:-azureuser}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY_FILE="${HOME}/.ssh/movi_azure_rsa"

# ════════════════════════════════════════════════════════════════════════════
step "PASO 1 — Verificar e instalar Azure CLI"
# ════════════════════════════════════════════════════════════════════════════
if ! command -v az &>/dev/null; then
    info "Instalando Azure CLI (forzando IPv4)..."

    # Dependencias previas
    sudo apt-get -o Acquire::ForceIPv4=true install -y \
        ca-certificates curl apt-transport-https lsb-release gnupg

    # Linux Mint usa su propio codename (xia, vera…) pero el repo de Azure
    # solo conoce los codenames de Ubuntu (noble, jammy…).
    # UBUNTU_CODENAME en /etc/os-release siempre devuelve el codename de Ubuntu base.
    UBUNTU_CODENAME=$(grep -oP '(?<=UBUNTU_CODENAME=).*' /etc/os-release \
                      || grep -oP '(?<=DISTRIB_CODENAME=).*' /etc/upstream-release/lsb-release 2>/dev/null \
                      || echo "noble")
    info "Usando codename Ubuntu: $UBUNTU_CODENAME"

    # Limpiar fuentes antiguas que puedan tener codename incorrecto
    sudo rm -f /etc/apt/sources.list.d/azure-cli.list \
               /etc/apt/sources.list.d/azure-cli.sources

    # Clave GPG de Microsoft (IPv4)
    sudo mkdir -p /etc/apt/keyrings
    curl -4 -sLS https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor \
        | sudo tee /etc/apt/keyrings/microsoft.gpg > /dev/null

    # Repositorio Azure CLI con codename Ubuntu correcto
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/microsoft.gpg] \
https://packages.microsoft.com/repos/azure-cli/ $UBUNTU_CODENAME main" \
        | sudo tee /etc/apt/sources.list.d/azure-cli.list > /dev/null

    sudo apt-get -o Acquire::ForceIPv4=true update -qq
    sudo apt-get -o Acquire::ForceIPv4=true install -y azure-cli

    success "Azure CLI instalado: $(az --version | head -1)"
else
    success "Azure CLI ya está instalado: $(az --version | head -1)"
fi

# ════════════════════════════════════════════════════════════════════════════
step "PASO 2 — Verificar autenticación Azure"
# ════════════════════════════════════════════════════════════════════════════

# Verificar si ya hay sesión activa para evitar login repetido
CURRENT_ACCOUNT=$(az account show --query "user.name" -o tsv 2>/dev/null || true)

if [ -n "$CURRENT_ACCOUNT" ]; then
    success "Sesión activa como: $CURRENT_ACCOUNT"
else
    echo ""
    warn "No hay sesión activa. Se abrirá el navegador para login."
    warn "Usa la cuenta Microsoft de Azure for Students."
    echo ""
    az login --only-show-errors
    echo ""
fi

# ── Detectar automáticamente la suscripción de estudiante ───────────────────
echo -e "${BOLD}Suscripciones disponibles:${NC}"
az account list --output table --query "[].{Nombre:name, ID:id, Estado:state}"
echo ""

STUDENT_SUB=$(az account list \
    --query "[?contains(name,'Student') || contains(name,'tudent') || contains(name,'Education')].id" \
    -o tsv | head -1)

if [ -n "$STUDENT_SUB" ]; then
    az account set --subscription "$STUDENT_SUB" --only-show-errors
    STUDENT_NAME=$(az account show --query name -o tsv)
    success "Usando suscripción: $STUDENT_NAME ($STUDENT_SUB)"
else
    # Mostrar suscripciones y pedir selección manual
    echo -e "${YELLOW}No se detectó suscripción de estudiante.${NC}"
    echo -e "Copia el ${BOLD}ID${NC} de la suscripción que quieres usar:"
    read -rp "ID de suscripción: " SELECTED_SUB
    [ -z "$SELECTED_SUB" ] && error "Debes especificar una suscripción."
    az account set --subscription "$SELECTED_SUB" --only-show-errors
fi

SUBSCRIPTION=$(az account show --query name -o tsv)
SUB_ID=$(az account show --query id -o tsv)
success "Suscripción activa: $SUBSCRIPTION ($SUB_ID)"

# ════════════════════════════════════════════════════════════════════════════
step "PASO 3 — Crear SSH key para la VM"
# ════════════════════════════════════════════════════════════════════════════
if [ ! -f "$SSH_KEY_FILE" ]; then
    ssh-keygen -t rsa -b 4096 -f "$SSH_KEY_FILE" -N "" -C "movi-azure"
    success "SSH key creada: $SSH_KEY_FILE"
else
    success "SSH key ya existe: $SSH_KEY_FILE"
fi

# ════════════════════════════════════════════════════════════════════════════
step "PASO 4 — Crear grupo de recursos en $LOCATION"
# ════════════════════════════════════════════════════════════════════════════
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table
success "Grupo de recursos: $RESOURCE_GROUP"

# ════════════════════════════════════════════════════════════════════════════
step "PASO 5 — Crear VM Ubuntu 24.04 ($VM_SIZE)"
# ════════════════════════════════════════════════════════════════════════════
info "Esto puede tardar 2-3 minutos..."
az vm create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --image "$OS_IMAGE" \
    --size "$VM_SIZE" \
    --admin-username "$ADMIN_USER" \
    --ssh-key-values "${SSH_KEY_FILE}.pub" \
    --os-disk-size-gb 30 \
    --public-ip-sku Standard \
    --output table

# Obtener IP pública
VM_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query publicIps -o tsv)
success "VM creada — IP pública: $VM_IP"

# ════════════════════════════════════════════════════════════════════════════
step "PASO 6 — Abrir puertos en el firewall de Azure (NSG)"
# ════════════════════════════════════════════════════════════════════════════
# HTTP, HTTPS, y puerto directo del backend
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
    --port 80   --priority 1001 --output none
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
    --port 443  --priority 1002 --output none
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
    --port 8000 --priority 1003 --output none
success "Puertos 80, 443, 8000 abiertos"

# ════════════════════════════════════════════════════════════════════════════
step "PASO 7 — Instalar Docker en la VM remota"
# ════════════════════════════════════════════════════════════════════════════
SSH_CMD="ssh -i $SSH_KEY_FILE -o StrictHostKeyChecking=no $ADMIN_USER@$VM_IP"

info "Esperando que la VM esté lista..."
sleep 15

$SSH_CMD "bash -s" << 'REMOTE_INSTALL'
set -e
echo "[VM] Actualizando paquetes..."
sudo apt-get update -qq

echo "[VM] Instalando Docker..."
sudo apt-get install -y -qq ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker
echo "[VM] Docker instalado: $(docker --version)"
REMOTE_INSTALL

success "Docker instalado en la VM"

# ════════════════════════════════════════════════════════════════════════════
step "PASO 8 — Copiar proyecto a la VM"
# ════════════════════════════════════════════════════════════════════════════
info "Sincronizando archivos (excluye node_modules, .git, backups)..."

rsync -avz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=backups \
    --exclude='*.log' \
    -e "ssh -i $SSH_KEY_FILE -o StrictHostKeyChecking=no" \
    "$PROJECT_DIR/" \
    "$ADMIN_USER@$VM_IP:/home/$ADMIN_USER/movi/"

success "Proyecto copiado a /home/$ADMIN_USER/movi/"

# ════════════════════════════════════════════════════════════════════════════
step "PASO 9 — Configurar .env en la VM"
# ════════════════════════════════════════════════════════════════════════════
# Actualiza FRONTEND_URL con la IP pública real
$SSH_CMD "sed -i \"s|FRONTEND_URL=.*|FRONTEND_URL=http://$VM_IP|g\" /home/$ADMIN_USER/movi/.env"
$SSH_CMD "sed -i \"s|NODE_ENV=.*|NODE_ENV=production|g\" /home/$ADMIN_USER/movi/.env"
$SSH_CMD "sed -i \"s|DB_HOST=.*|DB_HOST=db|g\" /home/$ADMIN_USER/movi/.env"
success ".env actualizado para producción"

# ════════════════════════════════════════════════════════════════════════════
step "PASO 10 — Levantar la aplicación con Docker Compose"
# ════════════════════════════════════════════════════════════════════════════
$SSH_CMD "bash -s" << 'REMOTE_RUN'
cd /home/$(whoami)/movi
# Primer run como sudo (el grupo docker tarda en activarse sin re-login)
sudo docker compose up -d --build
echo "[VM] Contenedores activos:"
sudo docker compose ps
REMOTE_RUN

success "Aplicación desplegada"

# ════════════════════════════════════════════════════════════════════════════
step "PASO 11 — (Opcional) Compartir acceso con tu equipo"
# ════════════════════════════════════════════════════════════════════════════
echo ""
read -rp "¿Quieres dar acceso a otro integrante del equipo a la suscripción? (s/N): " add_member
if [[ "${add_member:-N}" =~ ^[Ss]$ ]]; then
    read -rp "Email de Microsoft del compañero a agregar: " MEMBER_EMAIL
    if [ -n "$MEMBER_EMAIL" ]; then
        az role assignment create \
            --role "Contributor" \
            --assignee "$MEMBER_EMAIL" \
            --scope "/subscriptions/$SUB_ID" \
            --output none
        success "$MEMBER_EMAIL agregado como Colaborador en la suscripción"
        info "Tu compañero puede iniciar sesión en https://portal.azure.com con su cuenta Microsoft"
    fi
fi

# ════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✔  DESPLIEGUE EN AZURE COMPLETADO${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 App disponible en:  ${CYAN}http://$VM_IP:8000${NC}"
echo -e "  🖥  VM IP pública:      ${CYAN}$VM_IP${NC}"
echo -e "  🔑 SSH:                ${CYAN}ssh -i $SSH_KEY_FILE $ADMIN_USER@$VM_IP${NC}"
echo ""
echo -e "${YELLOW}Comandos útiles en la VM:${NC}"
echo "  cd ~/movi && sudo docker compose logs -f          # Ver logs"
echo "  cd ~/movi && sudo docker compose ps               # Estado"
echo "  bash ~/movi/scripts/backup.sh                     # Hacer backup"
echo ""
echo -e "${YELLOW}Costo estimado con créditos de estudiante:${NC}"
echo "  Standard_B1ms (~\$15/mes) → ~6 meses de uso con \$100 USD de crédito"
echo ""
echo -e "${YELLOW}Para HTTPS con dominio propio, edita nginx/nginx.conf${NC}"
echo -e "${YELLOW}y corre: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d${NC}"
echo ""
