import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || "apex-mart-wholesale-bucket";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
}

export interface UploadContext {
  userId: number;
  merchantId?: number;
  folder?: "products" | "suppliers" | "avatars" | "ads";
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
  
  if (sanitized.length > 100) {
    const ext = sanitized.substring(sanitized.lastIndexOf("."));
    return sanitized.substring(0, 96) + ext;
  }
  
  return sanitized;
}

function validateFile(filename: string, contentType: string): { valid: boolean; error?: string } {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Invalid file extension. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}` };
  }
  
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    return { valid: false, error: `Invalid content type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}` };
  }
  
  return { valid: true };
}

function buildSecureKey(context: UploadContext, filename: string): string {
  const sanitized = sanitizeFilename(filename);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  
  const folder = context.folder || "products";
  
  if (context.merchantId) {
    return `merchants/${context.merchantId}/${folder}/${timestamp}-${random}-${sanitized}`;
  }
  
  return `users/${context.userId}/${folder}/${timestamp}-${random}-${sanitized}`;
}

function canAccessKey(key: string, context: UploadContext): boolean {
  if (context.merchantId) {
    return key.startsWith(`merchants/${context.merchantId}/`);
  }
  return key.startsWith(`users/${context.userId}/`);
}

export async function getSignedUploadUrl(
  filename: string,
  contentType: string,
  context: UploadContext,
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const validation = validateFile(filename, contentType);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const key = buildSecureKey(context, filename);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${key}`;

  return {
    uploadUrl,
    key,
    publicUrl,
  };
}

export async function deleteImage(key: string, context: UploadContext): Promise<void> {
  if (!canAccessKey(key, context)) {
    throw new Error("Access denied: Cannot delete this file");
  }

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

export async function getSignedDownloadUrl(
  key: string,
  context: UploadContext,
  expiresIn: number = 3600
): Promise<string> {
  if (!canAccessKey(key, context)) {
    throw new Error("Access denied: Cannot access this file");
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export function getPublicUrl(key: string): string {
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${key}`;
}

export async function checkFileExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch {
    return false;
  }
}

export async function uploadImage(
  file: Buffer,
  filename: string,
  contentType: string,
  context: UploadContext
): Promise<UploadResult> {
  const validation = validateFile(filename, contentType);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (file.length > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  const key = buildSecureKey(context, filename);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
  });

  await s3Client.send(command);

  const url = getPublicUrl(key);

  return {
    key,
    url,
    bucket: BUCKET_NAME,
  };
}

export async function uploadMultipleImages(
  files: Array<{ buffer: Buffer; filename: string; contentType: string }>,
  context: UploadContext
): Promise<UploadResult[]> {
  const uploadPromises = files.map((file) =>
    uploadImage(file.buffer, file.filename, file.contentType, context)
  );

  return Promise.all(uploadPromises);
}

export { s3Client, BUCKET_NAME, ALLOWED_MIME_TYPES, MAX_FILE_SIZE };
