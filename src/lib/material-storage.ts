import "server-only";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type StorageConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
};

let client: S3Client | undefined;

function getStorageConfig(): StorageConfig {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !region) {
    throw new Error("Material storage is not configured.");
  }

  const endpointUrl = new URL(endpoint);
  if (
    (endpointUrl.protocol !== "http:" && endpointUrl.protocol !== "https:") ||
    endpointUrl.username ||
    endpointUrl.password
  ) {
    throw new Error("Material storage is not configured.");
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

function isBucketAlreadyCreated(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const name = "name" in error ? error.name : undefined;
  const statusCode =
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata
      ? error.$metadata.httpStatusCode
      : undefined;

  return (
    name === "BucketAlreadyExists" ||
    name === "BucketAlreadyOwnedByYou" ||
    statusCode === 409
  );
}

async function createBucketIfMissing(
  s3: S3Client,
  bucket: string,
) {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (!isBucketAlreadyCreated(error)) {
      throw error;
    }
  }
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
  await createBucketIfMissing(s3, config.bucket);

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: sizeBytes,
    }),
  );
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
