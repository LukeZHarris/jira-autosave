"""Package only the runtime allowlist; never include test profiles or dependencies."""
from pathlib import Path
import hashlib
import json
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'manifest.json').read_text())['version']
files = ['manifest.json', 'content.js', 'content.css', 'LICENSE', 'PRIVACY.md']
files += [f'icons/{size}.png' for size in (16, 32, 48, 128)]
out = root / 'dist'
out.mkdir(exist_ok=True)
archive = out / f'jira-description-autosave-{version}.zip'
with ZipFile(archive, 'w', compression=ZIP_DEFLATED) as package:
    for name in files:
        info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        package.writestr(info, (root / name).read_bytes())
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
(archive.with_suffix('.zip.sha256')).write_text(f'{checksum}  {archive.name}\n')
print(f'{archive}\nSHA-256: {checksum}')
