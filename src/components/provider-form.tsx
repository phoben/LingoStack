import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ProviderConfig, ProviderKind } from "@/lib/config-types";

const KIND_OPTIONS: { value: ProviderKind; label: string }[] = [
  {
    value: "open_ai_compatible",
    label: "OpenAI 兼容（OpenAI / DeepSeek / 通义 / 智谱）",
  },
  { value: "anthropic", label: "Anthropic（Claude）" },
  { value: "gemini", label: "Gemini（待实现）" },
  { value: "ollama", label: "Ollama 本地（OpenAI 兼容）" },
];

interface ProviderFormProps {
  /** 编辑时传入既有配置；新增时省略。 */
  initial?: ProviderConfig;
  onSave: (provider: ProviderConfig) => void;
  onCancel: () => void;
}

/**
 * 提供商新增 / 编辑表单（内联展开）。
 * 对齐 lingostack-design：info 焦点环、必填校验失败用 accent（coral）提示、
 * 一个主操作（保存）。`id` 由父组件在新增时生成，故此处保持空串透传。
 */
export function ProviderForm({ initial, onSave, onCancel }: ProviderFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<ProviderKind>(
    initial?.kind ?? "open_ai_compatible",
  );
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? "");
  const [apiKey, setApiKey] = useState(initial?.api_key ?? "");
  const [modelsText, setModelsText] = useState(
    (initial?.models ?? []).join(", "),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) {
      setError("名称、Base URL、API Key 为必填项");
      return;
    }
    const models = modelsText
      .split(/[，,\n\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({
      id: initial?.id ?? "",
      kind,
      name: name.trim(),
      base_url: baseUrl.trim(),
      api_key: apiKey,
      models,
    });
  };

  return (
    <div className="rounded-lg border border-info/30 bg-background p-3.5">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">名称</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="DeepSeek"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">协议</span>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProviderKind)}
            className="h-9 w-full"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Base URL</span>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="font-mono text-xs"
            placeholder="https://api.deepseek.com"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">API Key</span>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono text-xs"
            placeholder="sk-..."
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            模型（逗号或换行分隔）
          </span>
          <Input
            value={modelsText}
            onChange={(e) => setModelsText(e.target.value)}
            className="font-mono text-xs"
            placeholder="deepseek-chat, deepseek-reasoner"
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-xs text-accent">{error}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={submit}>
          {initial ? "保存" : "添加"}
        </Button>
      </div>
    </div>
  );
}
