# Convert dictionaries

The convert tier renders every chapter as a Vietnamese convert offline, with no
API and no quota, the instant it is ingested. Readers get something readable
immediately; the LLM tier upgrades the chapters people actually open. The engine
([server/convert/convert-engine.js](../../server/convert/convert-engine.js)) is
deterministic — swap the data, change the output.

## Committed data

- `hanviet-chars.txt` — single-character Sino-Vietnamese **phonetic** fallback
  (`中=trung`, `叶=diệp`). Phonetic, not meaning, so a name character no phrase
  covers still reads as a name (`叶 → diệp`, never "lá"). ~16k entries.
- `phrases/vietphrase.txt.gz` — multi-character phrases and terms, meaning
  oriented (`修仙=tu tiên`, `盘膝而坐=ngồi xếp bằng`). Longest match wins, so a
  phrase overrides the per-character fallback. ~667k entries, gzipped (~7.4 MB).

Both are generated from community QuickTranslator/VietPhrase data by
[scripts/build-convert-dicts.js](../../scripts/build-convert-dicts.js):

```bash
# place VietPhrase.txt and ChinesePhienAmWords.txt in a folder, then:
node scripts/build-convert-dicts.js --src <folder>
```

The script takes the first `/`-separated option as each entry's default,
converts encodings (community files are often UTF-16), drops single-char
VietPhrase entries (the phonetic table owns single chars), and gzips the phrases.

## How the engine uses them

1. Longest phrase match from the phrase dict (exact terminology, readable prose).
2. Otherwise a single character → phonetic fallback.
3. Full-width Chinese punctuation (，。「」？) is normalised to Vietnamese, and
   sentence starts are capitalised.

Numbers, Latin text and unknown Han characters pass through untouched.

## Overriding

Add files and point the env vars at them (comma-separated, later wins):

```bash
CONVERT_HANVIET=data/convert/hanviet-chars.txt,my-fixes.txt \
CONVERT_PHRASES=data/convert/phrases/vietphrase.txt.gz,my-names.txt \
node scripts/convert-chapter.js < chapter.txt
```

`.txt` (`key=value`), `.txt.gz` and `.json` are all accepted. Set
`CONVERT_ENABLED=false` to disable convert at ingest (chapters publish as raw
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
# -> Diệp thần ngồi xếp bằng, Thiên huyền tông các đệ tử sắc mặt đại biến.
```
