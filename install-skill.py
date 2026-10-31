#!/usr/bin/env python3
"""把当前目录装成 Skill。

    python install-skill.py              同步到 ~/.workbuddy/skills/sound-fossil/
    python install-skill.py --link       改成目录联接，改源码即时生效（开发时用）
    python install-skill.py --target D:/somewhere/sound-fossil

只装 SKILL.md、scripts/、web/、serve.py。tools/ 和测试音频不进包。
web/ 是自包含的，被命令行和浏览器同时引用，所以必须一起装。

重复安装是同步式的：只覆盖同名文件、只删源里已经没有的文件，不做整目录删除。
"""

import argparse
import os
import shutil
import subprocess
import sys

NAME = "sound-fossil"
# package.json 必须一起装：没有它 Node 认不出 ESM，每次都会告警
PARTS = ["SKILL.md", "scripts", "web", "serve.py", "package.json"]
SKIP = {".git", "__pycache__", "node_modules", ".DS_Store"}


def default_target():
    return os.path.join(os.path.expanduser("~"), ".workbuddy", "skills", NAME)


def sync_tree(src, dst):
    """把 src 同步进 dst。覆盖同名文件，删掉源里已经没有的，不整个目录推倒重来。"""
    os.makedirs(dst, exist_ok=True)
    for entry in os.listdir(src):
        if entry in SKIP:
            continue
        s, d = os.path.join(src, entry), os.path.join(dst, entry)
        if os.path.isdir(s):
            sync_tree(s, d)
        else:
            shutil.copy2(s, d)
    for entry in os.listdir(dst):
        if entry in SKIP:
            continue
        if os.path.exists(os.path.join(src, entry)):
            continue
        d = os.path.join(dst, entry)
        if os.path.isdir(d):
            shutil.rmtree(d)
        else:
            os.remove(d)


def make_junction(link, target):
    """Windows 下建目录联接。普通符号链接要管理员权限，联接不用。"""
    if os.name != "nt":
        os.symlink(target, link, target_is_directory=True)
        return
    r = subprocess.run(["cmd", "/c", "mklink", "/J", link, target],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("mklink 失败：" + (r.stderr or r.stdout or "").strip())


def is_junction(path):
    """目录联接在 Windows 上 islink() 是 False，但 realpath 会指到别处。
    认出它很重要：对它递归删除会把源目录里的东西一起删掉。"""
    if os.name != "nt":
        return os.path.islink(path)
    if not os.path.isdir(path) or os.path.islink(path):
        return False
    return os.path.realpath(path) != os.path.abspath(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default=None, help="装到哪里，默认 ~/.workbuddy/skills/名称")
    ap.add_argument("--link", action="store_true", help="用目录联接代替复制")
    ap.add_argument("--remove", action="store_true", help="只卸载，不装")
    args = ap.parse_args()

    src = os.path.dirname(os.path.abspath(__file__))
    target = os.path.abspath(args.target or default_target())

    if not os.path.isfile(os.path.join(src, "SKILL.md")):
        print("源目录里没有 SKILL.md。")
        return 1

    if os.path.isdir(target) and is_junction(target):
        os.rmdir(target)
        print("已移除联接 %s" % target)
    elif os.path.isdir(target) and args.link:
        # 改成联接前得先有空位
        for part in PARTS:
            p = os.path.join(target, part)
            if os.path.isdir(p):
                shutil.rmtree(p)
            elif os.path.exists(p):
                os.remove(p)

    if args.remove:
        if os.path.isdir(target) and not is_junction(target):
            for part in PARTS:
                p = os.path.join(target, part)
                if os.path.isdir(p):
                    shutil.rmtree(p)
                elif os.path.exists(p):
                    os.remove(p)
            print("已移除 %s 里的 %s" % (target, "、".join(PARTS)))
        return 0

    os.makedirs(os.path.dirname(target), exist_ok=True)

    if args.link:
        make_junction(target, src)
        print("已联接 %s" % target)
        print("  -> %s" % src)
        print("改源码即时生效。tools/ 与测试音频也在联接里，这是开发模式的代价。")
    else:
        for part in PARTS:
            s, d = os.path.join(src, part), os.path.join(target, part)
            if os.path.isdir(s):
                sync_tree(s, d)
            else:
                os.makedirs(target, exist_ok=True)
                shutil.copy2(s, d)
            print("  + %s" % part)

    total, files = 0, 0
    for root, dirs, fs in os.walk(target):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in fs:
            total += os.path.getsize(os.path.join(root, f))
            files += 1

    print()
    print("装好了：%s（%d 个文件，%.1f MB）" % (target, files, total / 1024 / 1024))
    print()
    print("验证：")
    print("  cd %s && node scripts/fossil.js info 一段.wav" % target)
    print("  cd %s && python serve.py 8080" % target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
