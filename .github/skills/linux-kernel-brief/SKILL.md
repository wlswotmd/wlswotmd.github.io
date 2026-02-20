---
name: linux-kernel-brief
description: Write concise Linux kernel concept summaries as bilingual (KO/EN) Markdown posts with consistent sections, accuracy checks, and brief examples. Keywords: linux kernel, scheduling, mm, vfs, networking, locking, RCU, memory ordering, syscalls.
---
## Purpose
Use this skill to generate compact, accurate Linux kernel concept writeups that match this blog's format. The output must include frontmatter and a bilingual layout with a Korean section first and an English section second.

## When to use
- You need a short, structured explanation of a Linux kernel concept.
- You want a bilingual (KO/EN) Markdown draft for a blog post.
- You want a quick, compatibility-aware summary rather than a long tutorial.
- You want a broad concept page (e.g., PID, VMA, vDSO) rather than a narrow subtopic.

## Do not use
- For non-kernel topics or high-level Linux userland content.
- When long-form deep dives or step-by-step labs are required.
- When you cannot provide enough topic context and references.
- When a narrowly scoped subtopic is required unless explicitly requested.
- When the topic requires extensive practical security implications or exploit-specific details (e.g., chroot jail escape techniques should be in a writeup, not a kernel concept briefing).

## Input fields
Provide as many of these as possible:
- Topic
- Audience (beginner, intermediate, advanced)
- Keywords
- Kernel version or context (optional)
- References (optional links)
- Length target (optional)

## Output format (required)
Produce a single Markdown file that follows the blog template.

Frontmatter (required):
---
title: "<English title>"
title_ko: "<Korean title>"
lang: en
draft: false
date: "<YYYY-MM-DD>"
tags:
	- linux-kernel
llm-generated: true
description: "<1-2 sentence English summary>"
description_ko: "<1-2 sentence Korean summary>"
---

Body layout (required):
[lang:ko]

> [!warning]
> 이 글은 LLM을 이용해 작성되었습니다. 부정확한 내용이 있을 수 있습니다.

# TL;DR
<Other sections are flexible and optional. Use H1 headings (#) for each section.>

[lang:en]

> [!warning]
> This post was generated with an LLM. It may contain inaccuracies.

# TL;DR
<Other sections are flexible and optional. Use H1 headings (#) for each section.>

If any details are uncertain, add an "Assumptions" subsection under the relevant section.
Avoid speculation. Prefer precise, concise statements.

## Style
- Neutral, technical tone.
- Compact and to the point (short summary level, not a long tutorial).
- Use bullet lists where helpful.
- Use references only if provided by the user.
- Keep bilingual order (KO first, EN second) and include a TL;DR in both.
- Use H1 headings (#) for sections; do not add "# 한국어" or "# English" headers.
- Prefer broad concept coverage unless the prompt asks for a narrower topic.
- **Keep titles concise**: use single concept names (`chroot`, `vruntime`, `PATH_MAX`) rather than descriptive phrases (not `chroot and directory-based isolation`).
- When adding Obsidian internal links, place the link at the start of the sentence and use lowercase alias text (e.g., "[[linux-kernel/pid|pid]]는 ...", "[[linux-kernel/vdso|vdso]] ...").
- Keep internal links consistent across both language sections.

## Recommended section patterns
- **Concept**: Define the system call, data structure, or mechanism and explain its role in the kernel.
- **Interaction with core subsystems**: Explain how it interacts with VFS, mm, scheduler, etc.
- **Limitations/Caveats**: If the mechanism has known limitations or compatibility issues, document them.
- **Modern context**: Explain its relevance in modern Linux or containers (e.g., Docker's use of chroot with namespaces).
- **References**: Kernel source location or man page references.

## Frontmatter requirements
- **draft**: Always set to `false` (publish immediately)
- **llm-generated**: Always set to `true` to exclude from Recent Notes
- **tags**: Always include `linux-kernel` tag; add domain-specific tags if applicable (e.g., `process-management`, `vfs`, `posix`)
- Ensure no other custom properties interfere with Quartz metadata parsing

## Common pitfalls
- Copying implementation details verbatim from kernel code without simplification.
- Omitting security or compatibility implications that users should know.
- Generating links to topics that don't exist in the blog; verify paths before linking.
- Mixing practical security exploits (writeup content) with conceptual kernel explanations.
- Using overly descriptive titles (e.g., "chroot and directory-based process isolation" instead of "chroot"). Keep titles concise: single concept names only.
- **Forgetting `llm-generated: true` in frontmatter**: Without this property, the post will appear in Recent Notes, cluttering the feed. Always include it.

## Example prompts

### Example 1: Scheduler concept
Topic: CFS vruntime
Audience: beginner kernel developers
Keywords: vruntime, sched_entity, rb_tree
Kernel context: Linux 6.x
References: https://www.kernel.org/doc/html/latest/scheduler/sched-design-CFS.html
Length: short
Output title: vruntime

### Example 2: File system mechanism
Topic: chroot
Audience: intermediate (system programmers, CTF participants)
Keywords: chroot, VFS, directory isolation, jail escape
Kernel context: all versions
References: man pages, VFS internals
Length: short
Output title: chroot

Note: Keep output titles concise and single-concept (e.g., not "chroot and directory-based isolation").

## Example output (shape only)
---
title: "vruntime"
title_ko: "vruntime"
lang: en
draft: true
date: "2026-02-20"
tags:
	- linux-kernelllm-generated: truedescription: "Brief overview of CFS vruntime and its role in scheduling."
description_ko: "CFS vruntime의 개념과 스케줄링에서의 역할을 간단히 설명."
---

[lang:ko]

> [!warning]
> 이 글은 LLM을 이용해 작성되었습니다. 부정확한 내용이 있을 수 있습니다.

# TL;DR
...

# 핵심 개념
...

# 한계
...

[lang:en]

> [!warning]
> This post was generated with an LLM. It may contain inaccuracies.

# TL;DR
...

# Key Concepts
...

# Limitations
...