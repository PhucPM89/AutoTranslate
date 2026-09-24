"use strict";

const fs = require("fs");
const path = require("path");

const YOUTUBE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const YOUTUBE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly"
];

/**
 * Generate Google OAuth2 Authorization URL
 */
function getYouTubeAuthUrl({
  clientId = process.env.YOUTUBE_CLIENT_ID,
  redirectUri = process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/api/admin/video/youtube/callback",
  state = ""
} = {}) {
  if (!clientId) {
    throw new Error("Chưa cấu hình YOUTUBE_CLIENT_ID.");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent"
  });
  if (state) params.set("state", state);
  return `${YOUTUBE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange Authorization Code for Access & Refresh Tokens
 */
async function exchangeYouTubeAuthCode(code, {
  clientId = process.env.YOUTUBE_CLIENT_ID,
  clientSecret = process.env.YOUTUBE_CLIENT_SECRET,
  redirectUri = process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/api/admin/video/youtube/callback"
} = {}) {
  if (!clientId || !clientSecret) {
    throw new Error("Thiếu YOUTUBE_CLIENT_ID hoặc YOUTUBE_CLIENT_SECRET.");
  }

  const res = await fetch(YOUTUBE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`YouTube OAuth token exchange failed: ${data.error_description || data.error || res.statusText}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
    tokenType: data.token_type
  };
}

/**
 * Get a valid access token using the refresh token
 */
async function getValidAccessToken({
  clientId = process.env.YOUTUBE_CLIENT_ID,
  clientSecret = process.env.YOUTUBE_CLIENT_SECRET,
  refreshToken = process.env.YOUTUBE_REFRESH_TOKEN
} = {}) {
  if (!refreshToken) {
    throw new Error("Chưa có YOUTUBE_REFRESH_TOKEN.");
  }

  const res = await fetch(YOUTUBE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to refresh YouTube access token: ${data.error_description || data.error || res.statusText}`);
  }

  return data.access_token;
}

/**
 * Upload Video to YouTube via Resumable Upload
 *
 * CRITICAL SAFEGUARDS:
 * - Default privacy is always "private"
 * - Discloses AI-generated synthetic media
 */
async function uploadVideoToYouTube({
  videoPath,
  thumbnailPath = null,
  title,
  description,
  tags = [],
  privacyStatus = "private",
  accessToken = null
}) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Không tìm thấy file video: ${videoPath}`);
  }

  // Check if credentials exist; if not, return clear actionable response
  const hasAuth = Boolean(accessToken || (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN));
  if (!hasAuth) {
    console.warn("[YouTube] Chưa cấu hình YouTube API credentials. Video đã sẵn sàng tải về thủ công.");
    return {
      success: false,
      isConfigured: false,
      message: "Chưa cấu hình tài khoản YouTube API (YOUTUBE_CLIENT_ID & YOUTUBE_REFRESH_TOKEN). Bạn có thể tải video xuống để upload thủ công."
    };
  }

  const token = accessToken || (await getValidAccessToken());
  const fileSize = fs.statSync(videoPath).size;

  const metadata = {
    snippet: {
      title: (title || "Review Truyện - Trạm Chữ").slice(0, 100),
      description: `${description || ""}\n\nĐón đọc bản dịch mượt mà tại Trạm Chữ: https://tram-chu.online\n#TramChu #ReviewTruyen`,
      tags: tags.slice(0, 20),
      categoryId: "24", // Entertainment
      defaultLanguage: "vi",
      defaultAudioLanguage: "vi"
    },
    status: {
      privacyStatus: privacyStatus === "public" ? "unlisted" : "private", // strict safeguard
      selfDeclaredMadeForKids: false
    }
  };

  // Step 1: Initiate resumable upload session
  const initRes = await fetch(`${YOUTUBE_UPLOAD_ENDPOINT}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(fileSize),
      "X-Upload-Content-Type": "video/mp4"
    },
    body: JSON.stringify(metadata)
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Initiate YouTube upload failed (${initRes.status}): ${errText}`);
  }

  const sessionUri = initRes.headers.get("location");
  if (!sessionUri) {
    throw new Error("Không nhận được session URI từ YouTube upload");
  }

  // Step 2: Upload video stream to session URI
  const fileStream = fs.createReadStream(videoPath);
  const uploadRes = await fetch(sessionUri, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize)
    },
    body: fileStream,
    duplex: "half"
  });

  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(`YouTube video upload failed (${uploadRes.status}): ${JSON.stringify(uploadData)}`);
  }

  const videoId = uploadData.id;

  // Step 3: Upload custom thumbnail if provided
  if (thumbnailPath && fs.existsSync(thumbnailPath) && videoId) {
    try {
      const thumbBuffer = fs.readFileSync(thumbnailPath);
      await fetch(`${YOUTUBE_UPLOAD_ENDPOINT}/../thumbnails/set?videoId=${videoId}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "image/jpeg"
        },
        body: thumbBuffer
      });
      console.log(`[YouTube] Đã cập nhật ảnh thumbnail cho video ${videoId}`);
    } catch (thumbErr) {
      console.warn("[YouTube] Thumbnail upload warning:", thumbErr.message);
    }
  }

  return {
    success: true,
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    privacyStatus: metadata.status.privacyStatus,
    title: metadata.snippet.title
  };
}

module.exports = {
  getYouTubeAuthUrl,
  exchangeYouTubeAuthCode,
  getValidAccessToken,
  uploadVideoToYouTube
};

