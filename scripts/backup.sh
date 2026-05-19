#!/bin/bash
# scripts/backup.sh — Copia de seguridad PostgreSQL
# Cumple: 2.Respaldos (Copias de seguridad, Versionado)
#
# Uso: bash scripts/backup.sh
# Cron diario (ej. 2am): 0 2 * * * /ruta/proyecto/scripts/backup.sh >> /var/log/movi-backup.log 2>&1

set -euo pipefail

# ── Configuración ───────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-./backups/db}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/movieplus_${TIMESTAMP}.sql.gz"
DB_CONTAINER="${DB_CONTAINER:-movi--db-1}"   # nombre del contenedor postgres
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-movieplus}"
KEEP_DAYS="${KEEP_DAYS:-7}"                  # días de retención

# ── Crear directorio si no existe ───────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[$(date '+%F %T')] ► Iniciando backup de '$DB_NAME'..."

# ── Dump comprimido ──────────────────────────────────────────────────────────
docker exec "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" "$DB_NAME" \
    | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date '+%F %T')] ✔ Backup creado: $BACKUP_FILE ($BACKUP_SIZE)"

# ── Eliminar backups más viejos que KEEP_DAYS días ──────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "movieplus_*.sql.gz" -mtime +"$KEEP_DAYS" -print -delete | wc -l)
echo "[$(date '+%F %T')] ✔ Backups antiguos eliminados: $DELETED"

echo "[$(date '+%F %T')] ► Backup completo."
