---
title: "PATH_MAX"
title_ko: "PATH_MAX"
lang: en
draft: false
date: 2026-02-20
tags:
  - linux-kernel
  - vfs
  - posix
llm-generated: true
description: "Brief overview of PATH_MAX, its definition in the kernel, and why paths can exceed it."
description_ko: "PATH_MAX의 정의와 경로가 이를 초과할 수 있는 이유를 간단히 정리."
---

[lang:ko]

> [!warning]
> 이 글은 LLM을 이용해 작성되었습니다. 부정확한 내용이 있을 수 있습니다.

# TL;DR

- `PATH_MAX`는 POSIX 표준에서 정의한 경로의 최대 길이이며, 리눅스에서는 보통 4096 바이트
- 고정 상수가 아니며, 커널 구현에 따라 다르고, 실제로 초과 가능
- 커널은 내부적으로 동적 버퍼나 링크드 리스트(dentry)를 사용하므로, 사용자 공간의 `PATH_MAX` 기반 버퍼는 오버플로우 위험
- 애플리케이션이 `PATH_MAX` 크기의 고정 버퍼에 동적 경로를 복사할 때 버퍼 오버플로우 발생 가능

# 개념

## PATH_MAX 정의

`PATH_MAX`는 POSIX 1003.1에 의해 정의된 상수로, 파일 시스템 경로의 최대 길이입니다.

```c
#include <limits.h>
#define PATH_MAX 4096  // Linux typical value
```

- 리눅스: 보통 4096 (include/uapi/linux/limits.h)
- macOS: 1024
- BSD: 1024
- Windows: 다름 (MAX_PATH = 260)

## 표준 정의 vs 실제 구현

POSIX 표준은 `PATH_MAX`의 존재를 **보장하지 않습니다**. Single UNIX Specification (SUS)에서:

> If _POSIX_PATH_MAX is not defined, the maximum length of pathname is unspecified.

또한:

- 반드시 고정될 필요 없음
- 파일 시스템별로 다를 수 있음
- 동적으로 결정될 수 있음

## 커널의 경로 처리

리눅스 커널 VFS에서 경로는 **고정 크기 버퍼가 아닙니다**:

- **dentry cache**: 디렉토리 엔트리는 연결 구조(dentry tree)로 관리
- **symbolic link resolution**: 링크 추적 시에도 동적 할당
- **getpath()**: 경로를 재구성할 때 버퍼를 할당받아 길이 제약이 상대적으로 적음

반면, **사용자 공간 애플리케이션**은 종종 고정 크기 버퍼를 사용합니다:

```c
char path[PATH_MAX];  // 고정 크기 = 4096
getcwd(path, sizeof(path));
```

# 한계와 오버플로우

## PATH_MAX 초과 가능성

다음 상황에서 경로가 `PATH_MAX`를 초과할 수 있습니다:

1. **깊은 디렉토리 중첩**
   - 각 디렉토리 이름이 최대 길이(255 바이트)에 가까울 경우
   - 깊이가 충분하면 총 경로 길이가 4096을 초과

2. **동적 경로 구성**
   - 런타임에 `getcwd()` + `strcat()` + 파일명으로 경로 구성
   - 호출자가 버퍼 크기를 확인하지 않으면 오버플로우

3. **심볼릭 링크 순환**
   - 일부 시스템에서는 심볼릭 링크 추적 깊이 제한이 `PATH_MAX`와 무관

## 전형적인 오버플로우 패턴

```c
char full_path[PATH_MAX + 1];
getcwd(full_path, sizeof(full_path));  // 이미 긴 경로
strcat(full_path, "/");
strcat(full_path, user_filename);      // <= 오버플로우 가능
```

- `getcwd()`는 성공하지만 이미 대부분 채워짐
- `strcat()`는 경계 검사 없이 수행
- 사용자 입력 파일명이 길면 스택 오버플로우 발생

## 부모 디렉토리 탐색에서의 위험

깊게 중첩된 디렉토리 구조(`A/B/C/...`)에서:

```c
for (int i = 0; i < 1000; i++) {
    chdir("..");  // 부모로 이동
}
```

각 단계에서 상대 경로가 증가하지 않지만, `cwd` 추적 시 내부 경로 길이가 늘어날 수 있습니다.

# 현대적 맥락

## 보안 고려사항

- 버퍼 오버플로우 완화: 최신 컴파일러는 `-D_FORTIFY_SOURCE` 플래그로 `strcat()` 검사 추가
- `strlcpy()` / `strlcat()` 권장: 크기 명시적 제한
- `realpath()`: 경로 정규화 시 동적 할당 권장

## 파일 시스템 독립성

실제 경로 길이는 파일 시스템에 따라 다릅니다:

- **ext4**: inode에 저장된 경로 제약 없음 (dentry로 관리)
- **NTFS/FAT**: 더 엄격한 제약 (legacy)
- **FUSE**: 사용자 공간 구현에서 자유도 높음

따라서 `PATH_MAX`에 의존하는 것은 이식성이 떨어집니다.

## 컨테이너와 chroot

[[chroot|chroot]] jail이나 컨테이너 환경에서:

- 마운트 포인트 변경 시 경로 길이 계산 변함
- 심볼릭 링크 추적 결과가 달라질 수 있음
- 호출 애플리케이션이 `PATH_MAX` 기정사실화하면 탈출/오버플로우 위험

# 참고

- "PATH_MAX is not a good limit": https://insanecoding.blogspot.com/2007/11/pathmax-simply-isnt.html
- Linux man pages: `man pathconf`, `man 2 getcwd`, `man 3 realpath`
- POSIX.1: https://pubs.opengroup.org/onlinepubs/9699919799/
- Linux kernel: include/uapi/linux/limits.h

---

[lang:en]

> [!warning]
> This post was generated with an LLM. It may contain inaccuracies.

# TL;DR

- `PATH_MAX` is a POSIX-defined constant for the maximum pathname length; on Linux typically 4096 bytes
- Not a fixed guarantee; depends on kernel implementation and is actually exceedable
- The kernel uses dynamic buffers and dentry trees internally, so user-space `PATH_MAX`-based fixed buffers risk overflow
- Buffer overflow occurs when an application copies a dynamic path into a fixed `PATH_MAX`-sized buffer without bounds checking

# Concept

## PATH_MAX definition

`PATH_MAX` is a constant defined by POSIX 1003.1 for the maximum length of a file system path.

```c
#include <limits.h>
#define PATH_MAX 4096  // Linux typical value
```

- Linux: typically 4096 (include/uapi/linux/limits.h)
- macOS: 1024
- BSD: 1024
- Windows: differs (MAX_PATH = 260)

## Standard definition vs actual implementation

The POSIX standard does **not guarantee** `PATH_MAX` exists. From Single UNIX Specification (SUS):

> If _POSIX_PATH_MAX is not defined, the maximum length of pathname is unspecified.

Additionally:

- Need not be fixed
- May vary by file system
- May be determined dynamically

## Kernel pathname handling

In the Linux kernel VFS, pathnames are **not fixed-sized buffers**:

- **dentry cache**: directory entries managed as a linked structure (dentry tree)
- **symbolic link resolution**: link traversal uses dynamic allocation
- **getpath()**: pathname reconstruction allocates buffers with fewer hard constraints

In contrast, **user-space applications** often use fixed-size buffers:

```c
char path[PATH_MAX];  // fixed size = 4096
getcwd(path, sizeof(path));
```

# Limitations and overflow

## PATH_MAX exceedance

Pathnames can exceed `PATH_MAX` in these scenarios:

1. **Deep directory nesting**
   - Each directory name near its limit (255 bytes)
   - Sufficient depth causes total path length to exceed 4096

2. **Dynamic path construction**
   - Runtime assembly via `getcwd()` + `strcat()` + filename
   - If caller doesn't validate buffer size, overflow occurs

3. **Symbolic link recursion**
   - Some systems limit symlink traversal depth independent of `PATH_MAX`

## Typical overflow pattern

```c
char full_path[PATH_MAX + 1];
getcwd(full_path, sizeof(full_path));  // Already a long path
strcat(full_path, "/");
strcat(full_path, user_filename);      // <= overflow possible
```

- `getcwd()` succeeds but mostly fills the buffer
- `strcat()` performs no bounds checking
- Long user input triggers stack overflow

## Risk in parent directory traversal

In deeply nested directory structures (`A/B/C/...`):

```c
for (int i = 0; i < 1000; i++) {
    chdir("..");  // move to parent
}
```

Relative path doesn't grow, but internal cwd tracking can accumulate path length.

# Modern context

## Security considerations

- Buffer overflow mitigation: modern compilers add `strcat()` checks with `-D_FORTIFY_SOURCE`
- `strlcpy()` / `strlcat()` preferred: explicit size limits
- `realpath()`: recommend dynamic allocation for path normalization

## File system independence

Actual pathname length constraints depend on file system:

- **ext4**: pathnames stored in inodes have no length constraint (managed via dentry)
- **NTFS/FAT**: stricter constraints (legacy)
- **FUSE**: user-space implementation offers more freedom

Relying on `PATH_MAX` thus limits portability.

## Containers and chroot

In [[chroot|chroot]] jails or container environments:

- Mount point changes alter path length calculations
- Symbolic link resolution outcomes differ
- Applications hardcoding `PATH_MAX` risk escape or overflow

# References

- "PATH_MAX is not a good limit": https://insanecoding.blogspot.com/2007/11/pathmax-simply-isnt.html
- Linux man pages: `man pathconf`, `man 2 getcwd`, `man 3 realpath`
- POSIX.1: https://pubs.opengroup.org/onlinepubs/9699919799/
- Linux kernel: include/uapi/linux/limits.h
