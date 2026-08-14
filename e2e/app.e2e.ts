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
    await expect($("nav[aria-label='设置分组']")).toBeDisplayed();
    await $("button=翻译").click();
    await expect(
      $("textarea[placeholder='输入或粘贴要翻译的文本']"),
    ).toBeEnabled();
  });

  it("streams a deterministic translation through real IPC", async () => {
    const input = await $("textarea[placeholder='输入或粘贴要翻译的文本']");
    await input.setValue("E2E_SUCCESS");
    await $("button[aria-label='执行翻译']").click();
    const output = await $("[aria-live='polite'][aria-busy]");
    await expect(output).toHaveText("确定性的 E2E 翻译结果");
  });

  it("shows a deterministic error and retries successfully", async () => {
    const input = await $("textarea[placeholder='输入或粘贴要翻译的文本']");
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
    await $("button[aria-label='执行翻译']").click();
    await expect($("[aria-live='polite'][aria-busy]")).toHaveText(
      "确定性的 E2E 翻译结果",
    );
    await $("button[aria-label='收藏']").click();
    await $("button=收藏").click();
    await expect($("button[aria-label^='删除 ']")).toBeDisplayed();
  });
});
