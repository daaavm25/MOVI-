#!/bin/bash
# scripts/restore.sh — Recuperación ante desastres
# Cumple: 2.Respaldos (Recuperación ante desastres)
#
# Uso: bash scripts/restore.sh backups/db/movieplus_20260519_020000.sql.gz

set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Uso: $0 <archivo_backup.sql.gz>"
    echo ""
    echo "Backups disponibles:"
    ls -lh "${BACKUP_DIR:-./backups/db}"/movieplus_*.sql.gz 2>/dev/null || echo "  (ninguno encontrado)"
    exit 1
fi

BACKUP_FILE="$1"
DB_CONTAINER="${DB_CONTAINER:-movi--db-1}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-movieplus}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Archivo no encontrado: $BACKUP_FILE"
    exit 1
fi

echo "[$(date '+%F %T')] ► Restaurando desde: $BACKUP_FILE"
echo "  Contenedor : $DB_CONTAINER"
echo "  Base de datos: $DB_NAME"
echo ""
read -rp "¿Confirmas la restauración? Esto sobreescribirá datos actuales. (s/N): " confirm
if [[ "$confirm" != "s" && "$confirm" != "S" ]]; then
    echo "Restauración cancelada."
    exit 0
fi

# Terminar conexiones activas antes de restaurar
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" \
    postgres > /dev/null 2>&1 || true

# Restaurar
gunzip -c "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" "$DB_NAME"

echo "[$(date '+%F %T')] ✔ Restauración completa."
