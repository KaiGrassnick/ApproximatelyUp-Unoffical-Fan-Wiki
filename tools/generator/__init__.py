"""The extraction pipeline: game files in, data/ out.

A package rather than a loose directory of scripts, so its modules do not
occupy top-level import names -- `config`, `text` and `stats` are generic
enough to collide with a future dependency. Every tool is therefore run as a
module, from `tools/` (or from anywhere once `pip install -e tools/` has put
the package on the path):

    python -m generator.bootstrap
    python -m generator.components

The shared modules underneath them are `config` (paths, .env, guards),
`typetree` (Unity type trees for a build that ships none), `parse_cs`
(il2cpp.cs), and the three the Angular app mirrors one-for-one in
src/app/core/: `availability`, `stats` and `text`.
"""
