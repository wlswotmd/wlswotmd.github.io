---
title: "pid"
title_ko: "pid"
lang: en
draft: false
date: "2026-02-20"
tags:
  - linux-kernel
llm-generated: true
description: "Brief overview of PID concepts and lifecycle in Linux."
description_ko: "Linux에서 PID의 개념과 수명 주기를 간단히 정리."
---
[lang:ko]

> [!warning]
> 이 글은 LLM을 이용해 작성되었습니다. 부정확한 내용이 있을 수 있습니다.

# TL;DR
- PID는 프로세스를 식별하는 숫자 ID이며 네임스페이스마다 독립적이다.
- PID는 유한한 자원이라 종료 후 재사용된다.
- PID만으로 권한/동일성 판단을 하면 취약해질 수 있다.

# 배경
PID는 커널이 프로세스를 추적하기 위해 부여하는 식별자다. PID 공간은 제한되어 있어 프로세스 종료 후 재사용될 수 있다.

# 핵심 개념
- PID는 `struct pid`와 `pid_namespace`로 관리된다.
- 동일한 PID라도 네임스페이스가 다르면 다른 프로세스를 가리킬 수 있다.
- PID 재사용 타이밍은 정책과 시스템 상태에 따라 달라질 수 있다.

# 주의사항
- PID를 장기 신원으로 취급하지 말고 [[linux-kernel/pidfd|pidfd]]를 사용하라.
- PID 기반 캐시나 접근 제어는 재사용에 취약하다.

# 참고
- https://lwn.net/Articles/794707/

[lang:en]

> [!warning]
> This post was generated with an LLM. It may contain inaccuracies.

# TL;DR
- A PID is a numeric process ID scoped by namespaces.
- PIDs are finite and can be reused after exit.
- PID-only identity or authorization checks can be unsafe.

# Background
A PID is the kernel-assigned numeric identifier for a process. Because the PID space is limited, IDs can be recycled after a process terminates.

# Key Concepts
- PIDs are managed via `struct pid` and `pid_namespace`.
- The same PID value can refer to different processes in different namespaces.
- Reuse timing depends on allocation policy and system state.

# Pitfalls
- Do not treat PID as a long-term identity; use [[linux-kernel/pidfd|pidfd]] instead.
- PID-based caches or access control can break under reuse.

# References
- https://lwn.net/Articles/794707/
