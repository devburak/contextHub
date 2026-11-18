/**
 * Access to the private bucket that holds files submitted through forms.
 *
 * This bucket must have no public domain attached. Nothing here ever builds a
 * permanent URL: reads and writes go through short-lived presigned links.
 */
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 60;

let cachedClient = null;

function getConfig() {
  const bucket = (process.env.R2_PRIVATE_BUCKET || '').trim();
  const publicBucket = (process.env.R2_BUCKET || '').trim();
  const endpoint = (process.env.R2_S3_ENDPOINT || '').trim().replace(/\/$/, '');
  const accessKeyId = process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.R2_SECRET_KEY;
  // R2_S3_ENDPOINT is sometimes configured with the public bucket appended.
  const normalisedEndpoint = publicBucket && endpoint.endsWith(`/${publicBucket}`)
    ? endpoint.slice(0, -(`/${publicBucket}`).length)
    : endpoint;
  return { bucket, publicBucket, endpoint: normalisedEndpoint, accessKeyId, secretAccessKey };
}

/**
 * The feature is off unless a dedicated private bucket is configured. Pointing it
 * at the public media bucket would publish every submitted file.
 */
function isConfigured() {
  const config = getConfig();
  return Boolean(
    config.bucket
    && config.endpoint
    && config.accessKeyId
    && config.secretAccessKey
    && config.bucket !== config.publicBucket
  );
}

function getBucket() {
  return getConfig().bucket;
}

function getClient() {
  if (cachedClient) return cachedClient;
  const config = getConfig();
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    // Without this the SDK adds a CRC32 checksum of an empty body to presigned
    // PUT links, which no real upload can satisfy.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  return cachedClient;
}

async function presignUpload({ key, contentType, contentLength }) {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength
  });
  const url = await getSignedUrl(getClient(), command, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    // Sign the declared size and type so the link cannot be reused for a
    // different payload. The size is verified again after upload.
    signableHeaders: new Set(['content-type', 'content-length'])
  });
  return {
    url,
    expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000)
  };
}

/**
 * Read an uploaded object fully into memory. Refuses objects larger than
 * `maxBytes` before downloading the body. Returns null when the object does not exist.
 */
async function readObject({ key, maxBytes }) {
  let response;
  try {
    response = await getClient().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey') return null;
    throw error;
  }

  const contentLength = Number(response.ContentLength || 0);
  if (Number.isFinite(maxBytes) && contentLength > maxBytes) {
    response.Body?.destroy?.();
    return { tooLarge: true, size: contentLength, buffer: null };
  }

  const chunks = [];
  let received = 0;
  for await (const chunk of response.Body) {
    received += chunk.length;
    if (Number.isFinite(maxBytes) && received > maxBytes) {
      response.Body?.destroy?.();
      return { tooLarge: true, size: received, buffer: null };
    }
    chunks.push(chunk);
  }
  return { tooLarge: false, size: received, buffer: Buffer.concat(chunks) };
}

async function deleteObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

function contentDisposition(filename) {
  const fallback = String(filename || 'file').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename || 'file')}`;
}

/**
 * Short-lived download link. Always served as an attachment so a browser never
 * renders a submitted file inline.
 */
async function presignDownload({ key, filename, contentType }) {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ResponseContentDisposition: contentDisposition(filename),
    ResponseContentType: contentType || 'application/octet-stream'
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  return {
    url,
    expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000)
  };
}

function resetForTests() {
  cachedClient = null;
}

module.exports = {
  UPLOAD_URL_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  isConfigured,
  getBucket,
  presignUpload,
  readObject,
  deleteObject,
  presignDownload,
  resetForTests
};
