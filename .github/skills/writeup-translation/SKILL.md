---
name: writeup-translation
description: Translate technical CTF writeups between Korean and English while preserving exploit accuracy, structure, and code blocks. Add standardized LLM translation callout in translated sections.
---
## Purpose
Use this skill to translate existing CTF/security writeups (especially kernel/pwn writeups) between Korean and English while preserving technical meaning, Markdown structure, and exploit accuracy.

## When to use
- You need to translate a writeup section from KO -> EN or EN -> KO.
- You need bilingual layout with `[lang:ko]` and `[lang:en]` blocks.
- You need consistent translation notices for LLM-translated sections.
- You need to preserve exploit logic, offsets, payloads, and code snippets exactly.

## Do not use
- For generating a brand-new writeup from scratch.
- For rewriting exploit logic or changing technical claims.
- For modifying code blocks unless explicitly requested.
- For legal/policy documents where certified translation is required.

## Input fields
Provide as many of these as possible:
- Source file path
- Source language and target language (KO -> EN / EN -> KO)
- Scope (full file, specific section, selected paragraphs)
- Tone (literal, natural blog tone, formal)
- Terminology preferences (e.g., keep `UAF`, `AAW`, `cred` in English)

## Output format (required)
- Produce the translated result in the same Markdown file unless explicitly asked to create a new file.
- Keep frontmatter and metadata intact unless explicitly requested.
- Preserve Markdown structure, heading levels, and list numbering.
- Preserve all code blocks exactly (no semantic edits).
- Keep links, inline code, and constants unchanged.
- Preserve `[lang:ko]` and `[lang:en]` ordering and boundaries.
- Insert standardized callout at the top of the translated section.

If target is English, use:

> [!warning] This post was translated by an LLM. If you would like to read the original, please click the `한국어` button in the top-left corner.

If target is Korean, use:

> [!warning] 이 글은 LLM으로 번역되었습니다. 원문을 보시려면 좌측 상단의 `English` 버튼을 눌러주세요.

## Style
- Prioritize technical fidelity over literary style.
- Keep exploit terms concise and conventional:
  - use `leak`, `spray`, `pivot`, `primitive`, `trigger` naturally in EN
  - keep established acronyms (`UAF`, `OOB`, `AAW`, `AAF`, `ROP`, `UMH`)
- Avoid over-explaining obvious exploitation steps.
- Keep first-person narrative if present in source.
- Preserve uncertainty level from source text (do not overstate confidence).
- Keep changes minimal and scoped to translation only.

## Translation-specific checks
- Numbers, offsets, addresses, and constants must remain unchanged.
- Exploit primitives must keep original semantics (e.g., `UAF`, `AAW`, `OOB`).
- If source has ambiguity, keep equivalent ambiguity in target language.
- Do not invent missing technical details.

## QA checklist
- Are all code blocks unchanged?
- Are all numeric values/offsets/addresses unchanged?
- Are section boundaries and heading levels preserved?
- Is the callout inserted in the translated section?
- Does the translation avoid adding new technical claims?

## Common pitfalls
- Accidentally "improving" exploit logic while translating prose.
- Translating code comments in a way that changes meaning.
- Changing section order between `[lang:ko]` and `[lang:en]`.
- Omitting the standard LLM translation callout in the translated section.
- Normalizing or rewriting values (hex constants, offsets, gadget names).

## Example prompts

### Example 1: Section-only translation
Translate the Korean `# 여담` section in `content/writeups/2023-hitcon-wall-rose.md` into English and place it in the English section before `# Exploit`. Keep code blocks unchanged and add the standard LLM translation warning callout.

### Example 2: Full writeup pass
Translate `content/writeups/2023-hitcon-wall-sina.md` from Korean to English while preserving all code blocks and technical constants. Keep bilingual boundaries unchanged and insert the standard English translation callout at the start of the translated English section.
