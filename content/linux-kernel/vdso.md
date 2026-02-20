---
title: "vDSO"
title_ko: "vDSO"
lang: en
draft: false
date: "2026-02-20"
tags:
  - linux-kernel
llm-generated: true
description: "Brief overview of vDSO purpose, mapping, and behavior."
description_ko: "vDSO의 목적, 매핑 방식, 동작을 간단히 정리."
---
[lang:ko]

> [!warning]
> 이 글은 LLM을 이용해 작성되었습니다. 부정확한 내용이 있을 수 있습니다.

# TL;DR
- vDSO는 커널이 사용자 공간에 제공하는 코드/데이터 매핑이다.
- 시스템 콜 일부를 빠르게 처리하기 위한 목적이 크다.
- 주소는 ASLR로 달라질 수 있으며 페이지는 공유될 수 있다.

# 배경
vDSO는 사용자 공간에서 커널 기능 일부를 빠르게 호출할 수 있도록 제공되는 매핑이다.

# 핵심 개념
- 커널이 vDSO 이미지를 프로세스에 매핑한다.
- 물리 페이지는 프로세스 간 공유될 수 있다.
- 권한은 보통 읽기/실행이며, 쓰기 시 COW가 발생한다.

# 호환성 / 버전 노트
- vDSO 레이아웃과 심볼은 아키텍처와 커널 버전에 따라 달라진다.

# 주의사항
- vDSO VA는 프로세스마다 다를 수 있으므로 VA 공유를 가정하지 말 것.

# 참고
- https://man7.org/linux/man-pages/man7/vdso.7.html

[lang:en]

> [!warning]
> This post was generated with an LLM. It may contain inaccuracies.

# TL;DR
- The vDSO is a kernel-provided code/data mapping in user space.
- It enables faster paths for certain system calls.
- The VA can differ per process; pages may still be shared.

# Background
The vDSO is mapped into user space so some kernel-provided routines can be called without a full syscall transition.

# Key Concepts
- The kernel maps a vDSO image into each process.
- Physical pages can be shared across processes.
- Permissions are typically read/execute; writes trigger COW.

# Compatibility / Version Notes
- vDSO layout and symbols vary by architecture and kernel version.

# Pitfalls
- Do not assume the vDSO VA is identical across processes.

# References
- https://man7.org/linux/man-pages/man7/vdso.7.html
