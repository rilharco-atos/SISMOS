#!/bin/sh
# Reposição de um backup. Uso (com a API parada):
#   docker compose stop api
#   docker compose run --rm backup /scripts/restore.sh sismos_20260924_120000.dump [--confirmo]
#   docker compose start api
# Sem --confirmo apenas mostra o que seria reposto. Repõe também os ficheiros se existir
# uploads_<mesmo carimbo>.tar.gz. Antes de repor, faz um backup de segurança do estado atual.
set -eu

DESTINO=/backups
FICHEIRO="${1:-}"
CONFIRMO="${2:-}"

if [ -z "$FICHEIRO" ]; then
  echo "Backups disponíveis:"; ls -1t "$DESTINO"/sismos_*.dump 2>/dev/null | xargs -r -n1 basename; exit 1
fi
case "$FICHEIRO" in */*|*..*) echo "Indique apenas o nome do ficheiro (sem caminho)."; exit 1;; esac
DUMP="$DESTINO/$FICHEIRO"
[ -f "$DUMP" ] || { echo "Não existe: $FICHEIRO"; exit 1; }
CARIMBO=$(echo "$FICHEIRO" | sed -n 's/^sismos_\([0-9_]*\)\.dump$/\1/p')
UPLOADS_TAR="$DESTINO/uploads_${CARIMBO}.tar.gz"

echo "Base de dados: $FICHEIRO ($(pg_restore --list "$DUMP" | grep -c 'TABLE DATA') tabelas)"
[ -f "$UPLOADS_TAR" ] && echo "Ficheiros:     $(basename "$UPLOADS_TAR")" || echo "Ficheiros:     (sem arquivo correspondente, uploads não são alterados)"

if [ "$CONFIRMO" != "--confirmo" ]; then
  echo "Simulação. Para repor, repita com --confirmo (com a API parada)."; exit 0
fi

echo "A criar backup de segurança do estado atual..."
BACKUP_UMA_VEZ=1 /scripts/backup.sh

echo "A repor base de dados..."
pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$PGDATABASE" "$DUMP"

if [ -f "$UPLOADS_TAR" ]; then
  echo "A repor ficheiros..."
  find /uploads -mindepth 1 -delete
  tar -xzf "$UPLOADS_TAR" -C /uploads
fi
echo "Reposição concluída. Arranque a API: docker compose start api"
