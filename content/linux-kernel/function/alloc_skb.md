---
title: alloc_skb
title_ko: alloc_skb
lang: en
draft: true
date: 2026-03-19
tags:
  - linux-kernel
  - networking
description: "{{description}}"
description_ko: "{{description_ko}}"
---
[lang:ko]
# 정의
```c
/**
 * alloc_skb - allocate a network buffer
 * @size: size to allocate
 * @priority: allocation mask
 *
 * This function is a convenient wrapper around __alloc_skb().
 */
static inline struct sk_buff *alloc_skb(unsigned int size,
					gfp_t priority)
{
	return __alloc_skb(size, priority, 0, NUMA_NO_NODE);
}

```

# 요약
[[struct sk_buff|skb]]를 할당받을 때 사용한다. [[__alloc_skb]] 를 이용해서 packet을 저장할 버퍼를 할당받는다.