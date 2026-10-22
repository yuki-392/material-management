import {
  CreateBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

/** @typedef {import("@aws-sdk/client-s3").S3Client} S3Client */

/** @param {unknown} error */
function isBucketAlreadyCreated(error) {
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

/**
 * @param {S3Client} s3
 * @param {string} bucket
 */
export async function ensureMaterialBucket(s3, bucket) {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (!isBucketAlreadyCreated(error)) {
      throw error;
    }
  }
}

/**
 * Upload an object to a bucket that has already been provisioned.
 * @param {S3Client} s3
 * @param {{bucket: string, key: string, body: Uint8Array, contentType: string, sizeBytes: number}} input
 */
export async function putMaterialObject(s3, input) {
  await s3.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    }),
  );
}
