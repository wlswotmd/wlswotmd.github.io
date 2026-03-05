---
title: 2026-seccon-review
title_ko: 2026-seccon-review
lang: en
draft: true
date: 2026-03-04
tags:
description: "{{description}}"
description_ko: "{{description_ko}}"
---
[lang:ko]
# 서론
나는 2021년 대학교 신입생 시절 CyKor에 들어가며 CTF를 시작했다. 그 당시 언젠가 DEFCON, SECCON, HITCON 본선에 나가야지라는 목표를 세웠고, 3학년 때 HITCON, 4학년 때 DEFCON 본선에 참여할 수 있게 되었지만, SECCON과는 영 인연이 없었다. 이번 SECCON 예선에서도 탈락해서 SECCON은 못 가겠구나라고 생각했는데 운 좋게 TSG CTF에서 1등을 하면서 드디어 SECCON 본선에 출전하게 되었다. 5년만에 이룬 목표인 만큼 이번 SECCON은 다른 대회들보다 더 의미있게 다가왔고, 더 기대하게 되었다.

이번 SECCON에 기대한 부분 중 하나는 AI를 이용한 pay-to-win 을 막는 것이었다. Agentic AI의 등장 이후 많은 CTF 문제들이 "이 문제 풀어줘"와 같이 단순한 프롬프트만으로 풀리는 경우가 빈번하게 발생했고, 이번 SECCON 예선에서도 reversing 문제들이 모두 AI에게 단순한 질문 몇 번으로 풀리는 상황이었어서 본선에서는 이런 일이 발생하지 않을까 걱정했다. 

결론부터 말하자면, 내 걱정은 기우였다. 적어도 내가 담당한 pwnable 분야에서는 인간 개입없이 AI 만으로 풀리는 문제는 없었다. AI는 pwnable 4개 문제에 포함된 취약점을 빠르게 찾는데는 성공했지만, 최종적으로 exploit 하는 것은 어려워 하는 모습을 보였다. 
## Jeopardy

> [!info] 문제 파일은 [여기](https://r3kapig-not1on.notion.site/SECCON-CTF-14-Jeopardy-KOTH-30aec1515fb980299c24f18e2793fc71)에서 다운로드 받을 수 있다.
### comproto


### eChOBOL
cobol

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. ECHO.
       AUTHOR. SHIFT-CROPS.

       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.

       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  RET-BYTES-READ          PIC S9(4) COMP.
       01  INDEX-BUFFER            PIC S9(4) COMP.
       01  BUFFER-INPUT            PIC X(64).
       01  BUFFER-TEMP             PIC X(64).
       01  FLAG-CONTINUE           PIC 9(1) VALUE 1.
       01  FLAG-INPUT-DONE         PIC 9(1).

       PROCEDURE DIVISION.
       MAIN-PROCEDURE.
           DISPLAY "============================================".
           DISPLAY "  COBOL ECHO SERVICE ".
           DISPLAY "============================================".
           DISPLAY " ".
           DISPLAY "Enter your messages (empty line to exit):".
           
           PERFORM READ-AND-ECHO-LOOP UNTIL FLAG-CONTINUE = 0.
           
           DISPLAY " ".
           DISPLAY "Goodbye!".
           DISPLAY "============================================".
           
           STOP RUN.

      *****************************************************************
      * READ AND ECHO LOOP - Process each message                     *
      *****************************************************************
       READ-AND-ECHO-LOOP.
           MOVE ALL X"00" TO BUFFER-INPUT.
           MOVE 1 TO INDEX-BUFFER.
           MOVE 0 TO FLAG-INPUT-DONE.

           DISPLAY "> " WITH NO ADVANCING.
           
           PERFORM READ-INPUT-LOOP UNTIL FLAG-INPUT-DONE = 1.
           
      *    Check if first input was just newline (exit condition)
           IF INDEX-BUFFER = 1
               MOVE ZERO TO FLAG-CONTINUE
           ELSE
               DISPLAY BUFFER-INPUT
           END-IF.

      *****************************************************************
      * READ INPUT LOOP - Concatenate input until newline            *
      *****************************************************************
       READ-INPUT-LOOP.
           MOVE ALL X"00" TO BUFFER-TEMP.
           
      *    Read from stdin into BUFFER-TEMP
           PERFORM READ-STDIN.
           
           IF RET-BYTES-READ <= 0
               MOVE 1 TO FLAG-INPUT-DONE
           ELSE IF BUFFER-TEMP(1:1) = X"0A"
               MOVE 1 TO FLAG-INPUT-DONE
           ELSE
               MOVE BUFFER-TEMP TO BUFFER-INPUT(INDEX-BUFFER:RET-BYTES-READ)
               
               ADD RET-BYTES-READ TO INDEX-BUFFER
               IF INDEX-BUFFER > 63
                   MOVE 1 TO FLAG-INPUT-DONE
               END-IF
           END-IF.

      *****************************************************************
      * READ-STDIN - Read from standard input                        *
      *****************************************************************
       READ-STDIN.
           CALL "read" USING
               BY VALUE 0
               BY REFERENCE BUFFER-TEMP
               BY VALUE 64
               RETURNING RET-BYTES-READ
           END-CALL.

       END PROGRAM ECHO.

```

### lazycry

### scrofa





[lang:en]

# English
