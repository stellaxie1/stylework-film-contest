(() => {
  const form = document.getElementById('entry-form');
  if (!form) return;
  const fields = document.getElementById('entry-fields');
  const input = document.getElementById('entry-video');
  const zone = document.getElementById('video-dropzone');
  const preview = document.getElementById('entry-preview');
  const selection = document.getElementById('selected-video');
  const fileName = document.getElementById('selected-video-name');
  const fileError = document.getElementById('video-error');
  const availability = document.getElementById('entry-availability');
  const button = document.getElementById('entry-submit');
  const result = document.getElementById('entry-result');
  const progressWrap = document.getElementById('entry-progress-wrap');
  const progress = document.getElementById('entry-progress');
  const progressLabel = document.getElementById('entry-progress-label');
  let config = {ready: false, maxVideoBytes: 500 * 1024 ** 2, maxImageBytes: 10 * 1024 ** 2};
  let blobURL;
  let busy = false;
  let entryId;
  let requestKey;
  let lastStatus;
  let previewMode = false;
  const mailRecipient = 'xiebingyao@linctex.com';
  const mailCc = 'baijie@linctex.com';
  const pendingKey = 'stylework-pending-submission';
  const remember = (key) => { try { if (key) sessionStorage.setItem(pendingKey, key); else sessionStorage.removeItem(pendingKey); } catch (_) {} };

  function showMessage(message, error = false) {
    result.hidden = false;
    result.className = `entry-result${error ? ' is-error' : ''}`;
    result.replaceChildren(document.createTextNode(message));
  }
  function showMailDraft(message, href, text) {
    result.hidden = false;
    result.className = 'entry-result';
    result.replaceChildren(document.createTextNode(message), document.createElement('br'));
    const link = document.createElement('a');
    link.href = href;
    link.textContent = '打开邮箱草稿 ↗';
    link.className = 'draft-action';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'draft-action';
    copy.textContent = '复制完整投稿邮件';
    const area = document.createElement('textarea');
    area.readOnly = true;
    area.rows = 10;
    area.value = text;
    area.setAttribute('aria-label', '投稿邮件内容');
    const notice = document.createElement('p');
    notice.setAttribute('role', 'status');
    notice.textContent = '微信等应用内无法打开邮箱时，复制下方内容，到自己的邮箱粘贴，并添加视频附件后发送。';
    copy.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard || !window.isSecureContext) throw new Error();
        await navigator.clipboard.writeText(text);
        notice.textContent = '已复制。请粘贴到邮箱，核对收件人和抄送，附上视频后发送。';
      } catch (_) {
        area.focus();
        area.select();
        area.setSelectionRange(0, area.value.length);
        notice.textContent = '请复制已选中的邮件内容；手机可长按文本选择复制，再到邮箱发送。';
      }
    });
    const actions = document.createElement('div');
    actions.className = 'draft-actions';
    actions.append(link, copy);
    result.append(actions, area, notice);
  }
  function updateButton() {
    button.disabled = busy || (!config.ready && !previewMode) || ['sent', 'review', 'sending', 'receiving'].includes(lastStatus);
    button.textContent = previewMode ? '生成投稿邮件 ↗' : busy ? '正在提交…' : lastStatus === 'failed' ? '重试发送' : lastStatus === 'sent' ? '已提交' : '上传并提交 ↗';
    fields.disabled = busy || ['sent', 'failed', 'review', 'sending', 'receiving'].includes(lastStatus);
  }
  function clearVideo() {
    if (blobURL) URL.revokeObjectURL(blobURL);
    blobURL = null;
    preview.pause();
    preview.removeAttribute('src');
    preview.load();
    selection.hidden = true;
  }
  function selectVideo() {
    clearVideo();
    fileError.textContent = '';
    const file = input.files[0];
    if (!file) return;
    if (!/\.(mp4|mov|webm)$/i.test(file.name) || file.size === 0 || file.size > config.maxVideoBytes) {
      input.value = '';
      fileError.textContent = '请选择非空的 MP4 / MOV / WebM 视频，大小不超过 500 MB。';
      return;
    }
    blobURL = URL.createObjectURL(file);
    preview.src = blobURL;
    fileName.textContent = `${file.name} · ${(file.size / 1024 ** 2).toFixed(1)} MB`;
    selection.hidden = false;
  }
  input.addEventListener('change', selectVideo);
  document.getElementById('remove-video').addEventListener('click', () => {
    input.value = '';
    clearVideo();
    fileError.textContent = '';
    input.focus();
  });
  for (const event of ['dragenter', 'dragover']) zone.addEventListener(event, e => {
    e.preventDefault();
    if (!fields.disabled) zone.classList.add('is-dragover');
  });
  for (const event of ['dragleave', 'drop']) zone.addEventListener(event, () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    if (fields.disabled) return;
    if (e.dataTransfer.files.length !== 1) {
      fileError.textContent = '每次请上传 1 个参赛视频。';
      return;
    }
    input.files = e.dataTransfer.files;
    selectVideo();
  });

  function applyResult(data) {
    entryId = data.id;
    lastStatus = data.status;
    const accepted = data.accepted && data.accepted.length ? `\n邮件服务已接收：${data.accepted.join('、')}` : '';
    showMessage(`${data.message}\n投稿编号：${data.id}${accepted}`, ['failed', 'review', 'rejected'].includes(data.status));
    if (data.status === 'sent') {
      result.classList.add('is-success');
      remember(null);
      preview.pause();
      document.getElementById('entry-another').hidden = false;
    }
    if (data.status === 'rejected') {
      entryId = null;
      requestKey = null;
      lastStatus = null;
      remember(null);
    }
    updateButton();
  }

  async function recover() {
    if (!requestKey) return false;
    try {
      const response = await fetch(`/api/submissions/by-request/${encodeURIComponent(requestKey)}`, {cache: 'no-store'});
      if (response.status === 404) return false;
      if (!response.ok) throw new Error();
      applyResult(await response.json());
      if (['sending', 'receiving'].includes(lastStatus)) {
        setTimeout(recover, 5000);
      }
      return true;
    } catch (_) {
      lastStatus = 'review';
      updateButton();
      showMessage('连接中断，暂时无法确认发送结果。请刷新页面查询本次投稿状态，避免重复发送。', true);
      return true;
    }
  }

  function upload(data) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/submissions');
      xhr.setRequestHeader('X-CSRF-Token', config.csrf);
      xhr.setRequestHeader('Idempotency-Key', requestKey);
      xhr.timeout = 20 * 60 * 1000;
      xhr.upload.onprogress = e => {
        if (!e.lengthComputable) return;
        const value = Math.round(e.loaded / e.total * 100);
        progress.value = value;
        progressLabel.textContent = value < 100 ? `正在上传 ${value}%` : '上传完成，正在发送至两个活动邮箱…';
      };
      xhr.onload = () => {
        let payload;
        try { payload = JSON.parse(xhr.responseText); } catch (_) { reject(new Error('服务器返回异常，正在核对本次投稿状态。')); return; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
        else reject(Object.assign(new Error(payload.message || '提交失败，请稍后重试。'), {status: xhr.status}));
      };
      xhr.onerror = xhr.ontimeout = () => reject(new Error('网络连接中断，正在核对本次投稿状态。'));
      xhr.send(data);
    });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy || (!config.ready && !previewMode) || ['sent', 'review', 'sending', 'receiving'].includes(lastStatus)) return;
    const retry = lastStatus === 'failed' && entryId;
    if (!retry && !form.reportValidity()) return;
    if (!retry) {
      const cover = form.elements.cover.files;
      const screenshots = form.elements.process.files;
      if (cover.length > 1 || screenshots.length > 3 || [...cover, ...screenshots].some(f => !/\.(jpe?g|png|webp)$/i.test(f.name) || !f.size || f.size > config.maxImageBytes)) {
        showMessage('请上传最多 1 张封面和 3 张过程截图；每张图片不超过 10 MB，格式为 JPG / PNG / WebP。', true);
        return;
      }
    }
    if (previewMode) {
      const values = new FormData(form);
      const video = input.files[0];
      const subject = `[StyleWork品牌时尚大片比赛] ${values.get('brand')}｜${values.get('title')}`;
      const body = [
        'StyleWork 品牌时尚大片比赛 · 参赛作品',
        '',
        `品牌 / 企业：${values.get('brand')}`,
        `作品名称：${values.get('title')}`,
        `联系人：${values.get('contact')}`,
        `联系邮箱：${values.get('email')}`,
        `创作方向：${values.get('track')}`,
        `创作说明：${values.get('description')}`,
        '',
        `视频文件：${video ? video.name : '将在邮箱中添加视频附件'}`,
        `封面：${form.elements.cover.files.length} 张`,
        `StyleWork 创作过程：${form.elements.process.files.length} 张`,
        '',
        '请在发送前将视频、封面和过程截图添加为邮件附件。',
        '参赛者已确认出图使用 StyleWork。',
      ].join('\n');
      const href = `mailto:${mailRecipient}?cc=${encodeURIComponent(mailCc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const fullText = `收件人：${mailRecipient}\n抄送：${mailCc}\n主题：${subject}\n\n${body}`;
      showMailDraft(`邮件内容已生成，尚未发送。\n收件人：${mailRecipient}\n抄送：${mailCc}\n请在自己的邮箱中附上视频和图片后发送。`, href, fullText);
      document.getElementById('entry-another').hidden = false;
      document.getElementById('entry-another').textContent = '重新填写 →';
      result.scrollIntoView({block: 'nearest', behavior: 'smooth'});
      return;
    }
    // Construct before disabling fields; disabled fields are omitted by FormData.
    const data = retry ? null : new FormData(form);
    busy = true;
    result.hidden = true;
    progressWrap.hidden = false;
    progress.value = 0;
    progressLabel.textContent = retry ? '正在重试未发送成功的邮箱…' : '准备上传…';
    if (!requestKey) requestKey = crypto.randomUUID();
    remember(requestKey);
    updateButton();
    try {
      let response;
      if (retry) {
        const r = await fetch(`/api/submissions/${encodeURIComponent(entryId)}/retry`, {method: 'POST', headers: {'X-CSRF-Token': config.csrf}});
        response = await r.json();
        if (!r.ok) throw Object.assign(new Error(response.message), {status: r.status});
      } else response = await upload(data);
      applyResult(response);
    } catch (error) {
      showMessage(error.message, true);
      if (!retry && error.status && error.status < 500) {
        requestKey = null;
        remember(null);
      } else if (!await recover()) {
        showMessage(`${error.message}\n未查到已保存的投稿，可重新提交。`, true);
      }
    } finally {
      busy = false;
      progressWrap.hidden = true;
      updateButton();
    }
  });

  document.getElementById('entry-another').addEventListener('click', () => {
    form.reset();
    clearVideo();
    fileError.textContent = '';
    entryId = null;
    requestKey = null;
    lastStatus = null;
    remember(null);
    result.hidden = true;
    document.getElementById('entry-another').hidden = true;
    updateButton();
    input.focus();
  });

  function enableMailMode() {
      previewMode = true;
      availability.textContent = `邮件投稿模式：填写信息后生成发给 ${mailRecipient}、抄送 ${mailCc} 的邮件草稿，视频需在邮箱中手动添加。`;
      document.querySelector('#submit .section-intro > p').textContent = '填写作品信息，生成邮件草稿，附上视频后发送给活动组。';
      document.querySelector('.entry-notes-list li:last-child').textContent = '生成邮件草稿，在邮箱中附上视频后发送。';
      document.querySelector('.entry-delivery-note').textContent = '网页不会上传视频。邮件草稿会自动填入作品信息，请在邮箱中添加视频、封面和过程截图。';
      document.querySelector('.entry-confirm span').textContent = '我确认出图使用 StyleWork，并同意将本次作品和参赛信息发送到活动邮箱。';
      document.querySelector('.entry-form-actions p').textContent = '无法唤起邮箱时，可复制邮件内容到常用邮箱发送。';
      updateButton();
  }

  async function initialize() {
    if (document.documentElement.dataset.submission === 'email' || location.protocol === 'file:' || document.documentElement.dataset.preview === 'offline') {
      enableMailMode();
      return;
    }
    try {
      const response = await fetch('/api/status', {cache: 'no-store'});
      if (!response.ok) throw new Error();
      config = await response.json();
      availability.textContent = config.message;
      availability.classList.toggle('is-ready', config.ready);
      try { requestKey = sessionStorage.getItem(pendingKey); } catch (_) {}
      if (requestKey && !await recover()) { requestKey = null; remember(null); }
      updateButton();
    } catch (_) {
      // A static host has no API. Fall back to the no-server email-draft flow.
      enableMailMode();
    }
  }
  initialize();
})();
