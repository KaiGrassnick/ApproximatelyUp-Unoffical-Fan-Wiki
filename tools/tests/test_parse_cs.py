"""Enum labels must come from the enum the field actually declares.

The dump has sixteen enums called `Type` and seven called `Direction`. Keyed
by short name they merged into one, and a port's `_direction` was labelled
from an unrelated UI enum. The qualified key is what stops that.
"""
import textwrap

from generator import parse_cs
from generator.components import Decoder

DUMP = textwrap.dedent("""\
    public class EPC_SpaceshipComponent : EntityPrefabComponent // TypeDefIndex: 1
    {
    	// Fields
    	[SerializeField]
    	protected ElectricPortSetup[] _electricPorts; // 0x98

    	// Nested types
    	[Serializable]
    	protected struct ElectricPortSetup // TypeDefIndex: 2
    	{
    		// Fields
    		public float3 _position; // 0x00
    		public Direction _direction; // 0x0C

    		// Nested types
    		[Serializable]
    		public enum Direction : byte // TypeDefIndex: 3
    		{
    			XPlus = 0,
    			ZMinus = 5
    		}

    		// Methods
    		public quaternion GetDirectionQuaternion(); // 0x1
    	}

    	private enum MeltingTemperatue // TypeDefIndex: 4
    	{
    		Infinity = 0,
    		Iron = 1
    	}
    }

    public class SomeUiThing // TypeDefIndex: 5
    {
    	// Fields
    	public Direction _dir; // 0x10

    	// Nested types
    	public enum Direction // TypeDefIndex: 6
    	{
    		Forward = 0,
    		Next = 5
    	}
    }
    """)


# A namespace-level enum sits at the same indentation as the class above it and
# is not nested in it. Two of them share a short name, as `Type` does sixteen
# times in the real dump.
NAMESPACE_LEVEL_DUMP = textwrap.dedent("""\
    public class APLog // TypeDefIndex: 10
    {
    	// Fields
    	public int _level; // 0x18
    }

    public enum Mode // TypeDefIndex: 11
    {
    	Off = 0,
    	Volumetric = 1
    }

    public class OtherThing // TypeDefIndex: 12
    {
    	// Fields
    	public int _count; // 0x20
    }

    public enum Mode // TypeDefIndex: 13
    {
    	Off = 0,
    	Streaming = 1
    }
    """)


def parsed(tmp_path):
    p = tmp_path / "il2cpp.cs"
    p.write_text(DUMP, encoding="utf-8")
    return parse_cs.parse(str(p))


def parsed_namespace_level(tmp_path):
    p = tmp_path / "il2cpp_ns.cs"
    p.write_text(NAMESPACE_LEVEL_DUMP, encoding="utf-8")
    return parse_cs.parse(str(p))


def test_enums_are_keyed_by_enclosing_class_too(tmp_path):
    _, enums = parsed(tmp_path)
    assert enums["ElectricPortSetup.Direction"][5] == "ZMinus"
    assert enums["SomeUiThing.Direction"][5] == "Next"
    # The short entry is the merge of both, which is exactly why it is only a fallback.
    assert enums["Direction"] == {0: "Forward", 5: "Next"}


def test_field_after_nested_enum_is_still_read(tmp_path):
    classes, _ = parsed(tmp_path)
    # `_direction` is declared before the nested enum, `_dir` in another class:
    # both must survive, and so must a field the parser meets AFTER an enum.
    assert parse_cs.field_type(classes, "ElectricPortSetup", "_direction") == "Direction"
    assert parse_cs.field_type(classes, "SomeUiThing", "_dir") == "Direction"


def test_decoder_prefers_the_owners_enum(tmp_path):
    classes, enums = parsed(tmp_path)
    dec = Decoder(classes, enums)
    assert dec.decorate("ElectricPortSetup", {"_direction": 5}) == {"_direction": "ZMinus (5)"}
    assert dec.decorate("SomeUiThing", {"_dir": 5}) == {"_dir": "Next (5)"}


def test_namespace_level_enum_does_not_inherit_the_class_above_it(tmp_path):
    classes, enums = parsed_namespace_level(tmp_path)
    assert "APLog.Mode" not in enums
    assert "OtherThing.Mode" not in enums
    # The class above stays a class: its own field survives, and it gains no
    # enum-shaped members from the declaration that follows it.
    assert classes["APLog"]["fields"] == {"_level": "int"}
    assert classes["OtherThing"]["fields"] == {"_count": "int"}


def test_two_namespace_level_namesakes_do_not_merge_under_a_qualified_key(tmp_path):
    _, enums = parsed_namespace_level(tmp_path)
    assert [k for k in enums if "." in k] == []
    # Both land on the short name, which is the lossy fallback by design.
    assert enums["Mode"] == {0: "Off", 1: "Streaming"}
