import { describe, expect, it } from "vitest";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { B2Storage, b2ErrorMessage } from "../worker/src/lib/b2";

function fakeStorage(respond: (command: unknown) => unknown) {
  const commands: unknown[] = [];
  const client = {
    async send(command: unknown) {
      commands.push(command);
      return respond(command);
    },
  };
  return {
    commands,
    storage: new B2Storage({ B2_BUCKET: "anp-media" }, client as never),
  };
}

describe("Backblaze B2 S3 storage", () => {
  it("uses real S3 multipart create, upload, complete, resume, and abort commands", async () => {
    const { storage, commands } = fakeStorage((command) => {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: "b2-upload-id" };
      if (command instanceof UploadPartCommand) return { ETag: '"part-etag"' };
      return {};
    });

    const upload = await storage.startMultipart("u/user/o/media/original.mp4", "video/mp4");
    expect(upload.uploadId).toBe("b2:b2-upload-id");
    const part = await upload.uploadPart(1, new Uint8Array([1, 2, 3]));
    expect(part).toEqual({ partNumber: 1, etag: '"part-etag"', size: 3 });
    await upload.complete([part]);

    const resumed = storage.resumeMultipart("u/user/o/media/original.mp4", "resume-id");
    await resumed.abort();

    expect(commands.map((command) => command?.constructor.name)).toEqual([
      "CreateMultipartUploadCommand",
      "UploadPartCommand",
      "CompleteMultipartUploadCommand",
      "AbortMultipartUploadCommand",
    ]);
    expect((commands[0] as CreateMultipartUploadCommand).input).toMatchObject({
      Bucket: "anp-media",
      Key: "u/user/o/media/original.mp4",
      ContentType: "video/mp4",
    });
    expect((commands[1] as UploadPartCommand).input).toMatchObject({
      Bucket: "anp-media",
      UploadId: "b2-upload-id",
      PartNumber: 1,
      ContentLength: 3,
    });
    expect((commands[2] as CompleteMultipartUploadCommand).input.MultipartUpload?.Parts).toEqual([
      { ETag: '"part-etag"', PartNumber: 1 },
    ]);
    expect((commands[3] as AbortMultipartUploadCommand).input.UploadId).toBe("resume-id");
  });

  it("puts and deletes private objects in the configured bucket", async () => {
    const { storage, commands } = fakeStorage(() => ({}));
    await storage.putObject("one.jpg", "hello", "image/jpeg");
    await storage.deleteKeys(["one.jpg", null, "two.jpg", "one.jpg"]);

    expect(commands[0]).toBeInstanceOf(PutObjectCommand);
    expect((commands[0] as PutObjectCommand).input).toMatchObject({
      Bucket: "anp-media",
      Key: "one.jpg",
      ContentLength: 5,
      ContentType: "image/jpeg",
    });
    expect(commands[1]).toBeInstanceOf(DeleteObjectsCommand);
    expect((commands[1] as DeleteObjectsCommand).input.Delete?.Objects).toEqual([
      { Key: "one.jpg" },
      { Key: "two.jpg" },
    ]);
  });

  it("normalizes ranges with HEAD and streams the selected B2 bytes", async () => {
    const { storage, commands } = fakeStorage((command) => {
      if (command instanceof HeadObjectCommand) return { ContentLength: 10 };
      if (command instanceof GetObjectCommand) {
        return {
          Body: new TextEncoder().encode("lowor"),
          ContentLength: 5,
          ContentRange: "bytes 3-7/10",
          ContentType: "video/mp4",
          ETag: '"object-etag"',
        };
      }
      return {};
    });

    const response = await storage.serveObject(
      "video.mp4",
      new Request("https://anp.test/video", { headers: { Range: "bytes=3-7" } }),
    );

    expect(commands[0]).toBeInstanceOf(HeadObjectCommand);
    expect(commands[1]).toBeInstanceOf(GetObjectCommand);
    expect((commands[1] as GetObjectCommand).input.Range).toBe("bytes=3-7");
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 3-7/10");
    expect(response.headers.get("ETag")).toBe('"object-etag"');
    expect(await response.text()).toBe("lowor");
  });
});

describe("b2ErrorMessage", () => {
  it("tells operators to enable listAllBucketNames on a bucket-scoped key", () => {
    const denied = Object.assign(new Error("Access Denied"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    expect(b2ErrorMessage(denied)).toMatch(/Allow List All Bucket Names/);
    expect(b2ErrorMessage(denied)).toMatch(/listAllBucketNames/);

    const cannotAccess = Object.assign(new Error("Cannot access bucket"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    expect(b2ErrorMessage(cannotAccess)).toMatch(/listAllBucketNames/);
  });
});

describe("B2 native list fallback", () => {
  function nativeFetch(files: { fileName: string; contentLength: number; action?: string }[], bucketName = "anp-media") {
    return async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("b2_authorize_account")) {
        return new Response(
          JSON.stringify({
            accountId: "acc",
            apiUrl: "https://api.backblazeb2.com",
            authorizationToken: "tok",
            allowed: {
              bucketId: "bid",
              bucketName,
              capabilities: ["listFiles", "readFiles", "writeFiles", "deleteFiles"],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("b2_list_file_names")) {
        return new Response(JSON.stringify({ files, nextFileName: null }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };
  }

  it("treats a valid native authorize as healthy even when S3 ListObjects is denied", async () => {
    const client = {
      async send() {
        throw Object.assign(new Error("Access Denied"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } });
      },
    };
    const storage = new B2Storage(
      { B2_BUCKET: "anp-media", B2_KEY_ID: "004xxxxxxxxxxxxxxxx0000000001", B2_APP_KEY: "secret" },
      client as never,
      nativeFetch([]) as typeof fetch,
    );
    expect(await storage.check("u/user/")).toEqual({ ok: true });
  });

  it("rejects a key that is scoped to a different bucket", async () => {
    const client = {
      async send() {
        return {};
      },
    };
    const storage = new B2Storage(
      { B2_BUCKET: "anp-media", B2_KEY_ID: "004xxxxxxxxxxxxxxxx0000000001", B2_APP_KEY: "secret" },
      client as never,
      nativeFetch([], "other-bucket") as typeof fetch,
    );
    const health = await storage.check();
    expect(health.ok).toBe(false);
    if (!health.ok) expect(health.message).toMatch(/other-bucket/);
  });

  it("does not call detached fetch (Cloudflare Workers this binding)", async () => {
    const original = globalThis.fetch;
    const urls: string[] = [];
    const authorizeBody = {
      accountId: "acc",
      apiUrl: "https://api.backblazeb2.com",
      authorizationToken: "tok",
      allowed: {
        bucketId: "bid",
        bucketName: "anp-media",
        capabilities: ["listFiles", "readFiles", "writeFiles", "deleteFiles"],
      },
    };
    // Workers' fetch throws if invoked with the wrong `this` — same as storing
    // `const fn = fetch` and calling `fn()`, or `this.fetchFn()` after `fetchFn = fetch`.
    function workersFetch(this: unknown, input: RequestInfo | URL) {
      if (this != null && this !== globalThis) {
        throw new TypeError(
          "Illegal invocation: function called with incorrect `this` reference. See [https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors] for details.",
        );
      }
      const url = String(input);
      urls.push(url);
      if (url.includes("b2_list_file_names")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              files: [{ fileName: "u/user/o/1/original.jpg", contentLength: 40, action: "upload" }],
              nextFileName: null,
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(authorizeBody), { status: 200 }));
    }
    globalThis.fetch = workersFetch as typeof fetch;
    try {
      const storage = new B2Storage(
        { B2_BUCKET: "anp-media", B2_KEY_ID: "004xxxxxxxxxxxxxxxx0000000001", B2_APP_KEY: "secret" },
        {
          async send(command: unknown) {
            if (command instanceof ListObjectsV2Command) {
              throw Object.assign(new Error("Cannot access bucket"), {
                name: "AccessDenied",
                $metadata: { httpStatusCode: 403 },
              });
            }
            return {};
          },
        } as never,
      );
      expect(await storage.check("u/user/")).toEqual({ ok: true });
      expect(urls.some((url) => url.includes("b2_authorize_account"))).toBe(true);
      expect(await storage.usage("u/user/")).toEqual({ objects: 1, bytes: 40, truncated: false });
      expect(urls.some((url) => url.includes("b2_list_file_names"))).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("counts usage via native list when S3 ListObjectsV2 returns 403", async () => {
    const client = {
      async send(command: unknown) {
        if (command instanceof ListObjectsV2Command) {
          throw Object.assign(new Error("Cannot access bucket"), {
            name: "AccessDenied",
            $metadata: { httpStatusCode: 403 },
          });
        }
        return {};
      },
    };
    const storage = new B2Storage(
      { B2_BUCKET: "anp-media", B2_KEY_ID: "004xxxxxxxxxxxxxxxx0000000001", B2_APP_KEY: "secret" },
      client as never,
      nativeFetch([
        { fileName: "u/user/o/1/original.jpg", contentLength: 100, action: "upload" },
        { fileName: "u/user/o/1/thumb.jpg", contentLength: 10, action: "upload" },
        { fileName: "u/user/o/1/", contentLength: 0, action: "folder" },
      ]) as typeof fetch,
    );
    expect(await storage.usage("u/user/")).toEqual({ objects: 2, bytes: 110, truncated: false });
  });

  it("lists usage via native API first so a non-403 S3 ListObjects failure is ignored", async () => {
    let s3Lists = 0;
    const client = {
      async send(command: unknown) {
        if (command instanceof ListObjectsV2Command) {
          s3Lists += 1;
          throw Object.assign(new Error("Unable to unmarshall response payload"), {
            name: "UnknownError",
            $metadata: { httpStatusCode: 200 },
          });
        }
        return {};
      },
    };
    const storage = new B2Storage(
      { B2_BUCKET: "anp-media", B2_KEY_ID: "004xxxxxxxxxxxxxxxx0000000001", B2_APP_KEY: "secret" },
      client as never,
      nativeFetch([{ fileName: "u/user/o/1/original.jpg", contentLength: 40, action: "upload" }]) as typeof fetch,
    );
    expect(await storage.usage("u/user/")).toEqual({ objects: 1, bytes: 40, truncated: false });
    expect(s3Lists).toBe(0);
  });

  it("parses v4 authorize allowed.buckets id/name when listing usage", async () => {
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("b2_authorize_account")) {
        return new Response(
          JSON.stringify({
            accountId: "acc",
            authorizationToken: "tok",
            apiInfo: {
              storageApi: {
                apiUrl: "https://api005.backblazeb2.com",
                allowed: {
                  buckets: [{ id: "bid", name: "anp-media" }],
                  capabilities: ["listFiles", "readFiles", "writeFiles", "deleteFiles", "listAllBucketNames"],
                  namePrefix: null,
                },
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("b2_list_file_names")) {
        return new Response(
          JSON.stringify({
            files: [{ fileName: "u/user/o/1/original.jpg", contentLength: 25, action: "upload" }],
            nextFileName: null,
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };
    const storage = new B2Storage(
      { B2_BUCKET: "anp-media", B2_KEY_ID: "004xxxxxxxxxxxxxxxx0000000001", B2_APP_KEY: "secret" },
      { async send() { return {}; } } as never,
      fetchFn as typeof fetch,
    );
    expect(await storage.check("u/user/")).toEqual({ ok: true });
    expect(await storage.usage("u/user/")).toEqual({ objects: 1, bytes: 25, truncated: false });
  });

  it("resolves bucketId via b2_list_buckets when the key is not bucket-scoped", async () => {
    const urls: string[] = [];
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("b2_authorize_account")) {
        return new Response(
          JSON.stringify({
            accountId: "acc",
            apiUrl: "https://api.backblazeb2.com",
            authorizationToken: "tok",
            allowed: {
              capabilities: ["listFiles", "listBuckets", "listAllBucketNames", "readFiles", "writeFiles"],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("b2_list_buckets")) {
        return new Response(JSON.stringify({ buckets: [{ bucketId: "bid", bucketName: "anp-media" }] }), { status: 200 });
      }
      if (url.includes("b2_list_file_names")) {
        return new Response(
          JSON.stringify({ files: [{ fileName: "u/user/a.jpg", contentLength: 8, action: "upload" }], nextFileName: null }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };
    const storage = new B2Storage(
      { B2_BUCKET: "anp-media", B2_KEY_ID: "004xxxxxxxxxxxxxxxx0000000001", B2_APP_KEY: "secret" },
      { async send() { throw new Error("S3 should not run"); } } as never,
      fetchFn as typeof fetch,
    );
    expect(await storage.usage("u/user/")).toEqual({ objects: 1, bytes: 8, truncated: false });
    expect(urls.some((url) => url.includes("b2_list_buckets"))).toBe(true);
  });

  it("falls back to S3 list when native list fails", async () => {
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("b2_authorize_account")) {
        return new Response(
          JSON.stringify({
            accountId: "acc",
            apiUrl: "https://api.backblazeb2.com",
            authorizationToken: "tok",
            allowed: { bucketId: "bid", bucketName: "anp-media", capabilities: ["listFiles"] },
          }),
          { status: 200 },
        );
      }
      if (url.includes("b2_list_file_names")) {
        return new Response(JSON.stringify({ code: "unauthorized", message: "application key has no listFiles capability" }), {
          status: 401,
        });
      }
      return new Response("not found", { status: 404 });
    };
    const client = {
      async send(command: unknown) {
        if (command instanceof ListObjectsV2Command) {
          return { Contents: [{ Key: "u/user/o/1/original.jpg", Size: 12 }], IsTruncated: false };
        }
        return {};
      },
    };
    const storage = new B2Storage(
      { B2_BUCKET: "anp-media", B2_KEY_ID: "004xxxxxxxxxxxxxxxx0000000001", B2_APP_KEY: "secret" },
      client as never,
      fetchFn as typeof fetch,
    );
    expect(await storage.usage("u/user/")).toEqual({ objects: 1, bytes: 12, truncated: false });
  });

  it("keeps the native list error when both list paths fail", async () => {
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("b2_authorize_account")) {
        return new Response(
          JSON.stringify({
            accountId: "acc",
            apiUrl: "https://api.backblazeb2.com",
            authorizationToken: "tok",
            allowed: { bucketId: "bid", bucketName: "anp-media", capabilities: ["readFiles"] },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ code: "unauthorized", message: "application key has no listFiles capability" }), {
        status: 401,
      });
    };
    const storage = new B2Storage(
      { B2_BUCKET: "anp-media", B2_KEY_ID: "004xxxxxxxxxxxxxxxx0000000001", B2_APP_KEY: "secret" },
      {
        async send() {
          throw Object.assign(new Error("Unable to unmarshall response payload"), { name: "UnknownError" });
        },
      } as never,
      fetchFn as typeof fetch,
    );
    const error = await storage.usage("u/user/").catch((caught) => caught);
    expect(error).toMatchObject({ message: /listFiles/ });
    expect(b2ErrorMessage(error)).toMatch(/listFiles/);
  });
});
