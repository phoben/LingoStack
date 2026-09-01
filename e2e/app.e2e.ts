async function invokeTauri<T>(
  command: string,
  args: Record<string, unknown> = {},
) {
  return browser.execute(
    async (name: string, payload: Record<string, unknown>) => {
      const tauri = window as unknown as {
        __TAURI__: {
          core: {
            invoke: <Result>(
              command: string,
              args: Record<string, unknown>,
            ) => Promise<Result>;
          };
        };
      };
      return tauri.__TAURI__.core.invoke<T>(name, payload);
    },
    command,
    args,
  );
}

async function invokeE2eFixture(
  command: string,
  args: Record<string, unknown> = {},
) {
  await invokeTauri<void>(command, args);
}

async function renderedPageContains(text: string) {
  return browser.execute(
    (expected: string) => document.body.innerText.includes(expected),
    text,
  );
}

describe("LingoStack desktop E2E", () => {
  before(async () => {
    await browser.waitUntil(
      async () => (await $("nav[aria-label='主导航']")).isExisting(),
      {
        timeout: 30_000,
        timeoutMsg: "主导航未在限定时间内出现",
      },
    );
    const bridgeReady = await browser.execute(() => "wdioTauri" in window);
    expect(bridgeReady).toBe(true);
    await browser.execute(async () => {
      localStorage.clear();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("lingostack");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      });
    });
  });

  it("starts and navigates between the core views", async () => {
    await $("button=设置").click();
    await expect($("nav[aria-label='Settings sections']")).toBeDisplayed();
    await $("button=翻译").click();
    await expect($("textarea")).toBeEnabled();
  });

  it("streams a deterministic translation through real IPC", async () => {
    const input = await $("textarea");
    await input.clearValue();
    await input.setValue("E2E_SUCCESS");
    await $("button[aria-label='执行翻译']").click();
    const output = await $("[aria-live='polite'][aria-busy]");
    await expect(output).toHaveText("确定性的 E2E 翻译结果");
  });

  it("shows a deterministic error and retries successfully", async () => {
    const input = await $("textarea");
    await input.clearValue();
    await input.setValue("E2E_ERROR_THEN_SUCCESS");
    await $("button[aria-label='执行翻译']").click();
    await expect($("[role='alert']")).toHaveText(
      expect.stringContaining("E2E fixture"),
    );
    await $("button=重试").click();
    // The retry fixture can finish before WebDriver observes transient busy
    // state; the stable live region is the user-visible completion contract.
    await expect($("[aria-live='polite']")).toHaveText("确定性的 E2E 翻译结果");
  });

  it("persists the configured test model through the settings UI", async () => {
    await $("button=设置").click();
    await $("button=AI").click();
    await expect($("select[aria-label='文档']")).toBeDisplayed();
    const select = await $("select[aria-label='翻译']");
    await select.selectByAttribute("value", "e2e::lingostack-e2e");
    await browser.refresh();
    await $("button=设置").click();
    await $("button=AI").click();
    await expect($("select[aria-label='翻译']")).toHaveValue(
      "e2e::lingostack-e2e",
    );
  });

  it("adds a translated result to favorites", async () => {
    await $("button=翻译").click();
    const input = await $("textarea");
    await input.clearValue();
    await input.setValue("E2E_SUCCESS");
    await $("button[aria-label='执行翻译']").click();
    await expect($("[aria-live='polite'][aria-busy]")).toHaveText(
      "确定性的 E2E 翻译结果",
    );
    await $("button[aria-label='收藏']").click();
    await $("button=收藏").click();
    await expect($("button[aria-label^='删除 ']")).toBeDisplayed();
  });

  it("renders fixture terms without leaking the protocol envelope", async () => {
    await $("button=翻译").click();
    const input = await $("textarea");
    await input.clearValue();
    await input.setValue("E2E_TERMS");
    await $("button[aria-label='执行翻译']").click();
    await expect($("section[aria-label='上下文术语'] button")).toHaveText(
      "fixture",
    );
    await expect($("[aria-live='polite'][aria-busy]")).not.toHaveText(
      expect.stringContaining("LINGOSTACK_TERMS_V1"),
    );
  });

  it("floats term explanations and toggles a persisted term favorite", async () => {
    await $("button=翻译").click();
    const input = await $("textarea");
    await input.clearValue();
    await input.setValue("E2E_TERMS");
    await $("button[aria-label='执行翻译']").click();
    await expect($("section[aria-label='上下文术语']")).toBeDisplayed();
    const terms = await $("section[aria-label='上下文术语']");
    const term = await terms.$("button=fixture");
    const heightBefore = await terms.getSize("height");

    await term.click();
    const tooltip = await $("[role='tooltip']");
    await expect(tooltip).toBeDisplayed();
    await expect(tooltip).toHaveText("确定性测试术语");
    const placement = await browser.execute(() => {
      const element = document.querySelector("[role='tooltip']");
      return {
        parentIsBody: element?.parentElement === document.body,
        position: element ? getComputedStyle(element).position : null,
      };
    });
    expect(placement).toEqual({ parentIsBody: true, position: "fixed" });
    expect(await terms.getSize("height")).toBe(heightBefore);

    const favorite = await terms.$("button[aria-pressed='false']");
    await favorite.click();
    await expect(terms.$("button[aria-pressed='true']")).toBeDisplayed();
    await terms.$("button[aria-pressed='true']").click();
    await expect(terms.$("button[aria-pressed='false']")).toBeDisplayed();
  });

  it("keeps a long favorite row bounded and expands it on demand", async () => {
    await $("button=翻译").click();
    const longSource = `LONG_FAVORITE_${"unbroken-token-".repeat(36)}`;
    const input = await $("textarea");
    await input.clearValue();
    await input.setValue(longSource);
    await $("button[aria-label='执行翻译']").click();
    await expect($("[aria-live='polite'][aria-busy]")).toHaveText(
      "确定性的 E2E 翻译结果",
    );
    await $("button[aria-label='收藏']").click();
    await $("button=收藏").click();

    const showMore = await $("button=展开");
    await expect(showMore).toBeDisplayed();
    await expect(showMore).toHaveAttribute("aria-expanded", "false");
    const bounded = await browser.execute(() => {
      const button = [...document.querySelectorAll("button")].find(
        (element) => element.textContent?.trim() === "展开",
      );
      const row = button?.closest(".grid.shrink-0");
      const clamped = row?.querySelector("span.line-clamp-3");
      return {
        rowFits: row ? row.scrollWidth <= row.clientWidth + 1 : false,
        hasClampedText: Boolean(clamped),
      };
    });
    expect(bounded).toEqual({ rowFits: true, hasClampedText: true });

    await showMore.click();
    await expect($("button=收起")).toHaveAttribute("aria-expanded", "true");
    const expanded = await browser.execute(() => {
      const button = [...document.querySelectorAll("button")].find(
        (element) => element.textContent?.trim() === "收起",
      );
      return (
        button
          ?.closest(".grid.shrink-0")
          ?.querySelector("span.line-clamp-3") === null
      );
    });
    expect(expanded).toBe(true);

    await $("button[aria-label^='删除 LONG_FAVORITE_']").click();
  });

  it("lays five naming candidates across every naming style", async () => {
    await $("button=命名").click();
    const input = await $("input[placeholder]");
    await input.clearValue();
    await input.setValue("E2E_NAMING");
    await $("button=生成").click();
    await expect(
      $("//span[normalize-space()='cacheInvalidator']"),
    ).toBeDisplayed();
    await expect(
      $("//span[normalize-space()='CACHE_INVALIDATOR']"),
    ).toBeDisplayed();
    await expect(
      $("//span[normalize-space()='error-boundary']"),
    ).toBeDisplayed();
  });

  it("shows an E2E hotkey conflict then recovery through the real event listener", async () => {
    await $("button=设置").click();
    await $("button=热键").click();
    await invokeE2eFixture("e2e_emit_hotkey_status", { conflicted: true });
    await browser.waitUntil(
      async () => renderedPageContains("E2E fixture: occupied"),
      { timeout: 10_000, timeoutMsg: "页面未渲染 fixture 热键冲突" },
    );
    await invokeE2eFixture("e2e_emit_hotkey_status", { conflicted: false });
    await browser.waitUntil(
      async () => !(await renderedPageContains("E2E fixture: occupied")),
      { timeout: 10_000, timeoutMsg: "热键恢复状态未清除 fixture 冲突" },
    );
  });

  it("injects deterministic clipboard selection through the real app event path", async () => {
    await invokeE2eFixture("e2e_emit_translate_selection");
    await expect($("textarea")).toHaveValue("E2E_CLIPBOARD_SELECTION");
    await expect($("[aria-live='polite']")).toHaveText(
      expect.stringContaining("剪贴板"),
    );
  });

  it("restores the TTS speak icon after fixture playback completes", async () => {
    const speak = await $("button[aria-label='朗读 原文']");
    await speak.click();
    await expect($("button[aria-label='停止朗读']")).toBeDisplayed();
    await expect($("button[aria-label='朗读 原文']")).toBeDisplayed();
  });

  it("imports, translates, reads, and deletes a continuous Markdown document through real IPC", async () => {
    const fileName = `e2e-document-${Date.now()}.md`;
    const source =
      "# E2E Document Heading\n\n- E2E_DOCUMENT_MARKER\n\n`cargo test`";
    const bytes = Array.from(new TextEncoder().encode(source));
    const outcome = await invokeTauri<{ type: string; data?: { id: string } }>(
      "import_document",
      { fileName, content: bytes },
    );
    expect(outcome.type).toBe("imported");
    expect(outcome.data?.id).toEqual(expect.any(String));
    const documentId = outcome.data!.id;

    try {
      await invokeTauri<void>("translate_document", { documentId });
      await browser.waitUntil(
        async () => {
          const documents =
            await invokeTauri<Array<{ id: string; status: string }>>(
              "list_documents",
            );
          return documents.some(
            (document) =>
              document.id === documentId && document.status === "completed",
          );
        },
        { timeout: 15_000, timeoutMsg: "文档翻译未完成" },
      );

      await $("button=文档").click();
      await browser.waitUntil(() => renderedPageContains(fileName), {
        timeout: 10_000,
        timeoutMsg: "导入记录未显示",
      });
      await expect($("h1=确定性的 E2E Document Heading")).toBeDisplayed();
      expect(await renderedPageContains("E2E_DOCUMENT_MARKER")).toBe(true);
      expect(await renderedPageContains("[未翻译]")).toBe(false);
      await expect($("[role='radiogroup']")).toBeDisplayed();
      await expect($("[role='radio'][aria-checked='true']")).toHaveText("译文");
      const contextMenuPrevented = await browser.execute(() => {
        const article = document.querySelector("article");
        return article
          ? !article.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
              }),
            )
          : false;
      });
      expect(contextMenuPrevented).toBe(true);
      await browser.waitUntil(
        async () => (await $$('[role="menu"]')).length === 1,
        {
          timeout: 5_000,
          timeoutMsg: "文档阅读器右键菜单未打开",
        },
      );
      await expect($("[role='menuitem']")).toBeDisplayed();
      await browser.keys("Escape");
      await expect($("[role='radio'][aria-checked='false']")).toHaveText(
        "原文",
      );
      await $("[role='radio'][aria-checked='false']").click();
      await expect($("h1=E2E Document Heading")).toBeDisplayed();
      expect(await renderedPageContains("E2E_DOCUMENT_MARKER")).toBe(true);
      expect(await renderedPageContains("结构块")).toBe(false);
      expect(await renderedPageContains("双栏")).toBe(false);
      const importIsInFooter = await browser.execute(() => {
        const button = [...document.querySelectorAll("button")].find((item) =>
          item.textContent?.includes("导入文档"),
        );
        return button?.parentElement?.classList.contains("border-t") ?? false;
      });
      expect(importIsInFooter).toBe(true);
    } finally {
      await invokeTauri<void>("delete_document", { documentId });
    }
  });
});
