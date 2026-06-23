const API_BASE = "https://www.googleapis.com/youtube/v3";
const KEY_STORAGE = "ysearch.youtubeApiKey";

// --- 패스워드 인증 기능 ---
const PASS_HASH = "__PASSWORD_HASH_PLACEHOLDER__"; // GitHub Actions 빌드 시 SHA-256 해시값으로 치환됨
const CRYPTO_KEY = "ysearch_crypto_key_2026";
const KEY_AUTH = "ysearch.auth";

// 브라우저 내장 Web Crypto API를 사용한 SHA-256 해싱
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function encrypt(text) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ CRYPTO_KEY.charCodeAt(i % CRYPTO_KEY.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(unescape(encodeURIComponent(result)));
}

function decrypt(encoded) {
  try {
    const text = decodeURIComponent(escape(atob(encoded)));
    let result = "";
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ CRYPTO_KEY.charCodeAt(i % CRYPTO_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch (e) {
    return "";
  }
}

async function checkAuth() {
  const stored = localStorage.getItem(KEY_AUTH);
  if (stored) {
    const decrypted = decrypt(stored);
    const hash = await sha256(decrypted);
    if (hash === PASS_HASH) {
      document.querySelector("#loginOverlay").classList.add("hidden");
      return true;
    }
  }
  document.querySelector("#loginOverlay").classList.remove("hidden");
  return false;
}

const loginForm = document.querySelector("#loginForm");
const loginPassword = document.querySelector("#loginPassword");
const loginError = document.querySelector("#loginError");
const loginCard = document.querySelector(".login-card");
const loginOverlay = document.querySelector("#loginOverlay");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const entered = loginPassword.value;
    const hash = await sha256(entered);
    if (hash === PASS_HASH) {
      const encrypted = encrypt(entered);
      localStorage.setItem(KEY_AUTH, encrypted);
      loginOverlay.classList.add("hidden");
      loginError.textContent = "";
    } else {
      loginCard.classList.add("shake");
      loginError.textContent = "비밀번호가 올바르지 않습니다.";
      loginPassword.value = "";
      loginPassword.focus();
      setTimeout(() => {
        loginCard.classList.remove("shake");
      }, 400);
    }
  });
}

checkAuth();
// -------------------------

const form = document.querySelector("#searchForm");
const resultsBody = document.querySelector("#resultsBody");
const statusText = document.querySelector("#statusText");
const resultCount = document.querySelector("#resultCount");
const quotaHint = document.querySelector("#quotaHint");
const exportButton = document.querySelector("#exportCsv");
const clearKeyButton = document.querySelector("#clearKey");
const apiKeyInput = document.querySelector("#apiKey");
const datePresetInput = document.querySelector("#datePreset");
const publishedAfterInput = document.querySelector("#publishedAfter");
const publishedBeforeInput = document.querySelector("#publishedBefore");

let currentRows = [];

apiKeyInput.value = localStorage.getItem(KEY_STORAGE) || "";

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch();
});

exportButton.addEventListener("click", () => {
  if (!currentRows.length) {
    setStatus("내보낼 검색 결과가 없습니다.");
    return;
  }

  downloadCsv(currentRows);
});

clearKeyButton.addEventListener("click", () => {
  localStorage.removeItem(KEY_STORAGE);
  apiKeyInput.value = "";
  setStatus("저장된 API 키를 삭제했습니다.");
});

datePresetInput.addEventListener("change", () => {
  applyDatePreset(datePresetInput.value);
});

[publishedAfterInput, publishedBeforeInput].forEach((input) => {
  input.addEventListener("input", () => {
    datePresetInput.value = "";
  });
});

async function runSearch() {
  const filters = getFilters();

  if (!filters.apiKey || !filters.keyword) {
    setStatus("API 키와 키워드는 필수입니다.");
    return;
  }

  if (
    filters.minSubscribers !== null &&
    filters.maxSubscribers !== null &&
    filters.minSubscribers > filters.maxSubscribers
  ) {
    setStatus("구독자 수 범위는 왼쪽 값이 오른쪽 값보다 작거나 같아야 합니다.");
    return;
  }

  localStorage.setItem(KEY_STORAGE, filters.apiKey);
  setLoading(true);
  setStatus("YouTube에서 영상 목록을 가져오는 중입니다.");
  renderRows([]);

  try {
    const searchItems = await fetchSearchItems(filters);

    if (!searchItems.length) {
      currentRows = [];
      renderRows([]);
      setStatus("조건에 맞는 영상이 없습니다.");
      return;
    }

    setStatus("영상 통계와 채널 구독자 수를 합치는 중입니다.");

    const videoIds = searchItems.map((item) => item.id.videoId).filter(Boolean);
    const videos = await fetchVideoItems(filters.apiKey, videoIds);

    const channelIds = [...new Set(videos.items.map((item) => item.snippet.channelId))];
    const channels = await fetchChannelItems(filters.apiKey, channelIds);

    const channelMap = new Map(channels.items.map((item) => [item.id, item]));
    const rows = videos.items.map((video) => toRow(video, channelMap, filters.keyword));
    currentRows = applyClientFilters(rows, filters);

    renderRows(currentRows);
    resultCount.textContent = currentRows.length.toLocaleString("ko-KR");
    quotaHint.textContent = `약 ${estimateQuota(videoIds.length, channelIds.length, filters.maxResults).toLocaleString("ko-KR")}`;
    setStatus(
      currentRows.length
        ? `검색 완료. 후보 ${rows.length.toLocaleString("ko-KR")}개 중 ${currentRows.length.toLocaleString("ko-KR")}개가 필터를 통과했습니다.`
        : `후보 ${rows.length.toLocaleString("ko-KR")}개를 확인했지만 필터를 통과한 영상이 없습니다. 적용 필터: ${describeActiveFilters(filters)}`,
    );
  } catch (error) {
    console.error(error);
    currentRows = [];
    renderRows([]);
    setStatus(error.message || "검색 중 오류가 발생했습니다.");
  } finally {
    setLoading(false);
  }
}

function getFilters() {
  const value = (id) => document.querySelector(`#${id}`).value.trim();

  return {
    apiKey: value("apiKey"),
    keyword: value("keyword"),
    publishedAfter: value("publishedAfter"),
    publishedBefore: value("publishedBefore"),
    regionCode: value("regionCode"),
    language: value("language"),
    shorts: value("shorts"),
    order: value("order"),
    minViews: numberValue("minViews"),
    minComments: numberValue("minComments"),
    minLikes: numberValue("minLikes"),
    minSubscribers: numberValue("minSubscribers"),
    maxSubscribers: numberValue("maxSubscribers"),
    minMinutes: numberValue("minMinutes"),
    maxMinutes: numberValue("maxMinutes"),
    maxResults: Number(value("maxResults") || 100),
  };
}

function numberValue(id) {
  const raw = document.querySelector(`#${id}`).value;
  return raw === "" ? null : Number(raw);
}

async function youtubeRequest(path, apiKey, params) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("key", apiKey);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const detail = data?.error?.message || response.statusText;
    throw new Error(`YouTube API 오류: ${detail}`);
  }

  return data;
}

async function fetchSearchItems(filters) {
  const targetCount = Math.min(filters.maxResults, 200);
  const items = [];
  let pageToken = "";

  while (items.length < targetCount) {
    const pageSize = Math.min(50, targetCount - items.length);
    const data = await youtubeRequest("/search", filters.apiKey, {
      part: "snippet",
      type: "video",
      q: filters.keyword,
      maxResults: pageSize,
      order: filters.order,
      regionCode: filters.regionCode,
      relevanceLanguage: filters.language,
      publishedAfter: toStartIso(filters.publishedAfter),
      publishedBefore: toEndIso(filters.publishedBefore),
      pageToken,
      safeSearch: "none",
    });

    items.push(...data.items);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return items;
}

async function fetchVideoItems(apiKey, videoIds) {
  const items = [];

  for (const ids of chunk(videoIds, 50)) {
    const data = await youtubeRequest("/videos", apiKey, {
      part: "snippet,contentDetails,statistics",
      id: ids.join(","),
      maxResults: ids.length,
    });
    items.push(...data.items);
  }

  return { items };
}

async function fetchChannelItems(apiKey, channelIds) {
  const items = [];

  for (const ids of chunk(channelIds, 50)) {
    const data = await youtubeRequest("/channels", apiKey, {
      part: "snippet,statistics",
      id: ids.join(","),
      maxResults: ids.length,
    });
    items.push(...data.items);
  }

  return { items };
}

function toRow(video, channelMap, keyword) {
  const channel = channelMap.get(video.snippet.channelId);
  const durationSeconds = parseIsoDuration(video.contentDetails.duration);
  const stats = video.statistics || {};
  const channelStats = channel?.statistics || {};
  const country =
    video.snippet.defaultAudioLanguage?.split("-").pop()?.toUpperCase() ||
    video.snippet.defaultLanguage?.split("-").pop()?.toUpperCase() ||
    channel?.snippet?.country ||
    "";
  const language =
    video.snippet.defaultAudioLanguage || video.snippet.defaultLanguage || "";
  const url = `https://www.youtube.com/watch?v=${video.id}`;

  return {
    publishedAt: video.snippet.publishedAt,
    videoUrl: url,
    title: video.snippet.title,
    thumbnail: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url || "",
    channelTitle: video.snippet.channelTitle,
    subscriberCount: toNumber(channelStats.subscriberCount),
    hiddenSubscriberCount: channelStats.hiddenSubscriberCount === true,
    viewCount: toNumber(stats.viewCount),
    commentCount: toNumber(stats.commentCount),
    likeCount: toNumber(stats.likeCount),
    country,
    language,
    isShorts: durationSeconds > 0 && durationSeconds <= 60,
    durationSeconds,
    keyword,
  };
}

function applyClientFilters(rows, filters) {
  return rows.filter((row) => {
    if (filters.minViews !== null && row.viewCount < filters.minViews) return false;
    if (filters.minComments !== null && row.commentCount < filters.minComments) return false;
    if (filters.minLikes !== null && row.likeCount < filters.minLikes) return false;
    if (
      filters.minSubscribers !== null &&
      (row.hiddenSubscriberCount || row.subscriberCount < filters.minSubscribers)
    ) {
      return false;
    }
    if (
      filters.maxSubscribers !== null &&
      (row.hiddenSubscriberCount || row.subscriberCount > filters.maxSubscribers)
    ) {
      return false;
    }
    if (filters.minMinutes !== null && row.durationSeconds < filters.minMinutes * 60) return false;
    if (filters.maxMinutes !== null && row.durationSeconds > filters.maxMinutes * 60) return false;
    if (filters.shorts === "yes" && !row.isShorts) return false;
    if (filters.shorts === "no" && row.isShorts) return false;
    return true;
  });
}

function describeActiveFilters(filters) {
  const active = [];

  if (filters.minViews !== null) active.push(`조회수 ${formatNumber(filters.minViews)} 이상`);
  if (filters.minComments !== null) active.push(`댓글 ${formatNumber(filters.minComments)} 이상`);
  if (filters.minLikes !== null) active.push(`좋아요 ${formatNumber(filters.minLikes)} 이상`);
  if (filters.minSubscribers !== null || filters.maxSubscribers !== null) {
    active.push(
      `구독자 ${filters.minSubscribers === null ? "제한 없음" : formatNumber(filters.minSubscribers)} ~ ${
        filters.maxSubscribers === null ? "제한 없음" : formatNumber(filters.maxSubscribers)
      }`,
    );
  }
  if (filters.minMinutes !== null) active.push(`길이 ${filters.minMinutes}분 이상`);
  if (filters.maxMinutes !== null) active.push(`길이 ${filters.maxMinutes}분 이하`);
  if (filters.shorts === "yes") active.push("Shorts만");
  if (filters.shorts === "no") active.push("일반 영상만");

  return active.length ? active.join(", ") : "없음";
}

function renderRows(rows) {
  resultCount.textContent = rows.length.toLocaleString("ko-KR");

  if (!rows.length) {
    resultsBody.innerHTML = '<tr><td colspan="12" class="empty">검색 결과가 없습니다.</td></tr>';
    return;
  }

  resultsBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${formatDate(row.publishedAt)}</td>
          <td>
            <div class="video-cell">
              <img class="thumb" src="${escapeHtml(row.thumbnail)}" alt="" loading="lazy" />
              <div>
                <a class="title" href="${escapeHtml(row.videoUrl)}" target="_blank" rel="noreferrer">${escapeHtml(row.title)}</a>
                <span class="url">${escapeHtml(row.videoUrl)}</span>
              </div>
            </div>
          </td>
          <td>${escapeHtml(row.channelTitle)}</td>
          <td>${row.hiddenSubscriberCount ? "비공개" : formatNumber(row.subscriberCount)}</td>
          <td>${formatNumber(row.viewCount)}</td>
          <td>${formatNumber(row.commentCount)}</td>
          <td>${formatNumber(row.likeCount)}</td>
          <td>${escapeHtml(row.country || "-")}</td>
          <td>${escapeHtml(row.language || "-")}</td>
          <td><span class="tag ${row.isShorts ? "" : "no"}">${row.isShorts ? "Shorts" : "일반"}</span></td>
          <td>${formatDuration(row.durationSeconds)}</td>
          <td>${escapeHtml(row.keyword)}</td>
        </tr>
      `,
    )
    .join("");
}

function downloadCsv(rows) {
  const headers = [
    "업로드 날짜",
    "영상 링크",
    "제목",
    "채널명",
    "구독자 수",
    "조회수",
    "댓글 수",
    "좋아요 수",
    "국가",
    "언어",
    "Shorts 여부",
    "영상 길이",
    "키워드",
  ];

  const body = rows.map((row) => [
    formatDate(row.publishedAt),
    row.videoUrl,
    row.title,
    row.channelTitle,
    row.hiddenSubscriberCount ? "비공개" : row.subscriberCount,
    row.viewCount,
    row.commentCount,
    row.likeCount,
    row.country,
    row.language,
    row.isShorts ? "Shorts" : "일반",
    formatDuration(row.durationSeconds),
    row.keyword,
  ]);

  const csv = [headers, ...body]
    .map((cells) => cells.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ysearch-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseIsoDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function toNumber(value) {
  return Number(value || 0);
}

function toStartIso(date) {
  return date ? `${date}T00:00:00Z` : "";
}

function toEndIso(date) {
  return date ? `${date}T23:59:59Z` : "";
}

function applyDatePreset(preset) {
  if (!preset) return;

  const end = new Date();
  const start = new Date(end);

  if (preset === "7d") {
    start.setDate(start.getDate() - 7);
  } else if (preset === "1m") {
    start.setMonth(start.getMonth() - 1);
  } else if (preset === "6m") {
    start.setMonth(start.getMonth() - 6);
  } else if (preset === "1y") {
    start.setFullYear(start.getFullYear() - 1);
  }

  publishedAfterInput.value = toDateInputValue(start);
  publishedBeforeInput.value = toDateInputValue(end);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function estimateQuota(videoCount, channelCount, requestedSearchCount) {
  const searchCost = Math.ceil(requestedSearchCount / 50) * 100;
  const videoCost = Math.ceil(videoCount / 50);
  const channelCost = Math.ceil(channelCount / 50);
  return searchCost + videoCost + channelCost;
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function setStatus(message) {
  statusText.textContent = message;
}

function setLoading(isLoading) {
  form.querySelectorAll("button, input, select").forEach((element) => {
    if (element.id !== "clearKey") element.disabled = isLoading;
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
