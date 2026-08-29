"""Shared chunking, glossary-cache and lightweight QA helpers for Hachimi."""

import hashlib
import re


SENTENCE_PART_RE = re.compile(r".*?(?:[。！？!?；;]+|$)", re.DOTALL)
HAN_RE = re.compile(r"[\u3400-\u9fff]")
PLACEHOLDER_RE = re.compile(r"__?\s*TC[ _-]*NAME", re.IGNORECASE)


def glossary_chapter_signature(chapters):
    """Stable source-layout fingerprint; content changes must increment revision."""
    numbers = []
    for chapter in chapters or []:
        value = chapter.get("n")
        if value is None:
            value = chapter.get("chapterNumber")
        if value is not None:
            numbers.append(str(value))
    payload = "\n".join(sorted(numbers, key=lambda value: (len(value), value)))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def glossary_cache_is_current(meta, revision, chapters, miner_version):
    if not isinstance(meta, dict) or not meta.get("completed"):
        return False
    valid_count = sum(
        1 for chapter in (chapters or [])
        if chapter.get("n") is not None or chapter.get("chapterNumber") is not None
    )
    return (
        str(meta.get("revision")) == str(revision)
        and meta.get("chapterCount") == valid_count
        and meta.get("chapterSignature") == glossary_chapter_signature(chapters)
        and meta.get("minerVersion") == miner_version
        and meta.get("sourceChapterCount") == valid_count
    )


def build_glossary_cache_meta(revision, chapters, miner_version, source_count, term_count, updated_at):
    valid_count = sum(
        1 for chapter in (chapters or [])
        if chapter.get("n") is not None or chapter.get("chapterNumber") is not None
    )
    return {
        "schema": 1,
        "revision": revision,
        "chapterCount": valid_count,
        "sourceChapterCount": source_count,
        "chapterSignature": glossary_chapter_signature(chapters),
        "minerVersion": miner_version,
        "termCount": term_count,
        "completed": source_count == valid_count,
        "updatedAt": updated_at,
    }


def _token_count(tokenizer, text):
    return len(tokenizer.encode(text, add_special_tokens=True, truncation=False))


def _split_oversized_piece(text, tokenizer, max_tokens):
    """Split by the largest character prefix that fits; every character is retained."""
    remaining = text
    chunks = []
    while remaining:
        if _token_count(tokenizer, remaining) <= max_tokens:
            chunks.append(remaining)
            break

        low, high, best = 1, len(remaining), 0
        while low <= high:
            middle = (low + high) // 2
            if _token_count(tokenizer, remaining[:middle]) <= max_tokens:
                best = middle
                low = middle + 1
            else:
                high = middle - 1
        if best <= 0:
            best = 1

        # Prefer a nearby natural boundary without dropping it.
        search_floor = max(1, int(best * 0.65))
        boundary = max(
            remaining.rfind(mark, search_floor, best + 1)
            for mark in ("，", ",", "、", "：", ":", " ")
        )
        cut = boundary + 1 if boundary >= search_floor else best
        chunks.append(remaining[:cut])
        remaining = remaining[cut:]
    return chunks


def split_text_by_token_budget(text, tokenizer, max_tokens=440):
    """Return lossless, sentence-oriented chunks below the model input budget."""
    source = str(text or "")
    if not source:
        return []
    if _token_count(tokenizer, source) <= max_tokens:
        return [source]

    parts = [match.group(0) for match in SENTENCE_PART_RE.finditer(source) if match.group(0)]
    chunks = []
    current = ""
    for part in parts:
        candidates = ([part] if _token_count(tokenizer, part) <= max_tokens
                      else _split_oversized_piece(part, tokenizer, max_tokens))
        for candidate in candidates:
            combined = current + candidate
            if current and _token_count(tokenizer, combined) > max_tokens:
                chunks.append(current)
                current = candidate
            else:
                current = combined
    if current:
        chunks.append(current)

    # A defensive invariant: chunking must never discard source content.
    if "".join(chunks) != source:
        raise RuntimeError("Hachimi chunker làm mất nội dung nguồn")
    return chunks


def evaluate_translation_quality(source, translation):
    """Flag obvious failures for selective Gemini QA; do not judge writing style."""
    original = str(source or "").strip()
    output = str(translation or "").strip()
    issues = []
    if not output:
        return {"qaRequired": True, "qaIssues": ["Nội dung rỗng"], "qualityScore": 0}

    han_count = len(HAN_RE.findall(output))
    if han_count:
        issues.append(f"Sót {han_count} chữ Hán chưa dịch")
    if PLACEHOLDER_RE.search(output):
        issues.append("Còn token khóa tên chưa được khôi phục")
    if original and len(original) >= 250:
        ratio = len(output) / len(original)
        if ratio < 0.60:
            issues.append(f"Bản dịch có thể bị cụt ({round(ratio * 100)}% bản gốc)")
        elif ratio > 3.5:
            issues.append(f"Bản dịch dài bất thường ({round(ratio * 100)}% bản gốc)")

    score = max(0, 10 - min(10, len(issues) * 2.5))
    return {"qaRequired": bool(issues), "qaIssues": issues, "qualityScore": score}
