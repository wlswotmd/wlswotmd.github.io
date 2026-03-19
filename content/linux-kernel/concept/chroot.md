---
title: "chroot"
title_ko: "chroot"
lang: en
draft: false
date: 2026-02-20
tags:
  - linux-kernel
  - chroot
  - process-isolation
llm-generated: true
description: "Brief overview of chroot, process isolation via root directory change, and its limitations."
description_ko: "chroot의 개념, 루트 디렉토리 변경을 통한 프로세스 격리, 그리고 그 한계를 간단히 정리."
---

[lang:ko]

> [!warning]
> 이 글은 LLM을 이용해 작성되었습니다. 부정확한 내용이 있을 수 있습니다.

# TL;DR

- `chroot()`는 프로세스가 접근할 수 있는 파일 시스템의 루트를 변경하는 시스템 호출
- 논리적 격리 메커니즘이며, 디렉토리 구조와 VFS(Virtual File System)를 이용한 단순한 샌드박싱 기법
- 완전한 격리가 아니며, 부모 디렉토리 탐색, 장치 접근, 권한 문제 등으로 탈출 가능
- 현대 Linux 컨테이너의 기초이지만, 단독으로는 프로덕션 보안을 위해 부족함

# 개념

## chroot란

`chroot`는 프로세스의 **루트 디렉토리를 변경**하는 시스템 호출입니다. 호출 후, 프로세스는 지정된 디렉토리 이하만 접근할 수 있게 됩니다.

```c
int chroot(const char *path);
```

- `path`: 새로운 루트로 설정할 디렉토리의 경로
- 성공 시 0, 실패 시 -1 반환
- 루트 권한(CAP_SYS_CHROOT capability)이 필요

## chroot jail 구조

일반적으로 chroot jail은 다음과 같이 구성됩니다:

1. 빈 디렉토리 또는 제한된 파일 시스템 트리 생성
2. 필요한 라이브러리, 바이너리를 복사 (또는 마운트)
3. 호출 프로세스의 루트를 해당 디렉토리로 변경
4. 프로세스는 이제 "jail" 내부에서만 동작

## VFS와의 상호작용

chroot는 VFS(Virtual File System) 레벨에서 동작합니다:

- 각 프로세스는 `struct fs_struct` (또는 VFS 관련 구조)에서 **루트 dentry를 가짐**
- `chroot()` 호출 시, 이 루트 dentry를 새 디렉토리의 dentry로 변경
- 이후 경로 이름 탐색(pathname resolution)은 이 새 루트에서 시작

# 한계와 탈출 기법

chroot의 격리는 **논리적**이며, 구조적 완전성을 보장하지 않습니다.

## 주요 한계

1. **부모 디렉토리 탐색**
   - `chroot jail 내부`에서 생성된 새로운 디렉토리로 `chdir`한 후, 반복적으로 `chdir("..")`을 호출하면 jail 밖으로 나갈 수 있음
   - 이유: 루트(/)에 도달한 후에도 VFS는 실제 파일 시스템의 상위 디렉토리가 존재함을 알고 있음

2. **장치 접근**
   - `/dev` 내 장치 파일에 직접 접근 가능 (jail 제대로 설정되지 않았을 경우)
   - 메모리, 디스크 직접 접근 가능

3. **권한 문제**
   - 루트 권한(또는 관련 capability)을 가진 프로세스는 chroot를 벗어날 수 있음
   - 루트는 새 파일 시스템을 마운트하거나 다른 chroot를 호출 가능

## 탈출 예시

```c
// jail 내부에서 실행
chdir("jail_root"); // jail로의 상대 경로
for (int i = 0; i < 100; i++) {
    chdir("..");  // 반복적으로 부모 탐색
}
chroot(".");      // 실제 루트로 재설정
// 이제 jail 밖에 접근 가능
```

# 현대적 맥락

## 도커와 컨테이너

- Docker는 chroot를 기반으로 하지만, **namespace(pid, net, mount, ipc, uts, user)** 와 **cgroup**을 추가하여 완전한 격리 구현
- chroot만으로는 PID, network, 마운트 namespace 격리가 없음

## 보안 권장사항

- 단독 격리 기법으로는 사용 금지
- 필수: 루트 권한 제거 + namespace 격리 + cgroup 제한
- 중요: 파일 시스템 권한 설정과 주기적 감시

# 참고

- chroot의 완전성 부족: [PATH_MAX 초과로 인한 획득 가능성](https://insanecoding.blogspot.com/2007/11/pathmax-simply-isnt.html)
- Linux man pages: `man chroot`, `man 2 chroot`

---

[lang:en]

> [!warning]
> This post was generated with an LLM. It may contain inaccuracies.

# TL;DR

- `chroot()` is a system call that changes the root directory of a process's accessible file system
- A logical isolation mechanism using directory structures and VFS (Virtual File System); a simple sandboxing technique
- Not a complete isolation; escapable via parent directory traversal, device access, privilege issues
- Foundation for modern Linux containers but insufficient alone for production security

# Concept

## What is chroot

`chroot` is a system call that **changes the root directory** of a process. After the call, the process can only access files and directories beneath the specified directory.

```c
int chroot(const char *path);
```

- `path`: path to the directory to be set as the new root
- Returns 0 on success, -1 on failure
- Requires root privilege (CAP_SYS_CHROOT capability)

## chroot jail structure

A typical chroot jail is set up as follows:

1. Create an empty directory or restricted file system tree
2. Copy (or mount) necessary libraries and binaries
3. Change the calling process's root to that directory
4. The process now operates only "inside the jail"

## Interaction with VFS

chroot operates at the VFS (Virtual File System) level:

- Each process holds a **root dentry** in `struct fs_struct` (or VFS-related structures)
- On `chroot()` call, this root dentry is replaced with the dentry of the new directory
- Subsequent pathname resolution starts from this new root

# Limitations and escape techniques

chroot isolation is **logical** and does not guarantee structural integrity.

## Key limitations

1. **Parent directory traversal**
   - From inside a chroot jail, if you `chdir` into a newly created directory and repeatedly call `chdir("..")`, you can escape the jail
   - Reason: after reaching the root (/), the VFS still knows that actual file system parent directories exist

2. **Device access**
   - Direct access to device files in `/dev` is possible (if the jail is misconfigured)
   - Direct memory and disk access possible

3. **Privilege issues**
   - A process with root privileges (or related capabilities) can escape chroot
   - Root can mount new file systems or call chroot again

## Escape example

```c
// Execute inside the jail
chdir("jail_root"); // relative path to the jail
for (int i = 0; i < 100; i++) {
    chdir("..");  // repeatedly traverse parents
}
chroot(".");      // reset to the actual root
// Now able to access outside the jail
```

# Modern context

## Docker and containers

- Docker uses chroot as a foundation but adds **namespaces (pid, net, mount, ipc, uts, user)** and **cgroups** for complete isolation
- chroot alone provides no isolation of PID, network, or mount namespaces

## Security recommendations

- Do not use as a standalone isolation technique
- Essential: remove root privileges + namespace isolation + cgroup limits
- Important: proper file system permissions and regular monitoring

# References

- Incompleteness of chroot: [PATH_MAX overflow exploitability](https://insanecoding.blogspot.com/2007/11/pathmax-simply-isnt.html)
- Linux man pages: `man chroot`, `man 2 chroot`
