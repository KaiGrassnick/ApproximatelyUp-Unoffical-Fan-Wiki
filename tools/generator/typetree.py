"""Unity type trees for a build that ships none.

The game is IL2CPP with type trees stripped, so a MonoBehaviour's bytes carry
no field names. `TypeTreeGenerator` rebuilds them from the stub assemblies
`bootstrap.py` dumps into `tools/extracted/DummyDll/`, and everything that reads a
MonoBehaviour needs one. Four tools used to carry their own copy of the
loading loop and their own hardcoded Unity version string; this is that, once.
"""
from __future__ import annotations

import json
import os

from TypeTreeGeneratorAPI import TypeTreeGenerator

from . import config

ASSEMBLY = "Assembly-CSharp"


class TypeTrees:
    """Cached type-tree nodes for the game's own classes.

    Loading a stub assembly can fail -- the dump contains framework and
    third-party assemblies the generator has no use for -- and that is normal,
    not a reason to abandon the run. Each failure is recorded in `warnings`
    rather than swallowed, so a run that produced nothing can say why.
    """

    def __init__(self, dll_dir: str | None = None, version: str | None = None,
                 assembly: str = ASSEMBLY) -> None:
        self.assembly = assembly
        self.warnings: list[str] = []
        self._cache: dict[str, list | None] = {}
        self._gen = TypeTreeGenerator(version or config.UNITY_VERSION)
        for fn in sorted(os.listdir(dll_dir or config.DUMMY_DLL)):
            if not fn.endswith(".dll"):
                continue
            path = os.path.join(dll_dir or config.DUMMY_DLL, fn)
            with open(path, "rb") as fh:
                try:
                    self._gen.load_dll(fh.read())
                except Exception as e:                      # noqa: BLE001
                    self.warnings.append(f"could not load stub assembly {fn}: {e}")

    def nodes(self, cls: str) -> list | None:
        """Type-tree nodes for `cls`, or None when the generator has no answer.

        None is a normal outcome for a MonoBehaviour whose script is not in
        Assembly-CSharp; callers decide whether that is worth reporting.
        """
        if cls not in self._cache:
            try:
                self._cache[cls] = json.loads(
                    self._gen.get_nodes_as_json(self.assembly, cls))
            except Exception:                               # noqa: BLE001
                self._cache[cls] = None
        return self._cache[cls]

    def require(self, cls: str) -> list:
        """Type-tree nodes for a class the caller cannot proceed without."""
        nd = self.nodes(cls)
        if nd is None:
            raise SystemExit(
                f"No type tree for {cls} in {self.assembly}. The IL2CPP dump in "
                f"{config.DUMMY_DLL} may be from a different game build -- "
                "re-run `python -m generator.bootstrap --force`.")
        return nd
