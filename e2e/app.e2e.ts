async function invokeE2eFixture(command: string, args: Record<string, unknown> = {}) {
  await browser.execute(
    async (name: string, payload: Record<string, unknown>) => {
      const tauri = window as unknown as {
        __TAURI__: { core: { invoke: (command: string, args: Record<string, unknown>) => Promise<void> } };
      };
      await tauri.__TAURI__.core.invoke(name, payload);
    },
    command,
    args,
  );
}

async function renderedPageContains(text: string) {
  return browser.execute((expected: string) => document.body.innerText.includes(expected), text);
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
    await expect($("[aria-live='polite'][aria-busy]")).toHaveText(
      "确定性的 E2E 翻译结果",
    );
  });

  it("persists the configured test model through the settings UI", async () => {
    await $("button=设置").click();
    await $("button=AI").click();
    const select = await $("select[aria-label='翻译默认模型']");
    await select.selectByAttribute("value", "e2e::lingostack-e2e");
    await browser.refresh();
    await $("button=设置").click();
    await $("button=AI").click();
    await expect($("select[aria-label='翻译默认模型']")).toHaveValue(
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

  it("transitions TTS speaking and stop state through real feature-gated commands", async () => {
    const speak = await $("button[aria-label='朗读 原文']");
    await speak.click();
    const stop = await $("button[aria-label='停止朗读']");
    await expect(stop).toBeDisplayed();
    await stop.click();
    await expect($("button[aria-label='朗读 原文']")).toBeDisplayed();
  });

});
