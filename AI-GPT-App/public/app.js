const STORAGE_KEY = 'ai_gpt_app_conversations_v2';
const AUTH_TOKEN_KEY = 'ai_gpt_app_auth_token_v1';
const AI_PROVIDER_KEY = 'ai_gpt_app_ai_provider_v1';
const APP_BASE_PATH = window.location.pathname.startsWith('/ai-gpt-app') ? '/ai-gpt-app' : '';

const CHATGPT_ICON = `
  <svg class="chatgpt-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.28 9.82a5.98 5.98 0 0 0-.51-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07ZM13.26 22.43a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.8.8 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5ZM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.83 2.79A4.5 4.5 0 0 1 3.6 18.3ZM2.34 7.9a4.49 4.49 0 0 1 2.37-1.98v5.68c0 .28.15.53.39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9Zm16.6 3.85-5.83-3.39 2.01-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.4-.66Zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9c0-.03.01-.05.03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.68ZM8.31 12.86 6.29 11.7a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.8.8 0 0 0-.39.68Zm1.1-2.36 2.6-1.5 2.61 1.5v3l-2.6 1.5-2.61-1.5Z"/>
  </svg>
`;

const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const chatLog = document.getElementById('chatLog');
const sendButton = document.getElementById('sendButton');
const stopButton = document.getElementById('stopButton');
const attachButton = document.getElementById('attachButton');
const voiceButton = document.getElementById('voiceButton');
const attachmentInput = document.getElementById('attachmentInput');
const attachmentList = document.getElementById('attachmentList');
const statusEl = document.getElementById('status');
const conversationList = document.getElementById('conversationList');
const newChatButton = document.getElementById('newChatButton');
const clearHistoryButton = document.getElementById('clearHistoryButton');
const regenerateButton = document.getElementById('regenerateButton');
const exportButton = document.getElementById('exportButton');
const aiProviderSelect = document.getElementById('aiProviderSelect');
const openAiSystemRow = document.getElementById('openAiSystemRow');
const geminiSystemRow = document.getElementById('geminiSystemRow');
const imageEditSystemRow = document.getElementById('imageEditSystemRow');
const authTitle = document.getElementById('authTitle');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const resetPasswordForm = document.getElementById('resetPasswordForm');
const forgotPasswordButton = document.getElementById('forgotPasswordButton');
const showSignupButton = document.getElementById('showSignupButton');
const authError = document.getElementById('authError');
const logoutButton = document.getElementById('logoutButton');
const currentUserInitial = document.getElementById('currentUserInitial');
const openUserSettingsButton = document.getElementById('openUserSettingsButton');
const userSettingsOverlay = document.getElementById('userSettingsOverlay');
const closeUserSettingsButton = document.getElementById('closeUserSettingsButton');
const createUserForm = document.getElementById('createUserForm');
const usersList = document.getElementById('usersList');
const userSettingsMessage = document.getElementById('userSettingsMessage');

let conversations = [];
let activeConversationId = null;
let pending = false;
let activeRequest = null;
let currentUser = null;
let chatInitialized = false;
let pendingResetToken = '';
let pendingAttachments = [];
let lastEditableAttachmentsByConversation = new Map();
let streamRenderFrame = null;
let speechRecognition = null;
let voiceListening = false;
let voiceBaseText = '';
let voiceFinalText = '';
let activeSpeechButton = null;
let activeSpeechButtonHtml = '';
let pendingActivityText = 'กำลังคำนวณ...';

const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 18 * 1024 * 1024;
const DEFAULT_3D_TARGET_SIZE = { width: 1774, height: 887 };
const PROVIDER_LABELS = {
  openai: 'OpenAI GPT',
  gemini: 'Gemini',
};
const IMAGE_EDIT_MODE_LABELS = {
  chat: 'ถาม AI',
  '3d-design': 'ออกแบบ 3D',
  'white-bg': 'แต่งพื้นหลังขาว',
  'remove-bg': 'ลบพื้นหลัง',
  'product-light': 'ปรับแสง/วัสดุ',
  'ad-design': 'แต่งรูปแนวโฆษณา',
  'document-enhance': 'ปรับภาพให้ชัดขึ้น',
  custom: 'แก้รูปตามคำสั่ง',
};
const IMAGE_CREATE_LABEL = 'สร้างรูปจากข้อความ';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

async function requestJson(url, options = {}) {
  const token = getAuthToken();
  const requestUrl = url.startsWith('/api/') ? `${APP_BASE_PATH}${url}` : url;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(requestUrl, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function setAuthError(message = '', type = 'error') {
  if (!authError) return;
  authError.textContent = message;
  authError.classList.toggle('success', type === 'success');
}

function setAuthMode(mode = 'login') {
  const titles = {
    login: 'Login',
    signup: 'Sign in',
    forgot: 'ลืมรหัสผ่าน',
    reset: 'ตั้งรหัสผ่านใหม่',
  };
  const forms = {
    login: loginForm,
    signup: signupForm,
    forgot: forgotPasswordForm,
    reset: resetPasswordForm,
  };

  if (authTitle) authTitle.textContent = titles[mode] || titles.login;
  Object.entries(forms).forEach(([key, form]) => {
    if (form) form.hidden = key !== mode;
  });
}

function lockApp(hasUsers = true) {
  currentUser = null;
  document.body.classList.remove('auth-loading', 'auth-ready', 'is-admin');
  document.body.classList.add('auth-locked');
  pendingResetToken = '';
  setAuthMode('login');
  setAuthError(hasUsers ? '' : 'ยังไม่มีผู้ใช้ในระบบ กรุณาติดต่อผู้ดูแลระบบ');
}

function unlockApp(user) {
  currentUser = user;
  document.body.classList.remove('auth-loading', 'auth-locked');
  document.body.classList.add('auth-ready');
  document.body.classList.toggle('is-admin', user?.role === 'admin');
  if (currentUserInitial) {
    currentUserInitial.textContent = (user?.displayName || user?.username || 'U').trim().charAt(0).toUpperCase();
  }
  if (aiProviderSelect) {
    aiProviderSelect.value = getStoredProvider();
  }
  initChatApp();
}

async function bootstrapAuth() {
  try {
    const status = await requestJson('/api/auth/status');
    if (status.authenticated && status.user) {
      unlockApp(status.user);
    } else {
      setAuthToken('');
      lockApp(status.hasUsers);
    }
  } catch (error) {
    setAuthToken('');
    lockApp(true);
    setAuthError(error.message);
  }
}

function createId() {
  return `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createConversation() {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: 'แชทใหม่',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function loadConversations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    conversations = Array.isArray(parsed) ? parsed.filter((item) => item?.id) : [];
  } catch (error) {
    conversations = [];
  }

  if (!conversations.length) {
    conversations = [createConversation()];
  }

  activeConversationId = conversations[0].id;
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function getActiveConversation() {
  return conversations.find((item) => item.id === activeConversationId) || conversations[0];
}

function getProviderStorageKey() {
  return currentUser?.id ? `${AI_PROVIDER_KEY}_${currentUser.id}` : AI_PROVIDER_KEY;
}

function getStoredProvider() {
  const selected = localStorage.getItem(getProviderStorageKey()) || localStorage.getItem(AI_PROVIDER_KEY) || 'openai';
  return selected === 'gemini' ? 'gemini' : 'openai';
}

function getSelectedProvider() {
  const selected = aiProviderSelect?.value || getStoredProvider();
  return selected === 'gemini' ? 'gemini' : 'openai';
}

function setSystemRowStatus(row, configured, model) {
  if (!row) return;
  const value = configured ? (model || 'พร้อมใช้') : 'ยังไม่ได้ใส่ token';
  row.classList.toggle('missing', !configured);
  const status = row.querySelector('strong');
  if (status) status.textContent = value;
}

function setStatus(configured, text) {
  statusEl.classList.toggle('ready', configured);
  statusEl.classList.toggle('missing', !configured);
  statusEl.innerHTML = configured
    ? `<i class="fa-solid fa-circle-check"></i><span>${escapeHtml(text)}</span>`
    : `<i class="fa-solid fa-triangle-exclamation"></i><span>${escapeHtml(text)}</span>`;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    }).format(new Date(value));
  } catch (error) {
    return '';
  }
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function getFileIcon(type = '', name = '') {
  const lowerName = name.toLowerCase();
  if (type.startsWith('image/')) return 'fa-file-image';
  if (type === 'application/pdf' || lowerName.endsWith('.pdf')) return 'fa-file-pdf';
  if (lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) return 'fa-file-word';
  if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv')) return 'fa-file-excel';
  if (type.startsWith('text/') || /\.(txt|md|json|xml|html|css|js|ts|sql|log)$/i.test(lowerName)) return 'fa-file-lines';
  return 'fa-file';
}

function attachmentSummary(attachments = []) {
  if (!attachments.length) return '';
  return attachments
    .map((file) => `- ${file.name} (${formatFileSize(file.size)})`)
    .join('\n');
}

function makeTitleFromMessage(message) {
  const firstLine = String(message || '').replace(/\s+/g, ' ').trim();
  return firstLine.length > 46 ? `${firstLine.slice(0, 46)}...` : firstLine || 'แชทใหม่';
}

function formatMessage(text) {
  let html = escapeHtml(text);
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return html.replace(/\n/g, '<br>');
}

function renderAvatarIcon(role) {
  return role === 'user' ? '<i class="fa-solid fa-user"></i>' : CHATGPT_ICON;
}

function renderThinkingContent(text = 'กำลังคำนวณ...') {
  return `
    <span class="thinking-content">
      <span class="thinking-symbol" aria-hidden="true"></span>
      <span>${escapeHtml(text)}</span>
    </span>
  `;
}

function renderImageResult(image, messageIndex) {
  if (!image?.url) return '';
  const fileName = image.fileName || 'edited-image.png';
  const targetLabel = image.targetSize?.width && image.targetSize?.height
    ? ` ${image.targetSize.width}x${image.targetSize.height}px`
    : '';
  return `
    <div class="image-result">
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(fileName)}">
      <div class="image-result-actions">
        <button type="button" data-edit-generated-image="${messageIndex}">
          <i class="fa-solid fa-pen-to-square"></i>
          แก้ต่อ
        </button>
        <button type="button" data-download-image="${messageIndex}">
          <i class="fa-solid fa-download"></i>
          ดาวน์โหลดรูป${escapeHtml(targetLabel)}
        </button>
        <a href="${escapeHtml(image.url)}" target="_blank" rel="noreferrer">
          <i class="fa-solid fa-up-right-from-square"></i>
          เปิดรูป
        </a>
      </div>
    </div>
  `;
}

function renderConversationList() {
  const sorted = [...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  conversationList.innerHTML = sorted.map((conversation) => `
    <button class="conversation-item ${conversation.id === activeConversationId ? 'active' : ''}" type="button" data-chat-id="${escapeHtml(conversation.id)}">
      <strong>${escapeHtml(conversation.title || 'แชทใหม่')}</strong>
      <span>${conversation.messages.length} ข้อความ · ${formatDate(conversation.updatedAt)}</span>
    </button>
  `).join('');
}

function renderMessages() {
  const conversation = getActiveConversation();

  if (!conversation || !conversation.messages.length) {
    chatLog.innerHTML = `
      <div class="empty-state">
        ${CHATGPT_ICON}
        <h3>เริ่มคุยกับ AI ได้เลย</h3>
        <p>ระบบจะจำบริบทในบทสนทนานี้ และบันทึกประวัติไว้ในเครื่องนี้</p>
      </div>
    `;
  } else {
    chatLog.innerHTML = conversation.messages.map((message, index) => {
      const canCopy = message.role === 'assistant' && message.content && !message.streaming;
      const canRead = message.role === 'assistant' && message.content && !message.streaming;
      const bubbleContent = message.streaming && !message.content
        ? renderThinkingContent('กำลังคำนวณคำตอบ...')
        : formatMessage(message.content);
      return `
        <div class="message ${escapeHtml(message.role)}">
          <div class="avatar">${renderAvatarIcon(message.role)}</div>
          <div class="message-body">
            <div class="bubble ${message.streaming ? 'streaming' : ''}">${bubbleContent}</div>
            ${message.image ? renderImageResult(message.image, index) : ''}
            ${canCopy || canRead ? `
              <div class="message-actions">
                ${canRead ? `
                  <button type="button" data-read-message="${index}">
                    <i class="fa-solid fa-volume-high"></i>
                    อ่าน
                  </button>
                ` : ''}
                ${canCopy ? `<button type="button" data-copy-message="${index}">
                  <i class="fa-solid fa-copy"></i>
                  คัดลอก
                </button>` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  const hasStreamingMessage = Boolean(conversation?.messages?.some((message) => message.streaming));
  if (pending && !hasStreamingMessage) {
    chatLog.insertAdjacentHTML('beforeend', `
      <div class="message assistant">
        <div class="avatar">${renderAvatarIcon('assistant')}</div>
        <div class="message-body">
          <div class="bubble thinking">${renderThinkingContent(pendingActivityText)}</div>
        </div>
      </div>
    `);
  }

  const hasUserMessage = Boolean(conversation?.messages?.some((message) => message.role === 'user'));
  regenerateButton.disabled = pending || !hasUserMessage;
  exportButton.disabled = !conversation?.messages?.length;
  chatLog.scrollTop = chatLog.scrollHeight;
}

function render() {
  renderConversationList();
  renderMessages();
}

function renderAttachmentList() {
  if (!attachmentList) return;
  attachmentList.hidden = !pendingAttachments.length;
  attachmentList.innerHTML = pendingAttachments.map((file) => `
    <div class="attachment-chip" title="${escapeHtml(file.name)}">
      <i class="fa-solid ${getFileIcon(file.type, file.name)}"></i>
      <span>${escapeHtml(file.name)}</span>
      <small>${formatFileSize(file.size)}</small>
      <button class="attachment-remove" type="button" data-remove-attachment="${escapeHtml(file.id)}" title="ลบไฟล์">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');
}

function readImageSizeFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({});
    image.src = dataUrl;
  });
}

function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result || '');
      const [, base64 = ''] = result.split(',');
      const attachment = {
        id: `file_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: file.name || 'clipboard-image.png',
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: base64,
      };
      if (attachment.type.startsWith('image/')) {
        Object.assign(attachment, await readImageSizeFromDataUrl(result));
      }
      resolve(attachment);
    };
    reader.onerror = () => reject(new Error(`อ่านไฟล์ ${file.name || 'clipboard-image.png'} ไม่สำเร็จ`));
    reader.readAsDataURL(file);
  });
}

function blobToAttachment(blob, fileName = 'edited-image.png') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result || '');
      const [, base64 = ''] = result.split(',');
      const attachment = {
        id: `file_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: fileName,
        type: blob.type || 'image/png',
        size: blob.size,
        data: base64,
      };
      if (attachment.type.startsWith('image/')) {
        Object.assign(attachment, await readImageSizeFromDataUrl(result));
      }
      resolve(attachment);
    };
    reader.onerror = () => reject(new Error('อ่านรูปสำหรับแก้ต่อไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });
}

async function addAttachments(files) {
  const nextFiles = Array.from(files || []);
  if (!nextFiles.length) return;

  const totalCount = pendingAttachments.length + nextFiles.length;
  if (totalCount > MAX_ATTACHMENTS) {
    window.alert(`แนบได้สูงสุด ${MAX_ATTACHMENTS} ไฟล์ต่อครั้ง`);
    return;
  }

  const currentBytes = pendingAttachments.reduce((sum, file) => sum + file.size, 0);
  const nextBytes = nextFiles.reduce((sum, file) => sum + file.size, 0);
  if (currentBytes + nextBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    window.alert(`ขนาดไฟล์รวมต้องไม่เกิน ${formatFileSize(MAX_TOTAL_ATTACHMENT_BYTES)}`);
    return;
  }

  for (const file of nextFiles) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      window.alert(`${file.name} ใหญ่เกินไป แนบได้ไม่เกิน ${formatFileSize(MAX_ATTACHMENT_BYTES)} ต่อไฟล์`);
      continue;
    }
    pendingAttachments.push(await fileToAttachment(file));
  }

  renderAttachmentList();
}

function clearAttachments() {
  pendingAttachments = [];
  if (attachmentInput) attachmentInput.value = '';
  renderAttachmentList();
}

async function loadStatus() {
  try {
    const status = await requestJson('/api/status');
    const providers = status.providers || {};
    const selected = getSelectedProvider();
    const selectedStatus = providers[selected] || {};

    setSystemRowStatus(openAiSystemRow, Boolean(providers.openai?.configured), providers.openai?.model);
    setSystemRowStatus(geminiSystemRow, Boolean(providers.gemini?.configured), providers.gemini?.model);
    setSystemRowStatus(imageEditSystemRow, Boolean(providers.imageEdit?.configured), providers.imageEdit?.model);

    if (aiProviderSelect) {
      aiProviderSelect.value = selected;
      [...aiProviderSelect.options].forEach((option) => {
        option.textContent = providers[option.value]?.model
          ? `${PROVIDER_LABELS[option.value] || option.value} (${providers[option.value].model})`
          : PROVIDER_LABELS[option.value] || option.value;
      });
    }

    setStatus(
      Boolean(selectedStatus.configured),
      selectedStatus.configured
        ? `พร้อมใช้งาน ${selectedStatus.model || PROVIDER_LABELS[selected]}`
        : `${PROVIDER_LABELS[selected]} ยังไม่ได้ใส่ token`
    );
  } catch (error) {
    setStatus(false, error.message);
  }
}

function setPending(value, activityText = 'กำลังคำนวณ...') {
  pending = value;
  pendingActivityText = value ? activityText : 'กำลังคำนวณ...';
  sendButton.disabled = value;
  attachButton.disabled = value;
  if (voiceButton) voiceButton.disabled = value;
  if (aiProviderSelect) aiProviderSelect.disabled = value;
  stopButton.hidden = !value;
  sendButton.innerHTML = value
    ? '<i class="fa-solid fa-circle-notch fa-spin"></i> ส่งอยู่'
    : '<i class="fa-solid fa-paper-plane"></i> ส่ง';
  render();
}

async function askAi(messages, attachments = []) {
  activeRequest = new AbortController();
  const payload = await requestJson('/api/chat', {
    method: 'POST',
    signal: activeRequest.signal,
    body: JSON.stringify({ messages, attachments, provider: getSelectedProvider() }),
  });
  return payload.answer || '';
}

function scheduleStreamRender() {
  if (streamRenderFrame) return;
  streamRenderFrame = requestAnimationFrame(() => {
    streamRenderFrame = null;
    renderMessages();
  });
}

function parseSseBlock(block) {
  const event = { type: 'message', data: '' };
  const dataLines = [];

  block.split(/\r?\n/).forEach((line) => {
    if (line.startsWith('event:')) {
      event.type = line.slice(6).trim() || 'message';
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  });

  event.data = dataLines.join('\n');
  return event;
}

async function askAiStream(messages, attachments = [], onDelta = () => {}) {
  activeRequest = new AbortController();
  const token = getAuthToken();
  const response = await fetch(`${APP_BASE_PATH}/api/chat/stream`, {
    method: 'POST',
    signal: activeRequest.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, attachments, provider: getSelectedProvider() }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Request failed');
  }

  if (!response.body) {
    const answer = await askAi(messages, attachments);
    onDelta(answer);
    return { model: '' };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalInfo = {};

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');

    while (boundary !== -1) {
      const block = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
      if (!block) continue;

      const event = parseSseBlock(block);
      const data = event.data ? JSON.parse(event.data) : {};
      if (event.type === 'delta' && data.text) {
        onDelta(data.text);
      } else if (event.type === 'done') {
        finalInfo = data;
      } else if (event.type === 'error') {
        throw new Error(data.error || 'AI ตอบไม่สำเร็จ');
      }
    }
  }

  return finalInfo;
}

function hasEditableImage(attachments = []) {
  return attachments.some((file) => {
    const name = String(file.name || '').toLowerCase();
    return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(name);
  });
}

function getEditableAttachments(attachments = []) {
  return attachments.filter((file) => {
    const name = String(file.name || '').toLowerCase();
    return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(name);
  });
}

function looksLike3DRequest(message = '') {
  const text = String(message || '').toLowerCase();
  return [
    '3d',
    'สามมิติ',
    'แบบสามมิติ',
    'เขียนแบบ',
    'โมเดล',
    'model',
    'render',
    'เรนเดอร์',
    'material',
    'texture',
    'lighting',
    'viewport',
    'wireframe',
    'isometric',
    'orthographic',
    'cad',
    'blender',
  ].some((keyword) => text.includes(keyword));
}

function normalizeTargetSize(value) {
  const width = Number(value?.width || 0);
  const height = Number(value?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 128 || height < 128 || width > 4096 || height > 4096) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

function inferImageTargetSize(message = '', attachments = []) {
  const attachedTarget = getEditableAttachments(attachments)
    .map((file) => normalizeTargetSize(file.targetSize))
    .find(Boolean);
  if (attachedTarget) return attachedTarget;
  if (looksLike3DRequest(message)) return { ...DEFAULT_3D_TARGET_SIZE };
  return null;
}

function inferImageSize(message = '', attachments = [], fallback = 'auto') {
  const text = String(message || '').toLowerCase();
  if (text.includes('1:1') || text.includes('จัตุรัส') || text.includes('สี่เหลี่ยม') || text.includes('square')) return '1024x1024';
  if (text.includes('9:16') || text.includes('แนวตั้ง') || text.includes('โปสเตอร์') || text.includes('story') || text.includes('portrait') || text.includes('vertical')) return '1024x1536';
  if (text.includes('16:9') || text.includes('แบนเนอร์') || text.includes('ปก') || text.includes('banner') || text.includes('landscape') || text.includes('cover')) return '1536x1024';
  if (inferImageTargetSize(message, attachments)) return 'auto';
  if (text.includes('แนวนอน')) return '1536x1024';

  const image = getEditableAttachments(attachments)[0];
  if (image?.width && image?.height) {
    const ratio = image.width / image.height;
    if (ratio > 1.18) return '1536x1024';
    if (ratio < 0.85) return '1024x1536';
  }

  return fallback;
}

function rememberEditableAttachments(attachments = []) {
  const editable = getEditableAttachments(attachments);
  if (activeConversationId && editable.length) {
    lastEditableAttachmentsByConversation.set(activeConversationId, editable);
  }
}

function getRememberedEditableAttachments() {
  return activeConversationId
    ? [...(lastEditableAttachmentsByConversation.get(activeConversationId) || [])]
    : [];
}

function looksLikeImageEditRequest(message = '') {
  const text = String(message || '').toLowerCase();
  return [
    'แก้ไข',
    'แก้ไขรูป',
    'แก้ไขภาพ',
    'แก้ไขเลย',
    'แก้รูป',
    'แต่งรูป',
    'แต่งภาพ',
    'ปรับภาพ',
    'ปรับรูป',
    'เพิ่มความชัด',
    'ปรับความชัด',
    'ปรับความคม',
    'ทำให้ชัด',
    'ให้ชัดขึ้น',
    'ชัดขึ้น',
    'คมขึ้น',
    'อ่านง่าย',
    'อ่านง่ายขึ้น',
    'ลดเบลอ',
    'แก้เบลอ',
    'เอกสารชัด',
    'ตัดต่อ',
    'ตัดต่อรูป',
    'ตัดต่อภาพ',
    'ใส่ฉาก',
    'เปลี่ยนฉาก',
    'เปลี่ยนพื้นหลัง',
    'ฉากหลัง',
    'พื้นหลังใหม่',
    'วางบน',
    'ย้ายไป',
    'ใส่รถ',
    'เอารถ',
    'ลบพื้นหลัง',
    'ตัดพื้นหลัง',
    'พื้นหลังขาว',
    'ทำพื้นขาว',
    'ปรับแสง',
    'เพิ่มแสง',
    'ลบรอย',
    'ลบฝุ่น',
    'รีทัช',
    'แก้ต่อ',
    'แก้เพิ่ม',
    'ปรับอีก',
    'ใส่ข้อความ',
    'เพิ่มข้อความ',
    'แต่งแนวโฆษณา',
    'ทำโฆษณา',
    'แสงเงา',
    'ปรับสี',
    'โทนภาพ',
    'โปสเตอร์',
    'แบนเนอร์',
    'ออกแบบ 3d',
    'ออกแบบสามมิติ',
    'ดีไซน์ 3d',
    'เขียนแบบ',
    '3d',
    'สามมิติ',
    'แบบสามมิติ',
    'โมเดล',
    'เรนเดอร์',
    'วัสดุ',
    'พื้นผิว',
    'แสงเงา',
    'ครอป',
    'crop',
    'composite',
    'change background',
    'replace background',
    'add text',
    'scene',
    'background',
    'remove background',
    'background remover',
    'white background',
    'retouch',
    'enhance',
    'sharpen',
    'clearer',
    'deblur',
    'improve quality',
    'edit image',
    'product photo',
    'advertising',
    'poster',
    'banner',
    'model',
    'render',
    'material',
    'texture',
    'lighting',
    'viewport',
    'wireframe',
    'isometric',
    'orthographic',
    'cad',
    'blender',
  ].some((keyword) => text.includes(keyword));
}

function looksLikeImageCreateRequest(message = '') {
  const text = String(message || '').toLowerCase();
  return [
    'เจนรูป',
    'เจนภาพ',
    'สร้างรูป',
    'สร้างภาพ',
    'วาดรูป',
    'ทำรูป',
    'ทำภาพ',
    'ออกแบบ',
    'ดีไซน์',
    'คอนเซปต์',
    'concept',
    'ทำภาพโฆษณา',
    'ทำโปสเตอร์',
    'ทำแบนเนอร์',
    'ทำโฆษณา',
    'แต่งแนวโฆษณา',
    'ใส่ข้อความ',
    'ออกแบบ 3d',
    'ออกแบบสามมิติ',
    'ดีไซน์ 3d',
    'สร้าง 3d',
    'ทำ 3d',
    'เขียนแบบ',
    'โมเดล',
    'เรนเดอร์',
    'generate image',
    'create image',
    'make image',
    'draw image',
    'poster',
    'banner',
    'advertising',
    'ad creative',
    '3d',
    'model',
    'render',
    'isometric',
    'cad',
    'blender',
  ].some((keyword) => text.includes(keyword));
}

function looksLikeExplicitImageCreateRequest(message = '') {
  const text = String(message || '').toLowerCase();
  return [
    'เจนรูป',
    'เจนภาพ',
    'สร้างรูป',
    'สร้างภาพ',
    'วาดรูป',
    'ทำรูป',
    'ทำภาพ',
    'ช่วยสร้าง',
    'ช่วยวาด',
    'ช่วยทำภาพ',
    'ช่วยทำรูป',
    'generate image',
    'create image',
    'make image',
    'draw image',
  ].some((keyword) => text.includes(keyword));
}

function shouldCreateImageFromText(message = '') {
  if (!looksLikeImageCreateRequest(message)) return false;
  if (looksLikeImageQuestion(message) && !looksLikeExplicitImageCreateRequest(message)) return false;
  return true;
}

function looksLikeImageQuestion(message = '') {
  const text = String(message || '').toLowerCase();
  return [
    'วิเคราะห์',
    'อธิบาย',
    'แนะนำ',
    'บอก',
    'ตรวจ',
    'ถาม',
    'ช่วยดู',
    'ดูให้หน่อย',
    'ควร',
    'ยังไง',
    'อย่างไร',
    'ไหม',
    'ดีไหม',
    'ใช่ไหม',
    'ในรูปคือ',
    'ในภาพคือ',
    'รูปนี้คือ',
    'ภาพนี้คือ',
    'ในรูปมีอะไร',
    'ในภาพมีอะไร',
    'อ่านตัวหนังสือ',
    'อ่านข้อความ',
    'แปลข้อความ',
    'สรุปจากรูป',
    'ดูให้หน่อยว่า',
    'ช่วยดูว่า',
    'คืออะไร',
    'มีอะไร',
    'หมายถึงอะไร',
    'ทำอะไรได้บ้าง',
    'describe',
    'analyze',
    'explain',
    'what is',
    'how to',
    'should',
    'read text',
    'ocr',
  ].some((keyword) => text.includes(keyword));
}

function looksLikeBroadImageEditRequest(message = '') {
  const text = String(message || '').toLowerCase();
  if (!text.trim()) return false;

  return [
    'ทำให้',
    'ทำเป็น',
    'ทำภาพโฆษณา',
    'ทำโฆษณา',
    'ทำโปสเตอร์',
    'ทำแบนเนอร์',
    'ทำพื้น',
    'ทำฉาก',
    'แต่ง',
    'แต่งรูป',
    'แต่งภาพ',
    'ตัดต่อ',
    'ตัดพื้น',
    'ตัดฉาก',
    'ใส่',
    'ใส่ฉาก',
    'ใส่พื้นหลัง',
    'ใส่ข้อความ',
    'ใส่โลโก้',
    'เพิ่ม',
    'เพิ่มข้อความ',
    'เพิ่มโลโก้',
    'ลบ',
    'ลบออก',
    'เอาออก',
    'เปลี่ยน',
    'เปลี่ยนฉาก',
    'เปลี่ยนพื้นหลัง',
    'ปรับ',
    'ปรับแสง',
    'ปรับสี',
    'ปรับให้ชัด',
    'เพิ่มความชัด',
    'ทำให้ชัด',
    'ให้ชัดขึ้น',
    'ชัดขึ้น',
    'คมขึ้น',
    'อ่านง่ายขึ้น',
    'ลดเบลอ',
    'แก้เบลอ',
    'ย้าย',
    'วาง',
    'ขยาย',
    'ย่อ',
    'เบลอ',
    'ทำให้ชัด',
    'ทำให้คม',
    'ทำให้สว่าง',
    'ทำให้มืด',
    'ให้ลอย',
    'รถลอย',
    'make',
    'edit',
    'put',
    'add',
    'remove',
    'replace',
    'change',
    'place',
    'background',
  ].some((keyword) => text.includes(keyword));
}

function shouldUseImageEdit(message = '', attachments = []) {
  if (!hasEditableImage(attachments)) return false;
  const directEdit = looksLikeImageEditRequest(message) || looksLikeBroadImageEditRequest(message);
  const createFromText = looksLikeImageCreateRequest(message);
  const question = looksLikeImageQuestion(message);
  const politeEditCommand = /(ให้หน่อย|ให้ที|เลย|ด้วย|ช่วย\s*(ใส่|เพิ่ม|ลบ|เปลี่ยน|ปรับ|แต่ง|ตัดต่อ|ทำ|วาง|ย้าย|ครอป|รีทัช))/i.test(message);

  if (question && !directEdit && !createFromText) return false;
  if (question && !politeEditCommand && /(ควร|ยังไง|อย่างไร|ไหม|ดีไหม|แนะนำ|วิเคราะห์|อธิบาย|อ่าน|แปล|คืออะไร|มีอะไร|ทำอะไรได้บ้าง|how to|should|what is)/i.test(message)) {
    return false;
  }

  return directEdit || createFromText;
}

function inferImageEditMode(message = '', attachments = []) {
  const text = String(message || '').toLowerCase();
  if (!shouldUseImageEdit(message, attachments)) return 'chat';

  if (looksLike3DRequest(message) || inferImageTargetSize('', attachments)) {
    return '3d-design';
  }
  if (text.includes('เอกสาร') || text.includes('ชัด') || text.includes('คม') || text.includes('อ่านง่าย') || text.includes('เบลอ') || text.includes('enhance') || text.includes('sharpen') || text.includes('clearer') || text.includes('deblur')) {
    return 'document-enhance';
  }
  if (text.includes('โฆษณา') || text.includes('ใส่ข้อความ') || text.includes('เพิ่มข้อความ') || text.includes('โปสเตอร์') || text.includes('แบนเนอร์') || text.includes('คอนเซปต์') || text.includes('advertising') || text.includes('poster') || text.includes('banner')) {
    return 'ad-design';
  }
  if (text.includes('พื้นหลังขาว') || text.includes('ทำพื้นขาว') || text.includes('white background')) {
    return 'white-bg';
  }
  if (text.includes('ลบพื้นหลัง') || text.includes('ตัดพื้นหลัง') || text.includes('remove background') || text.includes('background remover')) {
    return 'remove-bg';
  }
  if (text.includes('ปรับแสง') || text.includes('เพิ่มแสง') || text.includes('สินค้า') || text.includes('product photo')) {
    return 'product-light';
  }
  return 'custom';
}

async function editImage(prompt, attachments = [], mode = 'custom') {
  activeRequest = new AbortController();
  return requestJson('/api/images/edit', {
    method: 'POST',
    signal: activeRequest.signal,
    body: JSON.stringify({
      prompt,
      attachments,
      mode,
      size: inferImageSize(prompt, attachments, 'auto'),
      targetSize: inferImageTargetSize(prompt, attachments),
    }),
  });
}

async function createImage(prompt) {
  activeRequest = new AbortController();
  return requestJson('/api/images/create', {
    method: 'POST',
    signal: activeRequest.signal,
    body: JSON.stringify({
      prompt,
      size: inferImageSize(prompt, [], 'auto'),
      targetSize: inferImageTargetSize(prompt, []),
    }),
  });
}

function triggerDownload(url, fileName) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
}

function loadImageForCanvas(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('โหลดรูปสำหรับดาวน์โหลดไม่สำเร็จ'));
    image.src = url;
  });
}

async function downloadImageResult(image = {}) {
  if (!image.url) return;
  const fileName = image.fileName || 'ai-image.png';
  const targetSize = normalizeTargetSize(image.targetSize);
  if (!targetSize) {
    triggerDownload(image.url, fileName);
    return;
  }

  const source = await loadImageForCanvas(image.url);
  const canvas = document.createElement('canvas');
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(canvas.width / source.naturalWidth, canvas.height / source.naturalHeight);
  const drawWidth = Math.round(source.naturalWidth * scale);
  const drawHeight = Math.round(source.naturalHeight * scale);
  const x = Math.round((canvas.width - drawWidth) / 2);
  const y = Math.round((canvas.height - drawHeight) / 2);
  context.drawImage(source, x, y, drawWidth, drawHeight);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('สร้างไฟล์ดาวน์โหลดไม่สำเร็จ');
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName.replace(/\.[^.]+$/, '') + `-${targetSize.width}x${targetSize.height}.png`);
  URL.revokeObjectURL(url);
}

async function sendImageEdit(message, attachments = [], mode = 'custom') {
  const conversation = getActiveConversation();
  const now = new Date().toISOString();
  const modeLabel = IMAGE_EDIT_MODE_LABELS[mode] || IMAGE_EDIT_MODE_LABELS.custom;
  const fileSummary = attachmentSummary(attachments);
  rememberEditableAttachments(attachments);
  const displayMessage = [
    `${modeLabel}: ${message || 'จัดการรูปที่แนบให้พร้อมใช้งาน'}`,
    fileSummary ? `\nไฟล์แนบ:\n${fileSummary}` : '',
  ].join('').trim();

  conversation.messages.push({ role: 'user', content: displayMessage });
  if (conversation.title === 'แชทใหม่') {
    conversation.title = makeTitleFromMessage(message || modeLabel);
  }
  conversation.updatedAt = now;
  saveConversations();
  setPending(true, 'กำลังแก้รูป...');

  try {
    const result = await editImage(message, attachments, mode);
    conversation.messages.push({
      role: 'assistant',
      content: `แก้รูปเรียบร้อยแล้ว (${result.model || 'OpenAI Image'})`,
      image: result.image,
    });
    conversation.updatedAt = new Date().toISOString();
    saveConversations();
  } catch (error) {
    if (error.message.includes('เข้าสู่ระบบ')) {
      setAuthToken('');
      lockApp(true);
      return;
    }
    if (error.name !== 'AbortError') {
      conversation.messages.push({
        role: 'assistant',
        content: `เกิดข้อผิดพลาด: ${error.message}`,
      });
      conversation.updatedAt = new Date().toISOString();
      saveConversations();
    }
  } finally {
    activeRequest = null;
    setPending(false);
  }
}

async function sendImageCreate(message) {
  const conversation = getActiveConversation();
  const now = new Date().toISOString();
  const displayMessage = `${IMAGE_CREATE_LABEL}: ${message}`;

  conversation.messages.push({ role: 'user', content: displayMessage });
  if (conversation.title === 'แชทใหม่') {
    conversation.title = makeTitleFromMessage(message || IMAGE_CREATE_LABEL);
  }
  conversation.updatedAt = now;
  saveConversations();
  setPending(true, 'กำลังสร้างรูป...');

  try {
    const result = await createImage(message);
    conversation.messages.push({
      role: 'assistant',
      content: `สร้างรูปเรียบร้อยแล้ว (${result.model || 'OpenAI Image'})`,
      image: result.image,
    });
    conversation.updatedAt = new Date().toISOString();
    saveConversations();
  } catch (error) {
    if (error.message.includes('เข้าสู่ระบบ')) {
      setAuthToken('');
      lockApp(true);
      return;
    }
    if (error.name !== 'AbortError') {
      conversation.messages.push({
        role: 'assistant',
        content: `เกิดข้อผิดพลาด: ${error.message}`,
      });
      conversation.updatedAt = new Date().toISOString();
      saveConversations();
    }
  } finally {
    activeRequest = null;
    setPending(false);
  }
}

async function sendMessage(message, attachments = []) {
  const conversation = getActiveConversation();
  const now = new Date().toISOString();
  const fileSummary = attachmentSummary(attachments);
  rememberEditableAttachments(attachments);
  const displayMessage = [
    message || 'ช่วยดูไฟล์ที่แนบให้หน่อย',
    fileSummary ? `\nไฟล์แนบ:\n${fileSummary}` : '',
  ].join('').trim();

  conversation.messages.push({ role: 'user', content: displayMessage });
  if (conversation.title === 'แชทใหม่') {
    conversation.title = makeTitleFromMessage(message || attachments[0]?.name || 'ไฟล์แนบ');
  }
  conversation.updatedAt = now;
  saveConversations();
  const messagesForApi = conversation.messages.map((item) => ({ role: item.role, content: item.content }));
  const assistantMessage = { role: 'assistant', content: '', streaming: true };
  conversation.messages.push(assistantMessage);
  setPending(true, attachments.length ? 'กำลังอ่านไฟล์และคำนวณคำตอบ...' : 'กำลังคำนวณคำตอบ...');

  try {
    let answer = '';
    await askAiStream(messagesForApi, attachments, (chunk) => {
      answer += chunk;
      assistantMessage.content = answer;
      conversation.updatedAt = new Date().toISOString();
      scheduleStreamRender();
    });
    assistantMessage.streaming = false;
    assistantMessage.content = answer.trim() || 'AI ไม่ได้ส่งข้อความกลับมา';
    conversation.updatedAt = new Date().toISOString();
    saveConversations();
  } catch (error) {
    if (error.message.includes('เข้าสู่ระบบ')) {
      setAuthToken('');
      lockApp(true);
      return;
    }
    if (error.name === 'AbortError') {
      assistantMessage.streaming = false;
      assistantMessage.content = assistantMessage.content || 'หยุดการตอบแล้ว';
      conversation.updatedAt = new Date().toISOString();
      saveConversations();
    } else {
      assistantMessage.streaming = false;
      assistantMessage.content = assistantMessage.content
        ? `${assistantMessage.content}\n\nเกิดข้อผิดพลาด: ${error.message}`
        : `เกิดข้อผิดพลาด: ${error.message}`;
      conversation.updatedAt = new Date().toISOString();
      saveConversations();
    }
  } finally {
    activeRequest = null;
    setPending(false);
  }
}

async function regenerateLastAnswer() {
  const conversation = getActiveConversation();
  if (!conversation || pending) return;

  while (conversation.messages.length && conversation.messages[conversation.messages.length - 1].role === 'assistant') {
    conversation.messages.pop();
  }

  const hasUserMessage = conversation.messages.some((message) => message.role === 'user');
  if (!hasUserMessage) return;

  conversation.updatedAt = new Date().toISOString();
  saveConversations();
  const messagesForApi = conversation.messages.map((item) => ({ role: item.role, content: item.content }));
  const assistantMessage = { role: 'assistant', content: '', streaming: true };
  conversation.messages.push(assistantMessage);
  setPending(true, 'กำลังคำนวณคำตอบใหม่...');

  try {
    let answer = '';
    await askAiStream(messagesForApi, [], (chunk) => {
      answer += chunk;
      assistantMessage.content = answer;
      conversation.updatedAt = new Date().toISOString();
      scheduleStreamRender();
    });
    assistantMessage.streaming = false;
    assistantMessage.content = answer.trim() || 'AI ไม่ได้ส่งข้อความกลับมา';
    conversation.updatedAt = new Date().toISOString();
    saveConversations();
  } catch (error) {
    assistantMessage.streaming = false;
    if (error.name === 'AbortError') {
      assistantMessage.content = assistantMessage.content || 'หยุดการตอบแล้ว';
    } else {
      assistantMessage.content = assistantMessage.content
        ? `${assistantMessage.content}\n\nเกิดข้อผิดพลาด: ${error.message}`
        : `เกิดข้อผิดพลาด: ${error.message}`;
    }
    if (assistantMessage.content) {
      conversation.updatedAt = new Date().toISOString();
      saveConversations();
    }
  } finally {
    activeRequest = null;
    setPending(false);
  }
}

function initChatApp() {
  if (chatInitialized) {
    render();
    loadStatus();
    return;
  }
  chatInitialized = true;
  loadConversations();
  render();
  loadStatus();
}

async function loadUsers() {
  if (!currentUser || currentUser.role !== 'admin') return;
  usersList.innerHTML = '<div class="settings-muted">กำลังโหลดผู้ใช้...</div>';

  try {
    const payload = await requestJson('/api/users');
    usersList.innerHTML = payload.users.map((user) => {
      const roleLabel = user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป';
      const employeeText = user.employeeId ? `รหัสพนักงาน ${user.employeeId}` : 'ยังไม่มีรหัสพนักงาน';

      return `
        <div class="user-row">
          <div class="user-avatar">${escapeHtml((user.displayName || user.username).charAt(0).toUpperCase())}</div>
          <div>
            <strong>${escapeHtml(user.displayName)}</strong>
            <span>${escapeHtml(user.username)} · ${escapeHtml(employeeText)} · ${roleLabel}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    usersList.innerHTML = `<div class="settings-error">${escapeHtml(error.message)}</div>`;
  }
}

function setVoiceButtonState(isListening) {
  voiceListening = isListening;
  if (!voiceButton) return;
  voiceButton.classList.toggle('listening', isListening);
  voiceButton.innerHTML = isListening
    ? '<i class="fa-solid fa-circle-stop"></i> หยุดพูด'
    : '<i class="fa-solid fa-microphone"></i> พูด';
}

function toggleVoiceInput() {
  if (!voiceButton || pending) return;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    window.alert('Browser นี้ยังไม่รองรับการพิมพ์ด้วยเสียง');
    return;
  }

  if (voiceListening && speechRecognition) {
    speechRecognition.stop();
    return;
  }

  speechRecognition = new Recognition();
  speechRecognition.lang = 'th-TH';
  speechRecognition.interimResults = true;
  speechRecognition.continuous = false;
  voiceBaseText = messageInput.value.trim();
  voiceFinalText = '';

  speechRecognition.onstart = () => setVoiceButtonState(true);
  speechRecognition.onerror = (event) => {
    setVoiceButtonState(false);
    if (event.error && event.error !== 'no-speech') {
      window.alert(`ใช้เสียงไม่สำเร็จ: ${event.error}`);
    }
  };
  speechRecognition.onend = () => setVoiceButtonState(false);
  speechRecognition.onresult = (event) => {
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) {
        voiceFinalText += transcript;
      } else {
        interimText += transcript;
      }
    }
    const spokenText = `${voiceFinalText}${interimText}`.trim();
    messageInput.value = [voiceBaseText, spokenText].filter(Boolean).join(' ');
  };

  speechRecognition.start();
}

function cleanSpeechText(text = '') {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_#>\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resetSpeechButton() {
  if (activeSpeechButton && activeSpeechButtonHtml) {
    activeSpeechButton.innerHTML = activeSpeechButtonHtml;
  }
  activeSpeechButton = null;
  activeSpeechButtonHtml = '';
}

function speakText(text, button) {
  if (!window.speechSynthesis) {
    window.alert('Browser นี้ยังไม่รองรับการอ่านออกเสียง');
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (activeSpeechButton === button) {
      resetSpeechButton();
      return;
    }
    resetSpeechButton();
  }

  const speechText = cleanSpeechText(text);
  if (!speechText) return;

  activeSpeechButton = button;
  activeSpeechButtonHtml = button.innerHTML;
  button.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> หยุดอ่าน';

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.lang = 'th-TH';
  utterance.rate = 1;
  utterance.onend = resetSpeechButton;
  utterance.onerror = resetSpeechButton;
  window.speechSynthesis.speak(utterance);
}

function openUserSettings() {
  if (currentUser?.role !== 'admin') return;
  userSettingsOverlay.hidden = false;
  userSettingsMessage.textContent = '';
  loadUsers();
}

function closeUserSettings() {
  userSettingsOverlay.hidden = true;
}

showSignupButton.addEventListener('click', () => {
  setAuthMode('signup');
  setAuthError('');
  document.getElementById('signupUsername')?.focus();
});

forgotPasswordButton.addEventListener('click', () => {
  setAuthMode('forgot');
  setAuthError('');
  document.getElementById('forgotEmployeeId')?.focus();
});

document.querySelectorAll('[data-auth-mode="login"]').forEach((button) => {
  button.addEventListener('click', () => {
    pendingResetToken = '';
    loginForm.reset();
    signupForm.reset();
    forgotPasswordForm.reset();
    resetPasswordForm.reset();
    setAuthMode('login');
    setAuthError('');
    document.getElementById('loginUsername')?.focus();
  });
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setAuthError('');

  try {
    const payload = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('loginUsername').value,
        password: document.getElementById('loginPassword').value,
      }),
    });
    setAuthToken(payload.token);
    loginForm.reset();
    unlockApp(payload.user);
  } catch (error) {
    setAuthError(error.message);
  }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setAuthError('');

  try {
    await requestJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('signupUsername').value,
        password: document.getElementById('signupPassword').value,
        displayName: document.getElementById('signupDisplayName').value,
        employeeId: document.getElementById('signupEmployeeId').value,
      }),
    });
    signupForm.reset();
    setAuthMode('login');
    setAuthError('สมัครใช้งานเรียบร้อยแล้ว กรุณา Login ด้วย User และ Password ที่สมัครไว้', 'success');
    document.getElementById('loginUsername')?.focus();
  } catch (error) {
    setAuthError(error.message);
  }
});

forgotPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setAuthError('');

  try {
    const payload = await requestJson('/api/auth/forgot-password/check', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: document.getElementById('forgotEmployeeId').value,
      }),
    });
    pendingResetToken = payload.resetToken;
    forgotPasswordForm.reset();
    setAuthMode('reset');
    setAuthError('พบรหัสพนักงานแล้ว กรุณาตั้งรหัสผ่านใหม่', 'success');
    document.getElementById('resetPassword')?.focus();
  } catch (error) {
    pendingResetToken = '';
    setAuthError(error.message);
  }
});

resetPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setAuthError('');

  const password = document.getElementById('resetPassword').value;
  const confirmPassword = document.getElementById('resetPasswordConfirm').value;
  if (password !== confirmPassword) {
    setAuthError('รหัสผ่านใหม่ไม่ตรงกัน');
    return;
  }

  try {
    await requestJson('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        resetToken: pendingResetToken,
        password,
      }),
    });
    pendingResetToken = '';
    resetPasswordForm.reset();
    setAuthMode('login');
    setAuthError('ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว กรุณา Login อีกครั้ง', 'success');
    document.getElementById('loginUsername')?.focus();
  } catch (error) {
    setAuthError(error.message);
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await requestJson('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.warn(error.message);
  } finally {
    setAuthToken('');
    closeUserSettings();
    lockApp(true);
  }
});

createUserForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  userSettingsMessage.textContent = '';

  try {
    await requestJson('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        displayName: document.getElementById('newUserDisplayName').value,
        username: document.getElementById('newUsername').value,
        password: document.getElementById('newUserPassword').value,
        employeeId: document.getElementById('newUserEmployeeId').value,
        role: document.getElementById('newUserRole').value,
      }),
    });
    createUserForm.reset();
    userSettingsMessage.textContent = 'สร้างผู้ใช้เรียบร้อย';
    await loadUsers();
  } catch (error) {
    userSettingsMessage.textContent = error.message;
  }
});

openUserSettingsButton.addEventListener('click', openUserSettings);
closeUserSettingsButton.addEventListener('click', closeUserSettings);
userSettingsOverlay.addEventListener('click', (event) => {
  if (event.target === userSettingsOverlay) closeUserSettings();
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  let attachments = [...pendingAttachments];
  if ((!message && !attachments.length) || pending) return;
  const directEditIntent = looksLikeImageEditRequest(message) || looksLikeBroadImageEditRequest(message);
  const createMode = !attachments.length && shouldCreateImageFromText(message);
  const questionOnly = looksLikeImageQuestion(message) && !looksLikeExplicitImageCreateRequest(message);

  if (!attachments.length && directEditIntent && !createMode && !questionOnly) {
    attachments = getRememberedEditableAttachments();
  }

  const mode = inferImageEditMode(message, attachments);
  const editMode = mode !== 'chat';

  if (directEditIntent && !questionOnly && attachments.length && !hasEditableImage(attachments)) {
    window.alert('ไฟล์รูปสำหรับแก้จริงต้องเป็น JPG, PNG หรือ WebP');
    return;
  }

  if (directEditIntent && !questionOnly && !attachments.length && !createMode) {
    window.alert('ถ้าต้องการให้ AI แก้รูปจริง กรุณาแนบรูป JPG, PNG หรือ WebP ก่อน');
    return;
  }

  messageInput.value = '';
  clearAttachments();
  if (editMode) {
    await sendImageEdit(message, attachments, mode);
  } else if (createMode) {
    await sendImageCreate(message);
  } else {
    await sendMessage(message, attachments);
  }
});

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

messageInput.addEventListener('paste', async (event) => {
  const files = Array.from(event.clipboardData?.files || []);
  if (!files.length || pending) return;
  event.preventDefault();
  await addAttachments(files);
});

stopButton.addEventListener('click', () => {
  if (activeRequest) {
    activeRequest.abort();
  }
});

attachButton.addEventListener('click', () => {
  attachmentInput.click();
});

if (voiceButton) {
  voiceButton.addEventListener('click', toggleVoiceInput);
}

attachmentInput.addEventListener('change', async () => {
  await addAttachments(attachmentInput.files);
  attachmentInput.value = '';
});

['dragenter', 'dragover'].forEach((eventName) => {
  chatForm.addEventListener(eventName, (event) => {
    if (!event.dataTransfer?.types?.includes('Files') || pending) return;
    event.preventDefault();
    chatForm.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  chatForm.addEventListener(eventName, () => {
    chatForm.classList.remove('drag-over');
  });
});

chatForm.addEventListener('drop', async (event) => {
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length || pending) return;
  event.preventDefault();
  await addAttachments(files);
});

attachmentList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-attachment]');
  if (!button || pending) return;
  pendingAttachments = pendingAttachments.filter((file) => file.id !== button.dataset.removeAttachment);
  renderAttachmentList();
});

newChatButton.addEventListener('click', () => {
  const next = createConversation();
  conversations.unshift(next);
  activeConversationId = next.id;
  saveConversations();
  render();
  messageInput.focus();
});

clearHistoryButton.addEventListener('click', () => {
  if (!window.confirm('ล้างประวัติแชททั้งหมดในเครื่องนี้?')) return;
  conversations = [createConversation()];
  activeConversationId = conversations[0].id;
  saveConversations();
  render();
});

conversationList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-chat-id]');
  if (!button || pending) return;
  activeConversationId = button.dataset.chatId;
  render();
});

regenerateButton.addEventListener('click', regenerateLastAnswer);

exportButton.addEventListener('click', () => {
  const conversation = getActiveConversation();
  if (!conversation?.messages?.length) return;

  const text = conversation.messages
    .map((message) => `${message.role === 'user' ? 'User' : 'AI'}:\n${message.content}${message.image?.url ? `\nรูป: ${location.origin}${message.image.url}` : ''}`)
    .join('\n\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${conversation.title || 'conversation'}.txt`.replace(/[\\/:*?"<>|]/g, '-');
  link.click();
  URL.revokeObjectURL(url);
});

chatLog.addEventListener('click', async (event) => {
  const downloadButton = event.target.closest('[data-download-image]');
  if (downloadButton && !pending) {
    const conversation = getActiveConversation();
    const message = conversation.messages[Number(downloadButton.dataset.downloadImage)];
    if (!message?.image?.url) return;

    const originalContent = downloadButton.innerHTML;
    downloadButton.disabled = true;
    downloadButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังดาวน์โหลด';

    try {
      await downloadImageResult(message.image);
    } catch (error) {
      window.alert(error.message);
    } finally {
      downloadButton.disabled = false;
      downloadButton.innerHTML = originalContent;
    }
    return;
  }

  const editButton = event.target.closest('[data-edit-generated-image]');
  if (editButton && !pending) {
    const conversation = getActiveConversation();
    const message = conversation.messages[Number(editButton.dataset.editGeneratedImage)];
    if (!message?.image?.url) return;

    const originalContent = editButton.innerHTML;
    editButton.disabled = true;
    editButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังแนบ';

    try {
      const response = await fetch(message.image.url);
      if (!response.ok) throw new Error('โหลดรูปสำหรับแก้ต่อไม่สำเร็จ');

      const blob = await response.blob();
      if (blob.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`รูปนี้ใหญ่เกินไป แนบได้ไม่เกิน ${formatFileSize(MAX_ATTACHMENT_BYTES)}`);
      }

      const attachment = await blobToAttachment(blob, message.image.fileName || 'edited-image.png');
      const targetSize = normalizeTargetSize(message.image.targetSize);
      if (targetSize) attachment.targetSize = targetSize;
      pendingAttachments = [attachment];
      renderAttachmentList();
      if (!messageInput.value.trim()) messageInput.value = 'แก้ต่อ: ';
      messageInput.focus();
    } catch (error) {
      window.alert(error.message);
    } finally {
      editButton.disabled = false;
      editButton.innerHTML = originalContent;
    }
    return;
  }

  const readButton = event.target.closest('[data-read-message]');
  if (readButton) {
    const conversation = getActiveConversation();
    const message = conversation.messages[Number(readButton.dataset.readMessage)];
    if (message?.content) speakText(message.content, readButton);
    return;
  }

  const button = event.target.closest('[data-copy-message]');
  if (!button) return;

  const conversation = getActiveConversation();
  const message = conversation.messages[Number(button.dataset.copyMessage)];
  if (!message?.content) return;

  await navigator.clipboard.writeText(message.content);
  button.innerHTML = '<i class="fa-solid fa-check"></i> คัดลอกแล้ว';
  setTimeout(renderMessages, 900);
});

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    messageInput.value = button.dataset.prompt || '';
    messageInput.focus();
  });
});

if (aiProviderSelect) {
  aiProviderSelect.value = getStoredProvider();
  aiProviderSelect.addEventListener('change', () => {
    localStorage.setItem(getProviderStorageKey(), getSelectedProvider());
    loadStatus();
  });
}

bootstrapAuth();
