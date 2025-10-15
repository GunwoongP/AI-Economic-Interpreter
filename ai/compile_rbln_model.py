#!/usr/bin/env python
"""Utility to compile a Causal LM for RBLN NPUs."""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from transformers import AutoModelForCausalLM, AutoTokenizer

try:
  from optimum.rbln import RBLNAutoModelForCausalLM
except ImportError as exc:  # pragma: no cover
  raise SystemExit(
    "optimum-rbln is required. Install with 'pip install optimum optimum-rbln'."
  ) from exc

try:  # pragma: no cover
  from peft import PeftModel
except ImportError:  # pragma: no cover
  PeftModel = None


@dataclass
class LoraAdapter:
  name: str
  path: Path
  lora_int_id: int


def parse_lora_entry(raw: str, fallback_id: int) -> LoraAdapter:
  if "=" not in raw:
    raise ValueError(f"LoRA spec '{raw}' must be in the form name=PATH[:INT_ID]")
  name, _, rest = raw.partition("=")
  if not name:
    raise ValueError(f"LoRA spec '{raw}' is missing a name before '='.")
  path_part, sep, id_part = rest.partition(":")
  if not path_part:
    raise ValueError(f"LoRA spec '{raw}' is missing a path after '='.")
  path = Path(path_part).expanduser().resolve()
  if not path.exists():
    raise ValueError(f"LoRA path '{path}' does not exist.")
  if sep:
    try:
      lora_id = int(id_part)
    except ValueError as exc:
      raise ValueError(f"LoRA spec '{raw}' has invalid INT_ID '{id_part}'.") from exc
  else:
    lora_id = fallback_id
  if lora_id < 1:
    raise ValueError(f"LoRA spec '{raw}' must have INT_ID >= 1.")
    return LoraAdapter(name=name.strip(), path=path, lora_int_id=lora_id)


def parse_lora_args(entries: Iterable[str]) -> List[LoraAdapter]:
  adapters: list[LoraAdapter] = []
  used_ids: set[int] = set()
  used_names: set[str] = set()
  for idx, raw in enumerate(entries, start=1):
    adapter = parse_lora_entry(raw.strip(), fallback_id=idx)
    if adapter.lora_int_id in used_ids:
      raise ValueError(f"LoRA INT_ID {adapter.lora_int_id} declared more than once.")
    if adapter.name in used_names:
      raise ValueError(f"LoRA name '{adapter.name}' declared more than once.")
    used_ids.add(adapter.lora_int_id)
    used_names.add(adapter.name)
    adapters.append(adapter)
  return adapters


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Compile a Hugging Face model for RBLN NPUs.")
  parser.add_argument("model_id", help="Base model identifier on Hugging Face Hub (e.g. Qwen/Qwen3-0.6B)")
  parser.add_argument(
    "--output-dir",
    default=None,
    help="Directory where the compiled artifacts will be stored (defaults to ai/models/<model_name>)",
  )
  parser.add_argument("--batch-size", type=int, default=1, help="Batch size to export with (default: 1)")
  parser.add_argument(
    "--max-seq-len",
    type=int,
    default=40960,
    help="Maximum sequence length to support. Must match export-time value (default: 40960)",
  )
  parser.add_argument(
    "--tensor-parallel",
    type=int,
    default=1,
    help="Tensor parallel degree used during export (default: 1)",
  )
  parser.add_argument(
    "--attn-impl",
    default="flash_attn",
    help="Attention implementation to target (default: flash_attn)",
  )
  parser.add_argument(
    "--kv-partition-len",
    type=int,
    default=4096,
    help="Partition length for KV cache when using flash attention (default: 4096)",
  )
  parser.add_argument(
    "--lora",
    action="append",
    default=[],
    metavar="NAME=PATH[:INT_ID]",
    help="Register a LoRA adapter for hot-swap at runtime. Repeat for multiple adapters.",
  )
  parser.add_argument(
    "--lora-rank",
    type=int,
    default=64,
    help="LoRA rank (default: 64). Must match adapter training rank.",
  )
  parser.add_argument(
    "--force",
    action="store_true",
    help="Overwrite the output directory if it already exists.",
  )
  return parser.parse_args()


def compute_output_dir(model_id: str, explicit: str | None) -> Path:
  if explicit:
    return Path(explicit).expanduser().resolve()
  base_name = model_id.split("/")[-1]
  return Path(__file__).resolve().parent / "models" / base_name


def is_rbln_export(path: Path) -> bool:
  return path.is_dir() and (path / "prefill.rbln").exists() and (path / "decoder_batch_1.rbln").exists()


def export_rbln(source: str, output_dir: Path, extra_kwargs: dict) -> None:
  print(f"[compile] exporting {source} -> {output_dir}")
  model = RBLNAutoModelForCausalLM.from_pretrained(
    model_id=source,
    export=True,
    trust_remote_code=True,
    **extra_kwargs,
  )
  model.save_pretrained(output_dir)
  print(f"[compile] export complete. Artifacts saved in {output_dir}")


def fuse_and_export_lora(
  base_model_id: str,
  adapter: LoraAdapter,
  *,
  tokenizer_id: str,
  output_dir: Path,
  extra_kwargs: dict,
  force: bool,
) -> None:
  if PeftModel is None:
    raise SystemExit("peft is required to merge LoRA adapters. Install with 'pip install peft'.")

  dest = output_dir.with_name(f"{output_dir.name}-{adapter.name}")
  if dest.exists():
    if not force:
      print(f"[lora] {dest} already exists. Use --force to overwrite.")
      return
    shutil.rmtree(dest)
  dest.mkdir(parents=True, exist_ok=True)

  print(f"[lora] merging '{adapter.name}' from {adapter.path}...")
  with tempfile.TemporaryDirectory(prefix=f"lora_merge_{adapter.name}_") as tmp_root:
    tmp_hf = Path(tmp_root) / "hf"
    tmp_hf.mkdir(parents=True, exist_ok=True)

    base = AutoModelForCausalLM.from_pretrained(base_model_id, trust_remote_code=True)
    merged = PeftModel.from_pretrained(base, str(adapter.path)).merge_and_unload()
    merged.save_pretrained(tmp_hf)

    tok = AutoTokenizer.from_pretrained(tokenizer_id, trust_remote_code=True)
    tok.save_pretrained(tmp_hf)

    export_rbln(str(tmp_hf), dest, extra_kwargs)


def main() -> int:
  args = parse_args()
  try:
    lora_adapters = parse_lora_args(args.lora)
  except ValueError as exc:
    print(f"[compile][error] {exc}", file=sys.stderr)
    return 2

  output_dir = compute_output_dir(args.model_id, args.output_dir)
  if output_dir.exists():
    has_files = any(output_dir.iterdir())
    if has_files and not args.force:
      print(f"[compile] output directory {output_dir} already contains files. Use --force to overwrite.", file=sys.stderr)
      return 1
    if has_files:
      shutil.rmtree(output_dir)
  output_dir.mkdir(parents=True, exist_ok=True)

  extra_kwargs = {
    "rbln_batch_size": args.batch_size,
    "rbln_max_seq_len": args.max_seq_len,
    "rbln_tensor_parallel_size": args.tensor_parallel,
    "rbln_attn_impl": args.attn_impl,
    "rbln_kvcache_partition_len": args.kv_partition_len,
  }

  export_rbln(args.model_id, output_dir, extra_kwargs)

  if lora_adapters:
    base_path = Path(args.model_id)
    if is_rbln_export(base_path):
      raise SystemExit("LoRA fusion requires a Hugging Face model ID or directory, not an already-compiled RBLN export.")

    print("[lora] detected adapters to fuse:")
    for adapter in lora_adapters:
      print(f"  - {adapter.name} (id={adapter.lora_int_id}) :: {adapter.path}")
      fuse_and_export_lora(
        base_model_id=args.model_id,
        adapter=adapter,
        tokenizer_id=args.model_id,
        output_dir=output_dir,
        extra_kwargs=extra_kwargs,
        force=args.force,
      )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
