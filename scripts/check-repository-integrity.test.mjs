import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  checkRepositoryIntegrity,
  findConflictMarkers,
  formatIntegrityFailure,
} from "./check-repository-integrity.mjs";

const temporaryDirectories = [];

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), "lingostack-integrity-"));
  temporaryDirectories.push(root);
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], {
    cwd: root,
    windowsHide: true,
  });
  execFileSync("git", ["config", "user.name", "Integrity Test"], {
    cwd: root,
    windowsHide: true,
  });
  execFileSync("git", ["config", "user.email", "integrity@example.test"], {
    cwd: root,
    windowsHide: true,
  });
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("repository integrity checker", () => {
  it("只识别真正的冲突边界，不误报 Markdown 分隔线", () => {
    const start = "<".repeat(7);
    const end = ">".repeat(7);
    const findings = findConflictMarkers(
      "docs/example.md",
      [`${start} HEAD`, "=======", `${end} feature`, "正常内容"].join("\n"),
    );

    assert.deepEqual(
      findings.map(({ line, content }) => ({ line, content })),
      [
        { line: 1, content: `${start} HEAD` },
        { line: 3, content: `${end} feature` },
      ],
    );
  });

  it("扫描已跟踪与未忽略文件，并跳过二进制内容", async () => {
    const root = await createRepository();
    await writeFile(join(root, "tracked.txt"), "clean\n", "utf8");
    execFileSync("git", ["add", "tracked.txt"], {
      cwd: root,
      windowsHide: true,
    });
    await writeFile(
      join(root, "untracked.txt"),
      `${"<".repeat(7)} HEAD\nvalue\n${">".repeat(7)} branch\n`,
      "utf8",
    );
    await writeFile(
      join(root, "binary.bin"),
      Buffer.from([0, ...Buffer.from("<<<<<<< HEAD", "utf8")]),
    );

    const result = await checkRepositoryIntegrity(root);

    assert.deepEqual(
      result.conflictMarkers.map(({ path, line }) => ({ path, line })),
      [
        { path: "untracked.txt", line: 1 },
        { path: "untracked.txt", line: 3 },
      ],
    );
    assert.match(formatIntegrityFailure(result), /untracked\.txt:1/u);
  });

  it("干净仓库返回空报告", async () => {
    const root = await createRepository();
    await writeFile(
      join(root, "clean.ts"),
      "export const value = 1;\n",
      "utf8",
    );
    execFileSync("git", ["add", "clean.ts"], { cwd: root, windowsHide: true });

    const result = await checkRepositoryIntegrity(root);

    assert.deepEqual(result.unmergedFiles, []);
    assert.deepEqual(result.conflictMarkers, []);
    assert.equal(result.diffErrors, "");
  });

  it("报告 git diff 格式错误", async () => {
    const root = await createRepository();
    await writeFile(join(root, "format.txt"), "clean\n", "utf8");
    execFileSync("git", ["add", "format.txt"], {
      cwd: root,
      windowsHide: true,
    });
    execFileSync("git", ["commit", "--quiet", "-m", "base"], {
      cwd: root,
      windowsHide: true,
    });
    await writeFile(
      join(root, "format.txt"),
      "trailing whitespace  \n",
      "utf8",
    );

    const result = await checkRepositoryIntegrity(root);

    assert.match(result.diffErrors, /trailing whitespace/u);
  });

  it("报告相对基准提交中已经提交的格式错误", async () => {
    const root = await createRepository();
    await writeFile(join(root, "format.txt"), "clean\n", "utf8");
    execFileSync("git", ["add", "format.txt"], {
      cwd: root,
      windowsHide: true,
    });
    execFileSync("git", ["commit", "--quiet", "-m", "base"], {
      cwd: root,
      windowsHide: true,
    });
    const base = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    await writeFile(
      join(root, "format.txt"),
      "committed trailing whitespace  \n",
      "utf8",
    );
    execFileSync("git", ["commit", "--quiet", "-am", "bad formatting"], {
      cwd: root,
      windowsHide: true,
    });

    const result = await checkRepositoryIntegrity(root, base);

    assert.match(result.diffErrors, /trailing whitespace/u);
  });

  it("报告 Git 索引中的未解决冲突", async () => {
    const root = await createRepository();
    const conflictPath = join(root, "conflict.txt");
    await writeFile(conflictPath, "base\n", "utf8");
    execFileSync("git", ["add", "conflict.txt"], {
      cwd: root,
      windowsHide: true,
    });
    execFileSync("git", ["commit", "--quiet", "-m", "base"], {
      cwd: root,
      windowsHide: true,
    });
    execFileSync("git", ["checkout", "--quiet", "-b", "feature"], {
      cwd: root,
      windowsHide: true,
    });
    await writeFile(conflictPath, "feature\n", "utf8");
    execFileSync("git", ["commit", "--quiet", "-am", "feature"], {
      cwd: root,
      windowsHide: true,
    });
    execFileSync("git", ["checkout", "--quiet", "main"], {
      cwd: root,
      windowsHide: true,
    });
    await writeFile(conflictPath, "main\n", "utf8");
    execFileSync("git", ["commit", "--quiet", "-am", "main"], {
      cwd: root,
      windowsHide: true,
    });
    assert.throws(
      () =>
        execFileSync("git", ["merge", "feature"], {
          cwd: root,
          stdio: "pipe",
          windowsHide: true,
        }),
      /Command failed/u,
    );

    const result = await checkRepositoryIntegrity(root);

    assert.deepEqual(result.unmergedFiles, ["conflict.txt"]);
    assert.equal(result.conflictMarkers.length, 2);
  });
});
