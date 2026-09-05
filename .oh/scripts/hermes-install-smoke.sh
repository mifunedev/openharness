#!/usr/bin/env bash
set -euo pipefail

if [ "${OH_HERMES_SMOKE:-}" != "1" ] || [[ "${SANDBOX_NAME:-}" != oh-hermes-* ]]; then
  echo "ERROR: use OH_HERMES_SMOKE=1 only in a disposable oh-hermes-* sandbox" >&2
  exit 64
fi
if [ -S /var/run/docker.sock ] || [ "$(id -un)" != sandbox ]; then
  echo "ERROR: Hermes smoke requires sandbox user and no Docker socket" >&2
  exit 64
fi

"$HOME/.local/lib/hermes-agent/venv/bin/python" - <<'PY'
import hashlib
import json
import os
import sys
from pathlib import Path

root = Path(os.environ['OH_PROJECT_ROOT'])
sys.path.insert(0, str(Path.home() / '.local/lib/hermes-agent'))
from hermes_constants import get_hermes_home

home = get_hermes_home()
assert home == root / '.hermes', str(home)
assert (home / 'config.yaml').is_file(), 'configuration not in project home'
pack = root / '.oh/skills'
link = home / 'skills/openharness'
assert link.is_symlink() and link.resolve() == pack.resolve(), str(link)
shared_name = 'oh-layout-smoke-shared'
native_name = 'oh-layout-smoke-native'
content = lambda name: f'---\nname: {name}\ndescription: Disposable Open Harness integration fixture\n---\nTest fixture for {name}.\n'
shared = pack / shared_name
assert not shared.is_symlink(), 'occupied shared fixture link'
shared.mkdir(exist_ok=True)
shared_md = shared / 'SKILL.md'
assert not shared_md.is_symlink(), 'occupied shared file link'
if shared_md.exists():
    assert shared_md.read_text() == content(shared_name), 'occupied shared fixture'
else:
    shared_md.write_text(content(shared_name))

def pack_hashes():
    return {str(p.relative_to(pack)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in pack.rglob('*') if p.is_file()}

before = pack_hashes()
from tools.skill_manager_tool import _create_skill
native = home / 'skills' / native_name / 'SKILL.md'
assert not native.parent.is_symlink() and not native.is_symlink(), 'occupied native fixture link'
if native.exists():
    assert native.read_text() == content(native_name), 'occupied native fixture'
else:
    created = _create_skill(native_name, content(native_name))
    assert created.get('success'), created
assert native.is_file(), 'native creation did not use runtime skills'
assert pack_hashes() == before, 'native creation modified canonical pack'

from tools.skills_tool import skills_list, skill_view
listed = json.loads(skills_list())
assert listed.get('success'), listed
names = {s['name'] for s in listed['skills']}
assert {shared_name, native_name} <= names, sorted(names)
for name in [shared_name, native_name]:
    viewed = json.loads(skill_view(name))
    assert viewed.get('success'), viewed
    assert content(name).strip() in viewed['content'], viewed

atomic = home / 'oh-layout-smoke-atomic.json'
temporary = home / 'oh-layout-smoke-atomic.tmp'
for p in [atomic, temporary]:
    assert not p.is_symlink(), 'occupied atomic fixture link'
    if p.exists():
        assert p.read_text() == '{"synthetic":true}\n', 'occupied atomic fixture'
temporary.write_text('{"synthetic":true}\n')
os.replace(temporary, atomic)
assert atomic.read_text() == '{"synthetic":true}\n'
print(json.dumps({'home': str(home), 'cwd': os.getcwd(), 'uid': os.getuid(),
                  'shared': shared_name, 'native': native_name,
                  'canonical_files_unchanged': len(before), 'atomic_replace': True,
                  'skill_count': len(names), 'result': 'PASS'}, sort_keys=True))
PY
