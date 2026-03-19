---
title: kmalloc_reserve
title_ko: kmalloc_reserve
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
/*
 * kmalloc_reserve is a wrapper around kmalloc_node_track_caller that tells
 * the caller if emergency pfmemalloc reserves are being used. If it is and
 * the socket is later found to be SOCK_MEMALLOC then PFMEMALLOC reserves
 * may be used. Otherwise, the packet data may be discarded until enough
 * memory is free
 */
static void *kmalloc_reserve(unsigned int *size, gfp_t flags, int node,
			     bool *pfmemalloc)
{
	bool ret_pfmemalloc = false;
	size_t obj_size;
	void *obj;

	obj_size = SKB_HEAD_ALIGN(*size);
	if (obj_size <= SKB_SMALL_HEAD_CACHE_SIZE &&
	    !(flags & KMALLOC_NOT_NORMAL_BITS)) {
		obj = kmem_cache_alloc_node(net_hotdata.skb_small_head_cache,
				flags | __GFP_NOMEMALLOC | __GFP_NOWARN,
				node);
		*size = SKB_SMALL_HEAD_CACHE_SIZE;
		if (obj || !(gfp_pfmemalloc_allowed(flags)))
			goto out;
		/* Try again but now we are using pfmemalloc reserves */
		ret_pfmemalloc = true;
		obj = kmem_cache_alloc_node(net_hotdata.skb_small_head_cache, flags, node);
		goto out;
	}

	obj_size = kmalloc_size_roundup(obj_size);
	/* The following cast might truncate high-order bits of obj_size, this
	 * is harmless because kmalloc(obj_size >= 2^32) will fail anyway.
	 */
	*size = (unsigned int)obj_size;

	/*
	 * Try a regular allocation, when that fails and we're not entitled
	 * to the reserves, fail.
	 */
	obj = kmalloc_node_track_caller(obj_size,
					flags | __GFP_NOMEMALLOC | __GFP_NOWARN,
					node);
	if (obj || !(gfp_pfmemalloc_allowed(flags)))
		goto out;

	/* Try again but now we are using pfmemalloc reserves */
	ret_pfmemalloc = true;
	obj = kmalloc_node_track_caller(obj_size, flags, node);

out:
	if (pfmemalloc)
		*pfmemalloc = ret_pfmemalloc;

	return obj;
}

```

# 요약
