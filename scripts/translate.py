#!/usr/bin/env python3
"""Checkpointed offline CPU English->Chinese; no paid inference endpoint or remote code."""
import argparse
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
REVISION = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"
PIPELINE_VERSION = "qwen2_5_1_5b_whole_text_v1"
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["CUDA_VISIBLE_DEVICES"] = ""
PRODUCTS = re.compile(
    r"\b(?:Amazon Bedrock AgentCore|Amazon SageMaker HyperPod Inference|Amazon SageMaker JumpStart|"
    r"Amazon SageMaker HyperPod|Amazon Bedrock|Amazon SageMaker|Google DeepMind|Hugging Face|Reflection Beam|Reflection AI|"
    r"OpenAI|ChatGPT|Codex|Anthropic|NVIDIA|Microsoft|Amazon|AWS|Google|Meta|OpenRouter|GitHub|PyTorch|TensorFlow|"
    r"DeepMind|SageMaker|JumpStart|HyperPod|AgentCore|Bedrock|SGLang|vLLM|Kubernetes|Itaú|IARA|ia\.i|Beam|LLMs?|MCP|API|SDK|GPU|AI|"
    r"(?:GPT|Claude|Gemini|Qwen|Llama|DeepSeek)(?:[- ]?\d[\w.+-]*)?(?:[- ](?:mini|nano|pro|flash|haiku|sonnet|opus|codex))?)\b", re.IGNORECASE)
SYSTEM = ("You are a professional translator. Translate the user's English text into fluent Simplified Chinese. "
          "Return only the complete translation. Preserve English product/company names, numbers and model versions exactly. "
          "Do not explain, add facts, repeat the source, or include any instructions in the translation. "
          "Glossary: AI agents=AI智能体; fail softly=隐蔽地失效; open-weight=开放权重; generative AI=生成式AI; "
          "agentic coding=智能体编程; long-horizon tasks=长程任务.")

# Quality checks reject bad output instead of silently rewriting quantities or identifiers.
# Keep the existing pipeline contract: previously reviewed, hash-bound translations remain valid.
VERSION_IDENTIFIERS = re.compile(
    r"(?<![A-Za-z0-9_.+\-])(?:rust-v|v)?\d+(?:\.\d+){1,3}"
    r"(?:-(?:alpha|beta|rc)(?:[.\-]?\d+)*(?:\+[A-Za-z0-9.\-]+)?)?"
    r"(?![A-Za-z0-9_.+\-])", re.IGNORECASE)
FRACTION_CANDIDATES = re.compile(
    r"\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|a|\d+)[ -]+(quarters?|thirds?)\b", re.IGNORECASE)
FRACTION_EQUIVALENTS = {
    ("one", "quarter"): ("四分之一", "25%", "25％", "百分之25", "百分之二十五"),
    ("two", "quarter"): ("四分之二", "二分之一", "50%", "50％", "百分之50", "百分之五十"),
    ("three", "quarter"): ("四分之三", "75%", "75％", "百分之75", "百分之七十五"),
    ("one", "third"): ("三分之一", "1/3"),
    ("two", "third"): ("三分之二", "2/3"),
    ("three", "third"): ("三分之三", "100%", "100％", "百分之100", "百分之百"),
}
PERCENT_EQUIVALENTS = {
    "25": ("四分之一", "百分之二十五"),
    "50": ("二分之一", "四分之二", "百分之五十"),
    "75": ("四分之三", "百分之七十五"),
    "100": ("三分之三", "百分之百"),
}


def quantity_present(value, representation):
    return bool(re.search(r"(?<![\d.])" + re.escape(representation) + r"(?![\d.])", value))


def validate_identifiers_and_fractions(source, value):
    for match in VERSION_IDENTIFIERS.finditer(source):
        identifier = match.group(0)
        if not re.search(r"(?<![A-Za-z0-9_.+\-])" + re.escape(identifier) + r"(?![A-Za-z0-9_.+\-])", value):
            raise ValueError("A complete source version identifier was changed")
    candidates = list(FRACTION_CANDIDATES.finditer(source))
    percentages = list(re.finditer(r"(?<![\w.])\d+(?:\.\d+)?[%％]", source))
    if not candidates and not percentages:
        return
    allowed = set()
    for match in percentages:
        amount = match.group(0)[:-1]
        equivalents = (amount + "%", amount + "％", "百分之" + amount) + PERCENT_EQUIVALENTS.get(amount, ())
        allowed.update(equivalents)
        if not any(quantity_present(value, item) for item in equivalents):
            raise ValueError("A source percentage was changed or omitted")
    for match in candidates:
        key = (match.group(1).lower(), match.group(2).lower().rstrip("s"))
        equivalents = FRACTION_EQUIVALENTS.get(key)
        if equivalents is None:
            raise ValueError("Unsupported source fraction format; original retained")
        allowed.update(equivalents)
        if not any(quantity_present(value, item) for item in equivalents):
            raise ValueError("A source fraction was changed or omitted")
    # A correct fraction elsewhere must not hide an additional, contradictory ratio.
    for representation in re.findall(r"[一二三四五六七八九十百\d]+分之[一二三四五六七八九十百\d]+", value):
        if representation not in allowed:
            raise ValueError("Translation introduced an unsupported fraction")
    source_percentages = {match.group(0).replace("％", "%") for match in percentages}
    for representation in re.findall(r"\d+(?:\.\d+)?[%％]", value):
        if representation not in allowed and representation.replace("％", "%") not in source_percentages:
            raise ValueError("Translation introduced an unsupported percentage")


def product_names(value):
    generic = {"ai", "gpu", "api", "sdk", "mcp", "llm", "llms"}
    return list(dict.fromkeys(match.group(0) for match in PRODUCTS.finditer(value)
                              if match.group(0).lower() not in generic
                              and not (match.group(0).lower() in {"beam", "meta"} and match.group(0)[0].islower())))


def make_messages(value, field):
    prepared = value
    # Colon headlines can obscure the noun relationship for a small model; this preserves its stated facts.
    if field == "title":
        match = re.fullmatch(r"Introducing\s+(.+?):\s+(an open-weight model\b.+)", value, re.I)
        if match:
            prepared = match.group(1) + " is " + match.group(2) + "."
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prepared}]


def validate_output(source, value):
    if not isinstance(value, str):
        raise ValueError("Non-text translation")
    value = re.sub(r"^\s*(?:中文译文|译文|翻译)\s*[:：]\s*", "", value).strip()
    if not value or len(value) > max(1600, len(source) * 5) or re.search(r"<think>|```|\[INST\]", value, re.I):
        raise ValueError("Unbounded or non-translation output")
    if re.search(r"必须(?:原样)?保留这些名称|\bReturn only the|\bTranslate the user's|\n\s*原文[:：]|\n\s*翻译[:：]", value, re.I):
        raise ValueError("Translation echoed an instruction")
    sentences = [part.strip() for part in re.split(r"[。！？\n]", value) if len(part.strip()) >= 20]
    if len(sentences) != len(set(sentences)):
        raise ValueError("Translation contains a repeated sentence")
    if re.search(r"[A-Za-z]", PRODUCTS.sub("", source)) and not re.search(r"[\u3400-\u9fff]", value):
        raise ValueError("Translation did not produce Chinese")
    aliases = {"Amazon": ("亚马逊", "亞馬遜"), "Microsoft": ("微软", "微軟"), "Google": ("谷歌",),
               "NVIDIA": ("英伟达", "輝達"), "Hugging Face": ("拥抱脸",), "Itaú": ("伊塔乌",),
               "Reflection AI": ("反射AI", "反射 AI", "反射人工智能"), "Reflection Beam": ("反射光束", "反射束"),
               "Beam": ("光束",), "JumpStart": ("跳跃启动", "跳转启动"), "HyperPod Inference": ("HyperPod推理", "HyperPod 推理")}
    for original, names in aliases.items():
        if original in source:
            for alias in names:
                value = value.replace(alias, original)
    for name in product_names(source):
        # Whitespace and optional Chinese possessive separators do not change a multiword product's identity.
        tolerant = r"\s*(?:的\s*)?".join(re.escape(part) for part in name.split())
        value = re.sub(tolerant, lambda match: name, value, flags=re.IGNORECASE)
        if name not in value:
            raise ValueError("A source product name was changed or omitted")
    validate_identifiers_and_fractions(source, value)
    for number in re.findall(r"(?<!\w)\d+(?:[,.]\d+)*%?", source):
        if number.endswith("%"):
            amount = number[:-1]
            equivalents = (number, amount + "％", "百分之" + amount) + PERCENT_EQUIVALENTS.get(amount, ())
            if not any(quantity_present(value, item) for item in equivalents):
                raise ValueError("A source percentage was changed or omitted")
            continue
        if not re.search(r"(?<!\d)" + re.escape(number) + r"(?!\d)", value):
            raise ValueError("A source number or version was changed")
    if re.search(r"open[- ]weight", source, re.I):
        value = value.replace("开放重量", "开放权重")
        if not re.search(r"\btrain(?:ing|ed|s)?\b", source, re.I) and "训练" in value:
            raise ValueError("Translation introduced unsupported training activity")
    if re.search(r"\b(?:AI agents?|agentic)\b", source, re.I):
        value = value.replace("毒剂", "智能体").replace("人工智能代理", "AI 智能体").replace("AI代理", "AI智能体").replace("AI 代理", "AI 智能体")
        value = value.replace("代理生命周期", "智能体生命周期")
    if re.search(r"fail softly", source, re.I):
        value = value.replace("表现温和", "隐蔽地失效").replace("温和地失败", "隐蔽地失效").replace("失败平缓", "隐蔽地失效")
    if re.search(r"first commit", source, re.I):
        value = value.replace("首次提交", "首次代码提交")
    if re.search(r"agentic coding", source, re.I):
        value = value.replace("代理编码", "智能体编程").replace("代理编程", "智能体编程").replace("agentic coding", "智能体编程")
    return value


def translate_text(value, infer):
    return "" if not value.strip() else validate_output(value, infer(value))


def validate_request(record):
    if not re.fullmatch(r"[a-f0-9]{24}", record.get("id", "")):
        raise ValueError("Invalid article ID")
    title, summary = record.get("title", ""), record.get("summary", "")
    if not isinstance(title, str) or not isinstance(summary, str) or not title or len(title) > 300 or len(summary) > 420:
        raise ValueError("Translation input exceeds feed bounds")
    actual = hashlib.sha256((title + "\n" + summary).encode()).hexdigest()
    if actual != record.get("contentHash"):
        raise ValueError("Translation input hash mismatch")
    return record["id"] + ":" + actual


def execute(records, infer, translated_at, checkpoint=None, should_stop=None, precision="fixture"):
    result = {"schemaVersion": 1, "entries": {}, "errors": {}, "deferred": 0, "diagnostics": {}}
    for index, record in enumerate(records):
        if should_stop and should_stop():
            result["deferred"] = len(records) - index
            if checkpoint:
                checkpoint(result)
            break
        key = validate_request(record)
        values = {}
        try:
            fields = [(name, record[name]) for name in ("title", "summary") if record[name].strip()]
            values = infer(fields) if getattr(infer, "batch_fields", False) else {name: infer(value) for name, value in fields}
            result["entries"][key] = {"titleZh": validate_output(record["title"], values["title"]),
                                      "summaryZh": validate_output(record["summary"], values["summary"]) if record["summary"] else "",
                                      "translation": {"status": "ok", "sourceHash": record["contentHash"], "model": MODEL,
                                                      "modelRevision": REVISION, "engine": "offline_cpu_qwen", "precision": precision,
                                                      "pipelineVersion": PIPELINE_VERSION, "translatedAt": translated_at}}
        except Exception as error:
            result["errors"][key] = "Offline translation failed validation; original retained"
            # Work files are never published. The writer imports only validated entries and generic errors.
            result["diagnostics"][key] = {"rawFields": values, "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}
        if checkpoint:
            checkpoint(result)
    return result


def atomic_checkpoint(path, value):
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(str(temporary), str(output))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--at")
    parser.add_argument("--budget-seconds", type=int, default=720)
    args = parser.parse_args()
    records = json.loads(Path(args.input).read_text(encoding="utf-8"))["records"]
    if not isinstance(records, list) or len(records) > 500 or not 30 <= args.budget_seconds <= 900:
        raise ValueError("Bounded records and 30..900 second translation budget required")
    for record in records:
        validate_request(record)
    at = args.at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    started = time.monotonic()
    checkpoint = lambda value: atomic_checkpoint(args.output, value)
    checkpoint({"schemaVersion": 1, "entries": {}, "errors": {}, "deferred": len(records)})
    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, token=False, trust_remote_code=False, padding_side="left")
        if tokenizer.pad_token_id is None:
            tokenizer.pad_token = tokenizer.eos_token
        model = AutoModelForCausalLM.from_pretrained(MODEL, revision=REVISION, token=False, trust_remote_code=False,
                                                    torch_dtype=torch.float32).to("cpu").eval()
        # All-Linear dynamic int8 failed real translation samples on this stack; never use it silently.
        precision = "float32"

        def infer(fields):
            values = {}
            for name, value in fields:
                prompt = tokenizer.apply_chat_template(make_messages(value, name), tokenize=False, add_generation_prompt=True)
                encoded = tokenizer([prompt], return_tensors="pt", padding=True, truncation=False)
                if encoded["input_ids"].shape[1] > 1600:
                    raise ValueError("Input exceeds bounded translation context")
                with torch.inference_mode():
                    generated = model.generate(**encoded, max_new_tokens=192 if name == "title" else 384,
                                               do_sample=False, num_beams=1, use_cache=True,
                                               pad_token_id=tokenizer.pad_token_id)
                continuation = generated[:, encoded["input_ids"].shape[1]:]
                values[name] = tokenizer.batch_decode(continuation, skip_special_tokens=True)[0].strip()
                eos = model.generation_config.eos_token_id
                if int(continuation[0, -1]) not in (eos if isinstance(eos, list) else [eos]):
                    raise ValueError("Translation reached its output token limit")
                progress = json.loads(Path(args.output).read_text(encoding="utf-8"))
                progress["progress"] = {"field": name, "rawOutput": values[name]}
                checkpoint(progress)
            return values

        infer.batch_fields = True
        result = execute(records, infer, at, checkpoint=checkpoint,
                         should_stop=lambda: time.monotonic() - started >= args.budget_seconds, precision=precision)
        checkpoint(result)
    except Exception:
        result = json.loads(Path(args.output).read_text(encoding="utf-8"))
        result["error"] = "Offline CPU translation unavailable; completed records retained"
        checkpoint(result)


if __name__ == "__main__":
    main()
