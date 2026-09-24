"""Create a consistent SQLite backup without modifying the source database."""
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--directory', default='backups')
args = parser.parse_args()
source = Path(args.source).resolve(strict=True)
directory = Path(args.directory).resolve()
directory.mkdir(parents=True, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
destination = directory / f'salon-{stamp}.db'
# Online backup API includes committed WAL data and gives a consistent snapshot.
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as original:
    with sqlite3.connect(destination) as backup:
        original.backup(backup)
        integrity = backup.execute('PRAGMA integrity_check').fetchall()
        foreign_keys = backup.execute('PRAGMA foreign_key_check').fetchall()
        if integrity != [('ok',)] or foreign_keys:
            raise RuntimeError('Backup validation failed; do not use this backup for migration')
        tables = [row[0] for row in backup.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )]
        counts = {table: backup.execute('SELECT COUNT(*) FROM "' + table.replace('"', '""') + '"').fetchone()[0]
                  for table in tables}
manifest = {'createdAt': stamp, 'source': str(source), 'backup': str(destination),
            'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
            'integrityCheck': 'ok', 'foreignKeyCheck': 'ok', 'rowCounts': counts}
destination.with_suffix('.manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps(manifest, indent=2))
