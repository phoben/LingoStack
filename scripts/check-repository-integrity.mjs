import { spawnSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const conflictMarkerPattern = /^(?:<{7}|>{7})(?:\s.*)?$/;

function normalizePath(path) {
  return path.split(sep).join("/");
}

function runGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`无法执行 git ${args.join(" ")}：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} 执行失败（退出码 ${result.status}）：${result.stderr.trim()}`,
    );
  }

  return result.stdout;
}

export function findConflictMarkers(path, content) {
  return content
    .split(/\r?\n/u)
    .flatMap((line, index) =>
      conflictMarkerPattern.test(line)
        ? [{ path, line: index + 1, content: line }]
        : [],
    );
}

export async function checkRepositoryIntegrity(root = process.cwd()) {
  const repositoryRoot = resolve(root);
  const unmergedFiles = runGit(repositoryRoot, [
    "diff",
    "--name-only",
    "--diff-filter=U",
  ])
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(normalizePath);

  const candidates = [
    ...new Set(
      runGit(repositoryRoot, [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
      ])
        .split("\0")
        .filter(Boolean),
    ),
  ];

  const conflictMarkers = [];
  for (const candidate of candidates) {
    const absolutePath = resolve(repositoryRoot, candidate);
    const displayPath = normalizePath(relative(repositoryRoot, absolutePath));
    const stat = await lstat(absolutePath).catch(() => null);
    if (!stat?.isFile()) {
      continue;
    }

    const buffer = await readFile(absolutePath);
    if (buffer.includes(0)) {
      continue;
    }
    conflictMarkers.push(
      ...findConflictMarkers(displayPath, buffer.toString("utf8")),
    );
  }

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (diffCheck.error) {
    throw new Error(`无法执行 git diff --check：${diffCheck.error.message}`);
  }
  if (![0, 2].includes(diffCheck.status)) {
    throw new Error(
      `git diff --check 执行失败（退出码 ${diffCheck.status}）：${diffCheck.stderr.trim()}`,
    );
  }

  return {
    root: repositoryRoot,
    unmergedFiles,
    conflictMarkers,
    diffErrors: diffCheck.status === 2 ? diffCheck.stdout.trim() : "",
  };
}

export function formatIntegrityFailure(result) {
  const sections = ["仓库完整性检查失败："];

  if (result.unmergedFiles.length > 0) {
    sections.push(
      "\n存在未解决的 Git 冲突：",
      ...result.unmergedFiles.map((path) => `- ${path}`),
    );
  }
  if (result.conflictMarkers.length > 0) {
    sections.push(
      "\n源码中残留冲突标记：",
      ...result.conflictMarkers.map(
        ({ path, line, content }) => `- ${path}:${line} ${content}`,
      ),
    );
  }
  if (result.diffErrors) {
    sections.push("\ngit diff --check 报告：", result.diffErrors);
  }

  sections.push("\n请先解决上述问题，再运行 pnpm check:integrity。");
  return sections.join("\n");
}

function parseRootArgument(args) {
  const rootIndex = args.indexOf("--root");
  if (rootIndex === -1) {
    return process.cwd();
  }
  const root = args[rootIndex + 1];
  if (!root) {
    throw new Error("--root 必须指定仓库目录");
  }
  return isAbsolute(root) ? root : resolve(process.cwd(), root);
}

async function main() {
  const result = await checkRepositoryIntegrity(
    parseRootArgument(process.argv.slice(2)),
  );
  if (
    result.unmergedFiles.length > 0 ||
    result.conflictMarkers.length > 0 ||
    result.diffErrors
  ) {
    console.error(formatIntegrityFailure(result));
    process.exitCode = 1;
    return;
  }
  console.log(
    "仓库完整性检查通过：未发现未解决冲突、冲突标记或 diff 格式错误。",
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`仓库完整性检查无法完成：${error.message}`);
    process.exitCode = 2;
  });
}
