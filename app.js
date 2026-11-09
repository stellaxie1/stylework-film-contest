(() => {
  const videos = [...document.querySelectorAll('.hero-video')];
  const current = document.getElementById('slide-current');
  const label = document.getElementById('film-number');
  const progress = document.getElementById('slide-progress');
  const toggle = document.getElementById('toggle-film');
  const sound = document.getElementById('toggle-sound');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let playing = !reducedMotion.matches;
  let soundOn = false;

  function updateToggle() {
    toggle.textContent = playing ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', playing ? '暂停视频' : '播放视频');
    toggle.title = playing ? '暂停视频' : '播放视频';
  }

  async function playActive() {
    try {
      await videos[index].play();
      playing = true;
    } catch (_) {
      playing = false;
    }
    updateToggle();
  }

  function show(next) {
    const previous = videos[index];
    previous.pause();
    previous.classList.remove('is-active');
    previous.setAttribute('aria-hidden', 'true');
    index = (next + videos.length) % videos.length;
    const active = videos[index];
    active.muted = !soundOn;
    active.currentTime = 0;
    active.classList.add('is-active');
    active.removeAttribute('aria-hidden');
    current.textContent = label.textContent = String(index + 1).padStart(2, '0');
    progress.style.width = '0%';
    if (playing) playActive();
  }

  videos.forEach((video, videoIndex) => {
    video.addEventListener('ended', () => { if (videoIndex === index && playing) show(index + 1); });
    video.addEventListener('timeupdate', () => {
      if (videoIndex === index && Number.isFinite(video.duration) && video.duration > 0) {
        progress.style.width = `${Math.min(100, video.currentTime / video.duration * 100)}%`;
      }
    });
  });
  document.getElementById('prev-film').addEventListener('click', () => show(index - 1));
  document.getElementById('next-film').addEventListener('click', () => show(index + 1));
  toggle.addEventListener('click', () => {
    if (playing) {
      videos[index].pause();
      playing = false;
      updateToggle();
    } else playActive();
  });
  sound.addEventListener('click', () => {
    soundOn = !soundOn;
    videos[index].muted = !soundOn;
    sound.setAttribute('aria-pressed', String(soundOn));
    sound.setAttribute('aria-label', soundOn ? '关闭声音' : '开启声音');
    sound.title = soundOn ? '关闭声音' : '开启声音';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos[index].pause();
    else if (playing) playActive();
  });
  updateToggle();
  if (playing) playActive();
})();
