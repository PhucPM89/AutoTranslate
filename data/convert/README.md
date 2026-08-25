# Convert dictionaries

The convert tier renders every chapter as a Vietnamese convert offline, with no
API and no quota, the instant it is ingested. Readers get something readable
immediately; the LLM tier upgrades the chapters people actually open. The engine
([server/convert/convert-engine.js](../../server/convert/convert-engine.js)) is
deterministic — swap the data, change the output.

## The four layers

Lookup alone gets terminology right and word order wrong, because Chinese puts
modifiers before the head noun and Vietnamese puts them after. So convert runs in
four layers, each narrower than the last:

1. **Phrase dictionary** — longest match wins, so a phrase overrides the
   per-character fallback.
2. **Proper nouns** ([proper-nouns.js](../../server/convert/proper-nouns.js)) —
   competes with the phrase dictionary. A name must read *phonetically*: 苏落雪 is
   "Tô Lạc Tuyết", not "Tô tuyết rơi".
3. **Hán-Việt characters** — single-character phonetic fallback, so a name
   character no phrase covers still reads as a name (叶 → "diệp", never "lá").
4. **Grammar** ([grammar.js](../../server/convert/grammar.js)) — reorders the
   token stream into Vietnamese order.

The dictionary wins every tie against a name, and every grammar rule is a no-op
unless it positively recognises its pattern. A missed rewrite costs a clumsy
phrase; a wrong one costs the sentence.

## Generated data

Regenerate, never hand-edit:

- `hanviet-chars.txt` — single-character Sino-Vietnamese **phonetic** table
  (`中=trung`, `叶=diệp`). ~16k entries.
- `phrases/vietphrase.txt.gz` — multi-character phrases and terms, meaning
  oriented (`修仙=tu tiên`, `盘膝而坐=ngồi xếp bằng`). ~667k entries, gzipped.

Both come from community QuickTranslator/VietPhrase data packs via
[scripts/build-convert-dicts.js](../../scripts/build-convert-dicts.js):

```bash
# place VietPhrase.txt and ChinesePhienAmWords.txt in a folder, then:
node scripts/build-convert-dicts.js --src <folder>
```

## Curated data

Hand-maintained, and the intended place to fix output. Every file is optional:
the rules that need a missing table simply go quiet.

| File | What it drives |
| --- | --- |
| `overrides-chars.txt` | Single-character readings that beat the generated table. Pronouns and connectors that otherwise leak as dead phonetics (`他`→"tha", `的`→"đích"). |
| `overrides-phrases.txt` | Phrase values that beat VietPhrase's first option (`因为`→"nhân vi"). |
| `phrase-blocklist.txt` | VietPhrase entries removed outright — fragments that swallowed a clause boundary (`人是`→"người là"). |
| `pos/adjectives.txt` | Attributive adjectives, for `ADJ + NOUN → NOUN + ADJ`. |
| `pos/verbs.txt` | Verbs. A verb before 的 marks a relative clause, not a possessive. |
| `pos/function-words.txt` | Words that bound a noun phrase, so a rewrite cannot drag in an unrelated clause. |
| `pos/classifiers.txt` | Measure words, for the demonstrative rule (`那枚玉佩` → "cái ngọc bội kia"). |
| `names/surnames.txt` | Surnames with their Hán-Việt reading. Every entry is a character the matcher will try to read as a name. |
| `names/place-suffixes.txt` | Place/organisation suffixes (`青云城` → "Thanh Vân thành"). |

Each file's header explains what belongs in it and — more usefully — what does
not. Read it before adding entries: `pos/adjectives.txt` in particular must not
collect adverbs, or the postposing rule starts damaging prose.

## The grammar rules

| Pattern | Becomes | Example |
| --- | --- | --- |
| `NOUN 的 NOUN` | *head* của *modifier* | 天玄宗的弟子们 → "các đệ tử của Thiên Huyền tông" |
| `NUM 的 NOUN` | *head* *modifier* | 三十年的苦修 → "khổ tu ba mươi năm" |
| `VERB 的 NOUN` | *head* mà *clause* | 我在乎的人 → "người mà ta quan tâm" |
| `ADJ 的 NOUN` | *head* *adj* | 古老的书籍 → "sách vở cổ xưa" |
| `ADJ NOUN` | *noun* *adj* | 唯一遗物 → "di vật duy nhất" |
| `这/那 CL NOUN` | *cl* *noun* này/kia | 那枚玉佩 → "cái ngọc bội kia" |
| `NAME 上/中/内` | trên/trong *name* | 紫云殿内 → "trong Tử Vân điện" |

A relative clause is left in convert order when a preposition governs it: 从怀里
掏出的丹药 has to stay "từ trong lòng ngực móc ra đan dược", because 从 would be
stranded and the sentence would come apart.

## Working on output quality

The corpora in `samples/` are the workflow. `samples.txt` is grouped by the
construction each line stresses; `negatives.txt` is ordinary prose that the rules
must leave alone.

```bash
node scripts/convert-eval.js                       # side-by-side zh -> vi
node scripts/convert-eval.js --plain > before.txt   # snapshot
# ...edit a table or a rule...
node scripts/convert-eval.js --diff before.txt      # only what changed
node scripts/convert-eval.js --in data/convert/samples/negatives.txt
```

Convert quality is not something an assertion can score, so the loop is
snapshot → change → read the diff. What *is* asserted lives in
[server/convert/corpus.test.js](../../server/convert/corpus.test.js): invariants
over `negatives.txt` (the important one — a Title-Cased word mid-sentence means
the proper-noun layer fired on a common noun) plus one anchor per grammar rule.
Add a line to a corpus whenever you fix something; that is what stops it coming
back.

## Overriding at runtime

```bash
CONVERT_HANVIET=data/convert/hanviet-chars.txt,my-fixes.txt \
CONVERT_PHRASES=data/convert/phrases/vietphrase.txt.gz,my-names.txt \
node scripts/convert-chapter.js < chapter.txt
```

`.txt` (`key=value`), `.txt.gz` and `.json` are all accepted, later files win.
Set `CONVERT_ENABLED=false` to disable convert at ingest (chapters publish as raw
source, the previous behaviour).

## Licensing

`hanviet-chars.txt` and `phrases/vietphrase.txt.gz` are derived from community
QuickTranslator / VietPhrase data packs, which circulate freely in the
Vietnamese web-novel community for exactly this purpose but carry no formal
license. They are included here at the operator's decision. If you redistribute
this repo, confirm you are comfortable with that provenance.

## Try it

```bash
echo "叶辰盘膝而坐，天玄宗的弟子们脸色大变。" | node scripts/convert-chapter.js
# -> Diệp Thần ngồi xếp bằng, các đệ tử của Thiên Huyền tông sắc mặt đại biến.
```
