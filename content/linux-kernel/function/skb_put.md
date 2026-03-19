---
title: "skb_put"
title_ko: "skb_put"
lang: en
draft: true
date: "2026-03-19"
tags:
description: "{{description}}"
description_ko: "{{description_ko}}"
---
[lang:ko]

# 한국어

[lang:en]

# English

[lang:ko]
# 정의
```c
/**
 *	skb_put - add data to a buffer
 *	@skb: buffer to use
 *	@len: amount of data to add
 *
 *	This function extends the used data area of the buffer. If this would
 *	exceed the total buffer size the kernel will panic. A pointer to the
 *	first byte of the extra data is returned.
 */
void *skb_put(struct sk_buff *skb, unsigned int len)
{
	void *tmp = skb_tail_pointer(skb);
	SKB_LINEAR_ASSERT(skb);
	skb->tail += len;
	skb->len  += len;
	if (unlikely(skb->tail > skb->end))
		skb_over_panic(skb, len, __builtin_return_address(0));
	return tmp;
}
EXPORT_SYMBOL(skb_put);
```

# 요약
skb 에 data를 복사하기 전에 미리 tailroom을 

```
skb->tail += len;
skb->len  += len;
```