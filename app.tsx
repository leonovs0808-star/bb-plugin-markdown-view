// bb-plugin-markdown-view — фронтенд.
//
// Регистрирует опенер для .md: вкладка файла показывает отрендеренный
// markdown вместо исходника. Рендерит host-компонент Markdown — тот же,
// которым BB рисует сообщения в чате, — поэтому типографика, код и таблицы
// выглядят как везде в приложении. Переключатель возвращает исходник:
// Original — это встроенный просмотрщик BB (редактор кода), отданный слоту.
import { useCallback, useEffect, useState } from "react";
import {
  definePluginApp,
  Markdown,
  useRpc,
  type PluginFileOpenerProps,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";

function MarkdownFile({ path, source, Original }: PluginFileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  const load = useCallback(() => {
    setError(null);
    rpc.call("readMarkdown", { path, source }).then(
      (result) => setContent(result.content),
      (cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [rpc, path, source]);

  useEffect(load, [load]);

  if (showSource) {
    return (
      <div className="flex h-full flex-col">
        <Toolbar showSource onToggle={() => setShowSource(false)} />
        <div className="min-h-0 flex-1 overflow-auto">
          <Original />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar showSource={false} onToggle={() => setShowSource(true)} />
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {error !== null ? (
          <p className="text-sm text-destructive">
            Не удалось прочитать файл: {error}
          </p>
        ) : content === null ? (
          <p className="text-sm text-muted-foreground">Загружаю…</p>
        ) : (
          <Markdown content={content} />
        )}
      </div>
    </div>
  );
}

function Toolbar({
  showSource,
  onToggle,
}: {
  showSource: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end border-b border-border px-3 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {showSource ? "Показать как текст" : "Показать исходник"}
      </button>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.fileOpener({
    id: "markdown",
    title: "Markdown preview",
    extensions: ["md", "markdown", "mdx"],
    component: MarkdownFile,
  });
});
