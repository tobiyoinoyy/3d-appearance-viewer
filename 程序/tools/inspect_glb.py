#!/usr/bin/env python3
"""Inspect a GLB with only the Python standard library.

The viewer uses Three.js in the browser, but this small command-line inspector
is intentionally dependency-free so a developer can audit a model before
opening it. It never rewrites the input file.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path
from typing import Any


JSON_CHUNK = 0x4E4F534A  # ASCII "JSON" in a little-endian uint32.
BIN_CHUNK = 0x004E4942   # ASCII "BIN\\0" in a little-endian uint32.

COMPONENT_BYTES = {
    5120: 1,  # BYTE
    5121: 1,  # UNSIGNED_BYTE
    5122: 2,  # SHORT
    5123: 2,  # UNSIGNED_SHORT
    5125: 4,  # UNSIGNED_INT
    5126: 4,  # FLOAT
}
TYPE_COMPONENTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}


def read_chunks(data: bytes) -> tuple[dict[str, Any], bytes]:
    if len(data) < 12:
        raise ValueError("文件太短，不是有效 GLB")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError("GLB magic 不正确")
    if version != 2:
        raise ValueError(f"仅支持 glTF 2.0，发现版本 {version}")
    if declared_length > len(data):
        raise ValueError("GLB 声明长度超过实际文件长度")

    offset = 12
    json_bytes: bytes | None = None
    bin_bytes = b""
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        end = offset + chunk_length
        if end > len(data):
            raise ValueError("GLB chunk 超出文件边界")
        chunk = data[offset:end]
        offset = end
        if chunk_type == JSON_CHUNK:
            json_bytes = chunk
        elif chunk_type == BIN_CHUNK:
            bin_bytes = chunk

    if json_bytes is None:
        raise ValueError("GLB 缺少 JSON chunk")
    document = json.loads(json_bytes.decode("utf-8").rstrip(" \x00\t\r\n"))
    return document, bin_bytes


def accessor_summary(document: dict[str, Any], accessor_index: int) -> dict[str, Any]:
    accessor = document.get("accessors", [])[accessor_index]
    result = {
        "index": accessor_index,
        "count": accessor.get("count", 0),
        "type": accessor.get("type"),
        "componentType": accessor.get("componentType"),
    }
    if "min" in accessor:
        result["min"] = accessor["min"]
    if "max" in accessor:
        result["max"] = accessor["max"]
    return result


def png_info(payload: bytes) -> dict[str, Any] | None:
    # PNG signature + IHDR width/height + colour type.
    if len(payload) < 26 or payload[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height, bit_depth, color_type = struct.unpack_from(">IIBB", payload, 16)
    return {
        "width": width,
        "height": height,
        "bitDepth": bit_depth,
        "colorType": color_type,
        "hasAlpha": color_type in (4, 6),
    }


def image_summary(document: dict[str, Any], bin_bytes: bytes, image: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": image.get("name"),
        "mimeType": image.get("mimeType"),
    }
    view_index = image.get("bufferView")
    if view_index is not None:
        view = document.get("bufferViews", [])[view_index]
        start = view.get("byteOffset", 0)
        payload = bin_bytes[start:start + view.get("byteLength", 0)]
        result["bufferView"] = view_index
        result["byteLength"] = len(payload)
        dimensions = png_info(payload)
        if dimensions:
            result.update(dimensions)
    if "uri" in image:
        result["uri"] = image["uri"]
    return result


def primitive_summary(document: dict[str, Any], primitive: dict[str, Any]) -> dict[str, Any]:
    attributes = primitive.get("attributes", {})
    position = attributes.get("POSITION")
    vertex_count = 0
    if position is not None:
        vertex_count = document["accessors"][position].get("count", 0)
    index_count = None
    if primitive.get("indices") is not None:
        index_count = document["accessors"][primitive["indices"]].get("count", 0)
    triangles = (index_count if index_count is not None else vertex_count) // 3
    return {
        "mode": primitive.get("mode", 4),
        "material": primitive.get("material"),
        "attributes": {
            name: accessor_summary(document, accessor_index)
            for name, accessor_index in attributes.items()
        },
        "vertexCount": vertex_count,
        "indexCount": index_count,
        "triangleCount": triangles,
    }


def inspect(path: Path) -> dict[str, Any]:
    payload = path.read_bytes()
    document, bin_bytes = read_chunks(payload)
    materials = document.get("materials", [])
    textures = document.get("textures", [])
    images = document.get("images", [])
    material_rows = []
    for index, material in enumerate(materials):
        pbr = material.get("pbrMetallicRoughness", {})
        base_texture = pbr.get("baseColorTexture", {}).get("index")
        image_index = None
        if base_texture is not None and base_texture < len(textures):
            image_index = textures[base_texture].get("source")
        material_rows.append({
            "index": index,
            "name": material.get("name") or f"Material {index + 1}",
            "doubleSided": bool(material.get("doubleSided", False)),
            "alphaMode": material.get("alphaMode", "OPAQUE"),
            "baseColorTexture": base_texture,
            "baseColorImage": image_index,
            "metallicFactor": pbr.get("metallicFactor", 1.0),
            "roughnessFactor": pbr.get("roughnessFactor", 1.0),
            "hasNormalTexture": "normalTexture" in material,
            "hasOcclusionTexture": "occlusionTexture" in material,
            "hasEmissiveTexture": "emissiveTexture" in material,
        })

    mesh_rows = []
    total_vertices = 0
    total_triangles = 0
    for index, mesh in enumerate(document.get("meshes", [])):
        primitives = [primitive_summary(document, item) for item in mesh.get("primitives", [])]
        total_vertices += sum(item["vertexCount"] for item in primitives)
        total_triangles += sum(item["triangleCount"] for item in primitives)
        mesh_rows.append({
            "index": index,
            "name": mesh.get("name") or f"Mesh {index + 1}",
            "primitives": primitives,
        })

    extensions_used = document.get("extensionsUsed", [])
    punctual = "KHR_lights_punctual" in extensions_used
    return {
        "source": str(path.resolve()),
        "fileSizeBytes": len(payload),
        "asset": document.get("asset", {}),
        "defaultScene": document.get("scene", 0),
        "scenes": document.get("scenes", []),
        "nodeCount": len(document.get("nodes", [])),
        "nodes": document.get("nodes", []),
        "meshCount": len(mesh_rows),
        "meshes": mesh_rows,
        "totalVertexEntries": total_vertices,
        "totalTriangles": total_triangles,
        "materialCount": len(material_rows),
        "materials": material_rows,
        "textureCount": len(textures),
        "textures": textures,
        "imageCount": len(images),
        "images": [image_summary(document, bin_bytes, image) for image in images],
        "cameraCount": len(document.get("cameras", [])),
        "lightCount": len(document.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])),
        "extensionsUsed": extensions_used,
        "extensionsRequired": document.get("extensionsRequired", []),
        "hasPunctualLights": punctual,
        "hasEnvironmentTexture": any("ibl" in name.lower() or "environment" in name.lower() for name in extensions_used),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect a glTF 2.0 GLB without third-party packages")
    parser.add_argument("path", type=Path, help="GLB file to inspect")
    parser.add_argument("--compact", action="store_true", help="Print one compact JSON line")
    args = parser.parse_args()
    result = inspect(args.path)
    print(json.dumps(result, ensure_ascii=False, indent=None if args.compact else 2))


if __name__ == "__main__":
    main()
