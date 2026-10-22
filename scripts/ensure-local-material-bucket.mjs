import "dotenv/config";

import { S3Client } from "@aws-sdk/client-s3";

import { ensureMaterialBucket } from "../src/lib/material-storage-commands.js";
import { logMaterialError } from "../src/lib/material-error-logging.js";

function getLocalStorageConfig() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !region) {
    throw new Error("Set all S3_* variables in the local .env file.");
  }

  const endpointUrl = new URL(endpoint);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    (endpointUrl.protocol !== "http:" && endpointUrl.protocol !== "https:") ||
    endpointUrl.username ||
    endpointUrl.password ||
    !localHosts.has(endpointUrl.hostname)
  ) {
    throw new Error("This command only supports a local S3 endpoint.");
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket, region };
}

async function main() {
  let client;

  try {
    const config = getLocalStorageConfig();
    client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    await ensureMaterialBucket(client, config.bucket);
    console.info("Local material bucket is ready.");
  } catch (error) {
    console.error(
      "Local bucket setup failed. Check local S3_* variables and confirm SeaweedFS is running.",
    );
    logMaterialError("local.material-bucket-setup", error);
    process.exitCode = 1;
  } finally {
    client?.destroy();
  }
}

await main();
