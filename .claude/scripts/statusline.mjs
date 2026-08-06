#!/usr/bin/env node
// Claude Code statusLine —— 两行式工作台
//   行1｜身份与坐标：输出样式 · 模型档位 · 仓库/worktree · issue/PR 可点链接
//   行2｜水位与产出：上下文进度条 · 耗时成本 · 改动分布与重编提示 · 服务在线灯
// 数据来自 stdin 的会话 JSON；git/端口等外部信号按 session 缓存 5 秒，避免拖慢刷新。
// 排版原则：按终端宽度自适应裁剪，段落有优先级，窄屏从最次要的一端丢。
// 降级：设 SL_ASCII=1 可切纯 ASCII 符号（终端字符宽度异常导致错位时使用）。

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ASCII = process.env.SL_ASCII === '1';
const CACHE_TTL_MS = 5000;
const BAR_CELLS = 10;
// 终端宽度：Claude Code 运行脚本前会写入 COLUMNS；留 4 列安全余量防换行
const TERM_COLS = Math.max(40, (parseInt(process.env.COLUMNS, 10) || 120) - 4);

// ── 符号表：非 emoji 几何字符，宽度比 emoji 稳定；ASCII 档为纯半角退路 ──
const S = ASCII
  ? { style: '*', wt: '@', link: '>', bar: '#', barBg: '-', edit: '~',
      warn: '!', on: 'o', off: '.', sep: '|', clock: 't', cost: '$' }
  : { style: '◈', wt: '⑉', link: '↗', bar: '█', barBg: '░', edit: '✎',
      warn: '▲', on: '◉', off: '◌', sep: '│', clock: '⏱', cost: '$' };

// ── 256 色调色板：暗背景友好，标签压暗、数值提亮，视觉重心落在数字上 ──
const c = (n) => (s) => `\x1b[38;5;${n}m${s}\x1b[0m`;
const DIM = c(244), FAINT = c(238), STYLE = c(117), MODEL = c(140);
const REPO = c(180), LINK = c(75), OK = c(114), WARN = c(221), BAD = c(203);
const CORE = c(209), LLM = c(212), SYS = c(141), PARSE = c(79), TAURI = c(222);
const UI = c(114), CARGO = c(166), WEB = c(150), CI = c(66), MONEY = c(179);
const DOC = c(109), CFG = c(137), HARN = c(105);

// OSC 8 超链接：Ctrl+点击可跳；不支持的终端只会显示纯文本，不会乱码
const hyper = (url, text) => `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;

// ── 显示宽度：中文/全角占 2 列，ANSI 与 OSC 8 序列占 0 列 ──
const STRIP = /\x1b\]8;;[^\x07]*\x07|\x1b\[[0-9;]*m/g;
function width(s) {
  let w = 0;
  for (const ch of s.replace(STRIP, '')) {
    const cp = ch.codePointAt(0);
    // CJK、全角标点、假名等宽字符区间
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff);
    w += wide ? 2 : 1;
  }
  return w;
}

// 按优先级组装一行：segs 为 {text, prio} 数组，prio 越大越先被裁掉
function compose(segs, gap) {
  const keep = segs.filter((s) => s && s.text);
  const order = [...keep].sort((a, b) => b.prio - a.prio);
  const dropped = new Set();
  const render = () =>
    keep.filter((s) => !dropped.has(s)).map((s) => s.text).join(gap);
  for (const s of order) {
    if (width(render()) <= TERM_COLS) break;
    if (dropped.size === keep.length - 1) break; // 至少留一段，不出空行
    dropped.add(s);
  }
  return render();
}

// ── 会话级缓存：同一会话内文件名稳定，跨会话隔离（官方推荐用 session_id）──
function cached(sessionId, key, compute) {
  const file = join(tmpdir(), `statusline-${key}-${sessionId}.json`);
  try {
    if (Date.now() - statSync(file).mtimeMs < CACHE_TTL_MS) {
      return JSON.parse(readFileSync(file, 'utf8'));
    }
  } catch { /* 无缓存或已过期，落到重算 */ }
  let val;
  try { val = compute(); } catch { val = null; }
  try { writeFileSync(file, JSON.stringify(val)); } catch { /* 临时目录不可写则跳过缓存 */ }
  return val;
}

const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim();

// ── 改动分布：把未提交文件按 LingoStack 的分层归类，顺带推出该重编/重启什么 ──
// 归类依据 CLAUDE.md「仓库布局」：crates/* 六个能力 crate + src-tauri 入口 + src 前端。
// Rust 侧按 crate 分开而不是笼统算「后端」，因为这几层的职责边界就是本项目的开发主线
// （内核纯逻辑 / LLM 协议 / 系统能力 / 文档解析 / Tauri 壳），一眼能看出这轮在哪层。
// 数组顺序即匹配优先级（首个命中即止），所以"更具体的规则必须排在更宽的目录规则之前"：
//   .claude/ 下大量是 .md（skill 文档），若 doc 在前则规约改动会被算成文档；
//   crates/*/ 与 src-tauri/ 里也有 README.md，若 crate 规则在前则文档会被误算成代码并误报重编。
// action 为 null 表示这类改动不需要重来一遍（文档、CI、纯静态配置），不参与提示。
const DOMAINS = [
  // harness 自身（agent/skill/hook/CLAUDE.md）：只计数，不提示重编。
  // 这类文件常长期挂在未提交状态，而 git status 不区分"本次会话改的"与"会话开始前就有的"，
  // 一旦参与提示就会恒亮，反映的是工作区脏不脏、而非这轮动过什么。
  { key: 'harn', label: '规约',   color: HARN,  action: null,
    test: (f) => f.startsWith('.claude/') || /^(CLAUDE|AGENTS)\.md$/.test(f) },
  { key: 'doc',  label: '文档',   color: DOC,   action: null,
    test: (f) => /\.(md|mdx|txt|adoc|rst)$/i.test(f) || f.startsWith('docs/') },
  { key: 'ci',   label: 'CI',     color: CI,    action: null,
    test: (f) => f.startsWith('.github/') },
  // Rust 侧：改哪个 crate 都得重编，Tauri dev 要重启进程才看得到
  { key: 'core', label: '内核',   color: CORE,  action: '重编Rust',
    test: (f) => f.startsWith('crates/lingostack-core/') },
  { key: 'llm',  label: 'LLM',    color: LLM,   action: '重编Rust',
    test: (f) => f.startsWith('crates/lingostack-llm/') },
  // 取词 / 热键 / TTS 三个平台能力 crate 合成一类：它们总是配套改，分开只会挤满状态栏
  { key: 'sys',  label: '系统',   color: SYS,   action: '重编Rust',
    test: (f) => /^crates\/lingostack-(selection|hook|tts)\//.test(f) },
  { key: 'parse', label: '解析',  color: PARSE, action: '重编Rust',
    test: (f) => f.startsWith('crates/lingostack-docparse/') },
  // Tauri 壳：IPC / 配置读写 / tauri.conf.json / ACL；conf 与 capabilities 是构建期读取，
  // 光重编不够，得把 tauri dev 整个重启，所以单独标一个动作
  { key: 'shell', label: 'Tauri', color: TAURI, action: '重启tauri dev',
    test: (f) => f === 'src-tauri/tauri.conf.json' || f.startsWith('src-tauri/capabilities/') },
  { key: 'rs',   label: 'Rust壳', color: TAURI, action: '重编Rust',
    test: (f) => f.startsWith('src-tauri/') || f.startsWith('crates/') },
  // 前端源码：Vite HMR 自动生效，不提示
  { key: 'ui',   label: '前端',   color: UI,    action: null,
    test: (f) => f.startsWith('src/') || f === 'index.html' },
  // Cargo 工作区依赖 / 工具链：动的是依赖与编译设置，要重编才生效
  { key: 'cargo', label: 'Cargo', color: CARGO, action: '重编Rust',
    test: (f) => /^(Cargo\.(toml|lock)|rust-toolchain\.toml|rustfmt\.toml)$/.test(f) },
  // 前端工程配置：只收真正需要重启 dev server 的那几个（tsconfig / eslint / components.json
  // 不影响已跑起来的 Vite，留给兜底配置类，免得误报重启）
  { key: 'web',  label: '前端配置', color: WEB, action: '重启Vite',
    test: (f) => /^(vite\.config\.ts|tailwind\.config\.ts|postcss\.config\.js|package\.json|pnpm-lock\.yaml)$/.test(f) },
  // 兜底配置类：上面各层目录内的配置已被层规则吃掉，这里只剩仓库级的 tsconfig/eslint/scripts 等
  // .js/.mjs/.cjs 也收进来（eslint.config.js 这类）：src/ 下的源码已被前端规则先吃掉，不会误伤
  { key: 'cfg',  label: '配置',   color: CFG,   action: null,
    test: (f) => /(^|\/)\.env(\.|$)/i.test(f) || f.startsWith('scripts/') ||
      /\.(ya?ml|json|jsonc|toml|ini|ps1|sh|bat|cmd|py|[cm]?js)$/i.test(f) || /^\.(editorconfig|gitattributes|gitignore|prettier)/.test(f) },
];

function gitSignals(cwd) {
  const out = { branch: '', staged: 0, dirty: 0, ahead: 0, counts: {}, worktrees: 0 };
  try { sh('git', ['rev-parse', '--git-dir'], cwd); } catch { return out; }
  try { out.branch = sh('git', ['branch', '--show-current'], cwd); } catch { /* 游离 HEAD */ }
  try {
    // porcelain 前两列是 XY 状态位，X=暂存区 Y=工作区
    // -uall 让未跟踪内容展开到文件级：默认只报目录名（script/），按端归类会漏算
    for (const line of sh('git', ['status', '--porcelain', '-uall'], cwd).split('\n').filter(Boolean)) {
      const xy = line.slice(0, 2);
      const path = line.slice(3).replace(/^.*? -> /, '').replace(/^"|"$/g, '');
      if (xy[0] !== ' ' && xy[0] !== '?') out.staged++; else out.dirty++;
      const hit = DOMAINS.find((d) => d.test(path));
      if (hit) out.counts[hit.key] = (out.counts[hit.key] || 0) + 1;
    }
  } catch { /* 状态取不到就当干净 */ }
  try { out.ahead = parseInt(sh('git', ['rev-list', '--count', '@{u}..HEAD'], cwd), 10) || 0; } catch { /* 无上游 */ }
  try {
    out.worktrees = sh('git', ['worktree', 'list'], cwd).split('\n').filter(Boolean).length;
  } catch { /* 非 worktree 仓库 */ }
  return out;
}

// ── 服务在线灯：亮=在跑，暗=没起。一次 netstat 拿全部监听端口 ──
// 1420 = Vite dev server（vite.config.ts strictPort，tauri.conf.json devUrl 指向它）
// 11434 = 本地 Ollama，对着它调试离线提供商时才需要
const SERVICES = [{ name: 'Vite', port: 1420 }, { name: 'Ollama', port: 11434 }];
function listeningPorts() {
  try {
    const raw = sh('netstat', ['-ano']);
    const live = new Set();
    for (const line of raw.split('\n')) {
      if (!/LISTENING/i.test(line)) continue;
      const m = line.match(/:(\d+)\s/);
      if (m) live.add(parseInt(m[1], 10));
    }
    return [...live];
  } catch { return []; }
}

// ── 格式化小工具 ──
const kilo = (n) => {
  if (n < 1e3) return `${n}`;
  if (n < 1e6) return `${Math.round(n / 1e3)}k`;
  const m = n / 1e6;
  // 整数兆去掉小数尾巴：1.0M → 1M
  return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
};

function hhmm(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`;
}

// 水位配色：宽裕→留意→告急，三档统一供进度条与百分比使用
const levelColor = (pct) => (pct >= 80 ? BAD : pct >= 50 ? WARN : OK);

// 进度条：向下取整，>0 至少一格，未满 100% 至少留一格空（满格只代表真的满）
function bar(pct, color) {
  let filled = Math.floor((pct * BAR_CELLS) / 100);
  if (pct > 0 && filled === 0) filled = 1;
  if (pct < 100 && filled >= BAR_CELLS) filled = BAR_CELLS - 1;
  filled = Math.max(0, Math.min(BAR_CELLS, filled));
  const empty = BAR_CELLS - filled;
  // 空串不套色码，避免输出多余转义序列
  return (filled ? color(S.bar.repeat(filled)) : '') + (empty ? FAINT(S.barBg.repeat(empty)) : '');
}

// 模型名压缩：display_name 常带括号后缀，只留核心型号
const shortModel = (name = '', id = '') => {
  const base = (name || id).replace(/\s*\(.*?\)\s*/g, '').trim();
  const m = base.match(/(Opus|Sonnet|Haiku|Fable)\s*([\d.]+)?/i);
  return m ? `${m[1]}${m[2] ? m[2] : ''}` : base.slice(0, 12) || '—';
};

// ══ 行一：身份与坐标 —— 我是谁、在哪、这活对着哪个 issue ══
function lineIdentity(d, git) {
  const segs = [];

  // 输出样式：plugin 样式形如 "lingostack:译栈"，只显示冒号后半截
  const style = (d.output_style?.name || '').split(':').pop();
  if (style) segs.push({ prio: 3, text: STYLE(`${S.style} ${style}`) });

  // 模型 · 推理档位 · 扩展思考：切换后能立刻确认生效
  const model = d.model?.display_name || d.model?.id;
  if (model) {
    const bits = [shortModel(d.model?.display_name, d.model?.id)];
    if (d.effort?.level) bits.push(d.effort.level);
    if (d.thinking?.enabled) bits.push('think');
    segs.push({ prio: 5, text: MODEL(bits.join('·')) });
  }

  // 仓库 + worktree：多 worktree 并行时防改错副本
  const repo = d.workspace?.repo?.name;
  const wt = d.workspace?.git_worktree || d.worktree?.name;
  const loc = [];
  if (repo) loc.push(REPO(repo));
  if (wt) {
    // 同仓库存在其它 worktree 时标出总数，提醒这只是其中一份
    const badge = git.worktrees > 1 ? FAINT(`(${git.worktrees})`) : '';
    loc.push(WARN(`${S.wt}${wt}`) + badge);
  }
  if (loc.length) segs.push({ prio: 2, text: loc.join(' ') });

  // issue / PR：都做成 Ctrl+点击可跳的链接
  const host = d.workspace?.repo?.host, owner = d.workspace?.repo?.owner;
  const links = [];
  const issueNo = (git.branch.match(/issue[-_]?(\d+)/i) || [])[1];
  if (issueNo && host && owner && repo) {
    links.push(LINK(hyper(`https://${host}/${owner}/${repo}/issues/${issueNo}`, `#${issueNo}`)));
  }
  if (d.pr?.number) {
    // 审查状态直接决定颜色：通过=绿、要改=红、其余=黄
    const st = d.pr.review_state;
    const paint = st === 'approved' ? OK : st === 'changes_requested' ? BAD : WARN;
    const mark = st === 'approved' ? '✓' : st === 'changes_requested' ? '✗' : st === 'draft' ? '◦' : '·';
    const url = d.pr.url || `https://${host}/${owner}/${repo}/pull/${d.pr.number}`;
    links.push(paint(hyper(url, `PR${d.pr.number}${mark}`)));
  }
  if (links.length) segs.push({ prio: 1, text: links.join(' ') });

  return compose(segs, DIM('  '));
}

// ══ 行二：水位与产出 —— 还能聊多久、花了多少、动了哪些端、服务起没起 ══
function lineVitals(d, git, ports) {
  const segs = [];
  const cw = d.context_window;
  const pct = cw?.used_percentage == null ? null : Math.max(0, Math.min(100, Math.round(cw.used_percentage)));

  // 上下文进度条：最高优先级，永不裁剪
  if (pct == null) {
    segs.push({ prio: 0, text: `${FAINT(S.barBg.repeat(BAR_CELLS))} ${DIM('--')}` });
  } else {
    const paint = levelColor(pct);
    const tok = cw.total_input_tokens != null && cw.context_window_size
      ? DIM(` ${kilo(cw.total_input_tokens)}/${kilo(cw.context_window_size)}`) : '';
    segs.push({ prio: 0, text: `${bar(pct, paint)} ${paint(`${pct}%`)}${tok}` });
  }

  // 耗时与成本
  if (d.cost?.total_duration_ms) segs.push({ prio: 7, text: DIM(`${S.clock} ${hhmm(d.cost.total_duration_ms)}`) });
  if (d.cost?.total_cost_usd != null) {
    segs.push({ prio: 8, text: MONEY(`${S.cost}${d.cost.total_cost_usd.toFixed(2)}`) });
  }

  // 改动分布：按层计数，并据此提示该重编/重启什么
  const hits = DOMAINS.filter((x) => git.counts[x.key]);
  if (hits.length) {
    const detail = hits.map((x) => x.color(`${x.label}${git.counts[x.key]}`)).join(DIM('·'));
    segs.push({ prio: 4, text: `${DIM(S.edit)} ${detail}` });
    // 只有需要重来一遍的类才进提示：纯文档/CI/前端源码改动不该误报"重编Rust"
    // action 本身已含动词（重编Rust / 重启tauri dev），直接拼不再前置"重启"
    let actions = [...new Set(hits.map((x) => x.action).filter(Boolean))];
    // 强动作吸收弱动作：重启 tauri dev 顺带重编 Rust 并拉起 Vite，同列就成了废话
    if (actions.includes('重启tauri dev')) actions = actions.filter((a) => a === '重启tauri dev');
    if (actions.length) segs.push({ prio: 6, text: WARN(`${S.warn}${actions.join('/')}`) });
  }

  // 未推送提交：本地领先上游时提醒
  if (git.ahead > 0) segs.push({ prio: 9, text: DIM(`↑${git.ahead}`) });

  // 服务在线灯：亮=在跑、暗=没起
  if (ports) {
    const lamps = SERVICES.map((s) =>
      ports.includes(s.port) ? OK(`${S.on}${s.name}`) : FAINT(`${S.off}${s.name}`)).join(' ');
    segs.push({ prio: 10, text: lamps });
  }

  return compose(segs, DIM(`  ${S.sep}  `));
}

// ── 入口：读 stdin，任何异常都退化成极简一行，绝不让状态栏变空白 ──
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (ch) => { raw += ch; });
process.stdin.on('end', () => {
  let d = {};
  try { d = JSON.parse(raw) || {}; } catch { /* 输入损坏则全走缺省 */ }
  try {
    const cwd = d.workspace?.current_dir || d.cwd || process.cwd();
    const sid = d.session_id || 'nosession';
    const git = cached(sid, 'git', () => gitSignals(cwd)) || { branch: '', counts: {}, ahead: 0, worktrees: 0 };
    const ports = cached(sid, 'ports', () => listeningPorts());
    // 行一可能整段为空（如空输入），此时只输出行二，不留空行
    const lines = [lineIdentity(d, git), lineVitals(d, git, ports)].filter((l) => l.trim());
    process.stdout.write(`${lines.join('\n')}\n`);
  } catch {
    const pct = d.context_window?.used_percentage;
    process.stdout.write(`${DIM('ctx')} ${pct == null ? '--' : `${Math.round(pct)}%`}\n`);
  }
});
