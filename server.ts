// bb-plugin-markdown-view — бэкенд.
//
// Единственная задача: отдать фронту текст .md-файла. Путь во вкладке файла
// приходит относительным (workspace — от корня worktree, thread-storage — от
// корня хранилища треда), поэтому здесь он разворачивается в абсолютный и
// читается через bb.sdk.files — тот же примитив, что работает и на удалённом
// хосте, а не только на машине сервера.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const sourceSchema = z
  .object({
    kind: z.enum(["host", "thread-storage", "workspace"]),
    threadId: z.string().nullable(),
    environmentId: z.string().nullable(),
    projectId: z.string().nullable(),
    experimental_hostId: z.string().optional(),
  })
  .strict();

export const rpcContract = defineRpcContract({
  readMarkdown: {
    input: z.object({ path: z.string().min(1), source: sourceSchema }).strict(),
    output: z.object({ content: z.string() }),
  },
});

type FileSource = z.infer<typeof sourceSchema>;

function joinPath(base: string, relative: string): string {
  const left = base.endsWith("/") ? base.slice(0, -1) : base;
  const right = relative.startsWith("/") ? relative.slice(1) : relative;
  return `${left}/${right}`;
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  /** Разворачивает (source, path) вкладки файла в абсолютный путь и хост. */
  async function resolve(
    source: FileSource,
    path: string,
  ): Promise<{ path: string; hostId?: string }> {
    if (source.kind === "thread-storage") {
      if (source.threadId === null) {
        throw new Error("thread-storage source without threadId");
      }
      const location = await bb.sdk.threads.storageLocation({
        threadId: source.threadId,
      });
      return {
        path: joinPath(location.storageRootPath, path),
        hostId: location.hostId,
      };
    }

    if (source.kind === "workspace") {
      if (source.environmentId === null) {
        throw new Error("workspace source without environmentId");
      }
      const environment = await bb.sdk.environments.get({
        environmentId: source.environmentId,
      });
      if (environment.path === null) {
        throw new Error("environment has no worktree path");
      }
      return {
        path: joinPath(environment.path, path),
        hostId: source.experimental_hostId ?? environment.hostId,
      };
    }

    // kind === "host": путь уже абсолютный на хосте треда.
    if (source.experimental_hostId !== undefined) {
      return { path, hostId: source.experimental_hostId };
    }
    if (source.environmentId !== null) {
      const environment = await bb.sdk.environments.get({
        environmentId: source.environmentId,
      });
      return { path, hostId: environment.hostId };
    }
    return { path };
  }

  bb.rpc.register(rpcContract, {
    async readMarkdown({ path, source }) {
      const target = await resolve(source, path);
      const file = await bb.sdk.files.read({
        path: target.path,
        hostId: target.hostId,
      });
      const content =
        file.contentEncoding === "base64"
          ? Buffer.from(file.content, "base64").toString("utf8")
          : file.content;
      return { content };
    },
  });
}
