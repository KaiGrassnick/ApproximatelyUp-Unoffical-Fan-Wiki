"""Parse Il2CppInspector's il2cpp.cs into class field types, inheritance and enums.

The IL2CPP build ships no type trees and no field names, so this dump is the
only place that says what a MonoBehaviour's fields are *called* and which of
them are enums. Text in, dictionaries out -- no game files, no dependencies.
"""
from __future__ import annotations

import re


def parse(path: str) -> tuple[dict, dict]:
    classes = {}   # name -> {"base": str|None, "fields": {fieldname: typename}}
    enums = {}     # "Enum" and "Owner.Enum" -> {int_value: label}
    cur_cls = None
    cur_cls_indent = -1    # how deep the open class's own declaration sits
    cur_enum = None        # the dict being filled, or None
    cur_short = None       # its short-name twin, filled in step with it
    enum_owner = None      # the class to return to when the enum closes
    # Every declaration line the dumper emits ends in a `//` comment carrying
    # the type or field's address, which is what anchors these to real
    # declarations rather than to text inside a method body.
    access = r'(?:public|internal|private|protected)'
    cls_re = re.compile(
        r'^(?:\s*)' + access + r'?\s*(?:sealed |abstract |static |partial )*'
        r'class\s+([\w`<>.]+)(?:\s*:\s*([\w`<>., ]+))?\s*//')
    struct_re = re.compile(
        r'^(?:\s*)' + access + r'?\s*(?:readonly |sealed |partial )*'
        r'struct\s+([\w`<>.]+)(?:\s*:\s*([\w`<>., ]+))?\s*//')
    enum_re = re.compile(
        r'^(?:\s*)' + access + r'?\s*enum\s+([\w.]+)\s*(?::\s*(\w+))?\s*//')
    field_re = re.compile(
        r'^\s*' + access + r'\s+(?:static\s+|readonly\s+|const\s+)*'
        r'([\w`<>\[\]., ?]+?)\s+(\w+)\s*;\s*//\s*0x([0-9A-Fa-f]+)')
    enumval_re = re.compile(r'^\s*(\w+)\s*=\s*(-?\d+)\s*,?\s*$')

    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            indent = len(line) - len(line.lstrip())
            m = enum_re.match(line)
            if m:
                # Registered twice. `Owner.Enum` is what a field of the
                # enclosing class resolves to first; the bare short name is a
                # merge of every enum called that -- sixteen are called
                # `Type` -- and only right when the name is unique, so it is
                # the fallback and nothing more.
                short = m.group(1).split('.')[-1]
                enums.setdefault(short, {})
                # Only an enum indented deeper than the open class is nested in
                # it. One at the class's own depth is a namespace-level enum
                # that merely follows it, and owning it would both mislabel the
                # enum and merge two namesakes under one qualified key.
                nested = cur_cls and indent > cur_cls_indent
                qualified = f"{cur_cls}.{short}" if nested else short
                cur_enum = enums.setdefault(qualified, {})
                cur_short = short
                enum_owner = cur_cls
                continue
            m = cls_re.match(line) or struct_re.match(line)
            if m:
                name = m.group(1).split('.')[-1]
                bases = [b.strip() for b in (m.group(2) or "").split(',') if b.strip()]
                base = bases[0] if bases else None
                cur_cls = name
                cur_cls_indent = indent
                classes.setdefault(name, {"base": base, "fields": {}})
                cur_enum = None
                continue
            if cur_enum is not None:
                m = enumval_re.match(line)
                if m:
                    value, label = int(m.group(2)), m.group(1)
                    cur_enum[value] = label
                    enums[cur_short][value] = label
                    continue
                if line.strip() == "}":
                    # Back to the class the enum was nested in, so a field
                    # declared after it is not lost.
                    cur_enum = None
                    cur_cls = enum_owner
                continue
            if cur_cls and line.strip() == "}" and indent <= cur_cls_indent:
                # The class's own closing brace. A deeper one closes a method
                # or a nested block, and leaving the class open past this point
                # is what made the next namespace-level enum look nested.
                cur_cls = None
                cur_cls_indent = -1
                continue
            if cur_cls:
                m = field_re.match(line)
                if m:
                    classes[cur_cls]["fields"][m.group(2)] = m.group(1).strip()
    return classes, enums

def field_type(classes: dict, cls: str | None, field: str) -> str | None:
    seen = set()
    while cls and cls in classes and cls not in seen:
        seen.add(cls)
        f = classes[cls]["fields"].get(field)
        if f:
            return f
        cls = classes[cls]["base"]
    return None
