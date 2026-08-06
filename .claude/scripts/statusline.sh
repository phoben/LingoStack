#!/usr/bin/env bash
# Claude Code statusLine 入口壳 —— 实际渲染在同目录的 statusline.mjs
#
# 为什么要这层壳：statusLine 命令由 spawn(cmd, {shell:true}) 执行，Windows 下落到
# ComSpec(cmd.exe)——$VAR 不展开、$() 与多语句都跑不了。而 CC 对以 .sh 结尾的命令会
# 自动前置 "bash "，于是把所有 shell 逻辑收进本文件，settings.json 只留一个相对路径。
#
# 定位 .mjs 用 BASH_SOURCE 自解析：无论本文件是在项目 in-tree 还是在 plugin cache 里，
# 都能找到同目录的渲染脚本，不依赖 CLAUDE_PROJECT_DIR。
# 若 plugin 已从 marketplace 安装，则优先用 cache 里版本号最高的那份。
#
# 降级：node 缺失或渲染异常时退化成纯 bash 一行——脚本无输出会让状态栏变空白。

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
input=$(cat)

# 终端宽度：CC 不注入 COLUMNS，自己问 tty；拿不到则由 .mjs 兜底 120
cols=$({ stty size </dev/tty | awk '{print $2}'; } 2>/dev/null)
[ -n "$cols" ] && export COLUMNS="$cols"

# 已安装的 plugin 优先（sort -V 取最高版本），否则用本文件所在目录
cache_dir=$(ls -1d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/scripts 2>/dev/null | sort -V | tail -1)
render="$here/statusline.mjs"
[ -f "$render" ] || render="$here/statusline.mjs"

if command -v node >/dev/null 2>&1 && [ -f "$render" ]; then
  out=$(printf '%s' "$input" | node "$render" 2>/dev/null)
  if [ -n "$out" ]; then
    printf '%s\n' "$out"
    exit 0
  fi
fi

# 兜底：只用 bash + jq 输出上下文百分比
pct=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // empty' 2>/dev/null)
if [ -n "$pct" ]; then
  printf '\033[90mctx\033[0m %s%%\n' "$(printf '%.0f' "$pct")"
else
  printf '\033[90mctx --\033[0m\n'
fi
