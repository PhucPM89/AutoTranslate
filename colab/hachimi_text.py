"""Shared chunking, glossary-cache and lightweight QA helpers for Hachimi."""

import hashlib
import re
from collections import Counter


SENTENCE_PART_RE = re.compile(r".*?(?:[。！？!?；;]+|$)", re.DOTALL)
HAN_RE = re.compile(r"[\u3400-\u9fff]")
PLACEHOLDER_RE = re.compile(r"__?\s*TC[ _-]*NAME", re.IGNORECASE)

COMMON_FALSE_NAMES = {
    "简单", "东西", "厉害", "周围", "毕竟", "利用", "安排", "包括", "谢谢",
    "曾经", "左右", "麻烦", "能够", "不能", "办法", "已经", "情况", "时候",
    "开始", "继续", "如果", "忽然", "然后", "自己", "我们", "他们", "这个",
    "那个", "一个", "一些", "什么", "怎么", "因为", "所以", "不过", "而且",
    "能不能", "简直是", "胡说八", "师父", "阴阳手",
}
NAME_SPEECH_ACTIONS = set("说道问答喊叫笑哭骂喝叹哼")
NAME_EXPLICIT_PREFIXES = ("名叫", "全名", "名字叫", "叫做", "名为", "叫", "姓")
NAME_PUNCTUATION = set("，。！？、：；“”\"'（）《》【】\n\r\t ")
NAME_FORBIDDEN_FINAL_CHARS = set("的了着过在就都也还又才便却将把被给和与或而很更最太说笑问喊叫是能不没")
NAME_TITLE_SUFFIXES = (
    "先生", "小姐", "道长", "师父", "大师", "老板", "局长", "警官",
    "公子", "姑娘", "夫人", "老怪", "老祖", "二爷", "神相",
)


def mine_character_names_conservative(texts, surnames, hanviet, limit=2000):
    """Mine person names only when the complete book provides strong evidence.

    False negatives are deliberately preferred over locking ordinary prose. Qwen
    can recover an unmined name, while a false positive corrupts every matching
    source sentence before NMT sees it.
    """
    combined = "\n".join(str(text or "") for text in texts if text)
    single_surnames = {name for name in surnames if len(name) == 1}
    compound_surnames = {name for name in surnames if len(name) == 2}
    candidate_counts = Counter()
    explicit_counts = Counter()
    speech_counts = Counter()

    for start in range(len(combined)):
        compound = combined[start:start + 2]
        surname = compound if compound in compound_surnames else combined[start:start + 1]
        if surname not in compound_surnames and surname not in single_surnames:
            continue
        before = combined[start - 1] if start > 0 else ""
        if before and before not in NAME_PUNCTUATION and not any(
            combined[max(0, start - len(prefix)):start] == prefix
            for prefix in NAME_EXPLICIT_PREFIXES
        ):
            continue

        for given_length in (2, 1):
            end = start + len(surname) + given_length
            candidate = combined[start:end]
            if len(candidate) < 2 or not re.fullmatch(r"[\u3400-\u9fff]+", candidate):
                continue
            if candidate in COMMON_FALSE_NAMES:
                continue
            if candidate[-1] in NAME_FORBIDDEN_FINAL_CHARS or candidate.endswith(NAME_TITLE_SUFFIXES):
                continue
            after = combined[end] if end < len(combined) else ""
            explicit = any(
                combined[max(0, start - len(prefix)):start] == prefix
                for prefix in NAME_EXPLICIT_PREFIXES
            )
            speech = after in NAME_SPEECH_ACTIONS
            if not explicit and not speech and after not in NAME_PUNCTUATION:
                continue
            candidate_counts[candidate] += 1
            explicit_counts[candidate] += int(explicit)
            speech_counts[candidate] += int(speech)
            break

    ranked = []
    for candidate, evidence_count in candidate_counts.items():
        explicit = explicit_counts[candidate]
        speech = speech_counts[candidate]
        # One explicit introduction is enough. Otherwise require repeated uses
        # as a speaking subject, never raw frequency in ordinary prose.
        if not explicit and not (speech >= 2 or (speech >= 1 and evidence_count >= 4)):
            continue
        if any(char not in hanviet for char in candidate):
            continue
        target = " ".join(
            str(hanviet.get(char, char))[:1].upper() + str(hanviet.get(char, char))[1:].lower()
            for char in candidate
            if hanviet.get(char, char)
        )
        if not target or target == candidate:
            continue
        score = explicit * 20 + speech * 5 + evidence_count
        ranked.append((score, candidate, target))

    ranked.sort(key=lambda item: (-item[0], -len(item[1]), item[1]))
    candidate_set = {candidate for _, candidate, _ in ranked}
    filtered = [
        item for item in ranked
        if not any(
            longer.startswith(item[1]) and len(longer) > len(item[1])
            for longer in candidate_set
        )
    ]
    return {candidate: target for _, candidate, target in filtered[:max(1, int(limit))]}


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
