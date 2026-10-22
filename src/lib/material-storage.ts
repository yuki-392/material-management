import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { putMaterialObject as putMaterialS3Object } from "./material-storage-commands.js";

type StorageConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
};

class MaterialStorageConfigurationError extends Error {
  code: "MISSING_STORAGE_CONFIGURATION" | "INVALID_STORAGE_ENDPOINT";

  constructor(code: MaterialStorageConfigurationError["code"]) {
    super(code);
    this.name = "MaterialStorageConfigurationError";
    this.code = code;
  }
}

let client: S3Client | undefined;

function getStorageConfig(): StorageConfig {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !region) {
    throw new MaterialStorageConfigurationError("MISSING_STORAGE_CONFIGURATION");
  }

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new MaterialStorageConfigurationError("INVALID_STORAGE_ENDPOINT");
  }

  if (
    (endpointUrl.protocol !== "http:" && endpointUrl.protocol !== "https:") ||
    endpointUrl.username ||
    endpointUrl.password
  ) {
    throw new MaterialStorageConfigurationError("INVALID_STORAGE_ENDPOINT");
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket, region };
}

function getS3Client(config: StorageConfig) {
  client ??= new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return client;
}

export async function putMaterialObject({
  key,
  body,
  contentType,
  sizeBytes,
}: {
  key: string;
  body: Uint8Array;
  contentType: string;
  sizeBytes: number;
}) {
  const config = getStorageConfig();
  const s3 = getS3Client(config);
  await putMaterialS3Object(s3, {
    bucket: config.bucket,
    key,
    body,
    contentType,
    sizeBytes,
  });
}

export async function getMaterialObject(key: string) {
  const config = getStorageConfig();
  const result = await getS3Client(config).send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );

  return {
    body: result.Body?.transformToWebStream() ?? null,
  };
}

export async function deleteMaterialObject(key: string) {
  const config = getStorageConfig();
  await getS3Client(config).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}
