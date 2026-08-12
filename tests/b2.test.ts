import { describe, expect, it } from "vitest";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { B2Storage } from "../worker/src/lib/b2";

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
