import { serveDriveFile } from "../_drive.js";

export async function onRequest(context) {
  const pathSegments = context.params?.path || [];
  const relativePath = Array.isArray(pathSegments) ? pathSegments.join("/") : String(pathSegments || "");
  if (!relativePath || relativePath.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const key = `books/${relativePath}`;
  return serveDriveFile(context, key, "application/json; charset=utf-8");
}
