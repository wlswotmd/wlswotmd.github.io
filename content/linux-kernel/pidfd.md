---
title: "pidfd"
title_ko: "pidfd"
lang: en
draft: false
date: 2026-02-20
tags:
  - linux-kernel
  - process-management
llm-generated: true
description: "Brief overview of pidfd, a file descriptor-based alternative to PID for stable process reference."
description_ko: "pidfd의 개념과 PID의 재사용 문제를 해결하는 메커니즘을 간단히 정리."
---

[lang:ko]

> [!warning]
> 이 글은 LLM을 이용해 작성되었습니다. 부정확한 내용이 있을 수 있습니다.

# TL;DR

- `pidfd`는 파일 디스크립터 기반의 프로세스 참조 메커니즘
- [[linux-kernel/pid|PID]] 재사용 문제를 해결하고, 프로세스 생명 주기 동안 안정적으로 유효
- 권한 검사, 신호 전송, 대기(wait) 등 프로세스 관제에 사용 가능
- Linux 5.3+ 지원

# 개념

## pidfd란

`pidfd`는 **file descriptor** 형태로 프로세스를 안정적으로 참조하는 메커니즘입니다.

```c
int pidfd_open(pid_t pid, unsigned int flags);
```

- `pid`: 참조할 프로세스 PID
- `flags`: `PIDFD_NONBLOCK` 등 옵션
- 반환: 파일 디스크립터 (인자 오류 시 -1)

## PID의 문제

[[linux-kernel/pid|PID]]는 유한한 자원이라 프로세스 종료 후 재사용됩니다:

```c
// PID 재사용 취약성
pid_t old_pid = fork();
// ... 시간 경과 ...
waitpid(old_pid, ...);  // 새로운 다른 프로세스가 같은 PID를 가질 수 있음!
```

- PID만으로는 "정확히 어느 프로세스"인지 보장 불가
- 권한 검사나 신호 전송 시 위험
- 원본 프로세스 종료 후 캐시된 PID 사용 시 오류 발생

## pidfd의 설계

`pidfd`는 **레퍼런스 카운팅**을 활용합니다:

- 패일 디스크립터를 열 때 프로세스 구조체에 대한 참조 얻음
- 파일 디스크립터 유효한 동안 프로세스 종료 후에도 `pidfd`는 유효
- 프로세스 종료 후: `waitpid(fd, ...)` 또는 `poll(fd, ...)` 가능
- 중복 재사용 불가능

# 사용 사례

## 신호 전송

```c
pidfd_t pfd = pidfd_open(pid, 0);
pidfd_send_signal(pfd, SIGTERM, NULL, 0);  // 정확한 프로세스에 신호
close(pfd);
```

## 프로세스 대기

```c
pidfd_t pfd = pidfd_open(pid, 0);
int status;
waitid(P_PIDFD, pfd, &status, 0);  // PID가 아닌 pidfd로 대기
```

## wait 대체

```c
// 기존 방식 (문제)
pid_t pid = fork();
// ... 시간 경과 ...
waitpid(pid, &status, 0);  // PID 재사용 위험

// pidfd 방식 (안전)
pid_t pid = fork();
int pfd = pidfd_open(pid, 0);  // 프로세스 참조 확보
// ... 안전하게 참조 유지 ...
waitid(P_PIDFD, pfd, &status, 0);
```

## 권한 검사

```c
// pidfd 기반 접근 제어
// 신호 전송 전 자동으로 권한 검사
pidfd_send_signal(pfd, SIGTERM, NULL, 0);
```

# 한계

## 호환성
- Linux 5.3 이상 필요
- 일부 구형 함수(`waitpid()` 등)는 직접 pidfd 미지원 (`waitid()` 사용)

## proc 인터페이스
- `procfs`는 여전히 [[linux-kernel/pid|PID]] 기반 (`/proc/[pid]/`)
- `pidfd`로는 `/proc` 접근 불가 (다시 `pidfd_getfd()` 또는 유사 메커니즘 필요)

## 파일 디스크립터 누수
- 일반 파일 디스크립터처럼 누수 가능
- 제때 `close()` 필수

# 현대적 맥락

## 컨테이너와 systemd
- `systemd` 250+ 버전에서 pidfd 지원 확대
- 컨테이너 내 프로세스 추적 시 안정성 향상
- `/proc` 없는 환경에서의 프로세스 관제

## seccomp와 연계
- `PIDFD_NONBLOCK` 플래그와 `poll()`을 조합하여 비동기 모니터링 가능
- 보안 정책 강화 (PID 스푸핑 방지)

# 참고

- Man pages: `man pidfd_open`, `man pidfd_send_signal`, `man waitid`
- LWN: [Plumbing pidfd and seccomp](https://lwn.net/Articles/794707/)
- Linux kernel: kernel/pid.c, fs/proc_namespace.c

---

[lang:en]

> [!warning]
> This post was generated with an LLM. It may contain inaccuracies.

# TL;DR

- `pidfd` is a file descriptor-based mechanism to reference a process stably
- Solves [[linux-kernel/pid|PID]] reuse issues; remains valid throughout the process lifetime
- Supports process control: authorization checks, signal delivery, waiting (waitid)
- Available in Linux 5.3+

# Concept

## What is pidfd

`pidfd` is a **file descriptor** mechanism for stable process reference.

```c
int pidfd_open(pid_t pid, unsigned int flags);
```

- `pid`: target process [[linux-kernel/pid|PID]]
- `flags`: options like `PIDFD_NONBLOCK`
- Returns: file descriptor (-1 on error)

## The PID problem

[[linux-kernel/pid|PID]] is finite; IDs are reused after a process exits:

```c
// PID reuse vulnerability
pid_t old_pid = fork();
// ... time passes ...
waitpid(old_pid, ...);  // A different new process may now have the same PID!
```

- PID alone cannot guarantee "which exact process"
- Risky for authorization checks or signal delivery
- Caching a stale PID after exit causes errors

## pidfd design

`pidfd` exploits **reference counting**:

- Opening a file descriptor acquires a reference to the process structure
- While the file descriptor is open, the `pidfd` remains valid even after the process exits
- After process exit: `waitpid(fd, ...)` or `poll(fd, ...)` still work
- No reuse of the same PID possible while fd is held

# Use cases

## Signal delivery

```c
pidfd_t pfd = pidfd_open(pid, 0);
pidfd_send_signal(pfd, SIGTERM, NULL, 0);  // Signal to the exact process
close(pfd);
```

## Process waiting

```c
pidfd_t pfd = pidfd_open(pid, 0);
int status;
waitid(P_PIDFD, pfd, &status, 0);  // Wait using pidfd, not PID
```

## Safer wait pattern

```c
// Old way (problematic)
pid_t pid = fork();
// ... time passes ...
waitpid(pid, &status, 0);  // PID reuse risk

// pidfd way (safe)
pid_t pid = fork();
int pfd = pidfd_open(pid, 0);  // Acquire stable reference
// ... safely reference ...
waitid(P_PIDFD, pfd, &status, 0);
```

## Authorization

```c
// pidfd-based access control
// Automatic permission check on signal delivery
pidfd_send_signal(pfd, SIGTERM, NULL, 0);
```

# Limitations

## Compatibility
- Requires Linux 5.3+
- Some legacy functions (like `waitpid()`) do not directly support pidfd; use `waitid()` instead

## procfs interface
- procfs still uses [[linux-kernel/pid|PID]]-based namespacing (`/proc/[pid]/`)
- pidfd cannot directly access `/proc` (need `pidfd_getfd()` or similar)

## File descriptor leaks
- Like regular file descriptors, pidfd can leak
- Must `close()` promptly

# Modern context

## Containers and systemd
- `systemd` 250+ expanded pidfd support
- Improved stability in container process tracking
- Process control in environments without `/proc`

## seccomp integration
- Combine `PIDFD_NONBLOCK` flag with `poll()` for async monitoring
- Enhanced security policies (prevents [[linux-kernel/pid|PID]] spoofing)

# References

- Man pages: `man pidfd_open`, `man pidfd_send_signal`, `man waitid`
- LWN: [Plumbing pidfd and seccomp](https://lwn.net/Articles/794707/)
- Linux kernel: kernel/pid.c, fs/proc_namespace.c
