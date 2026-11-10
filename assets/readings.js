/* 朗読動画ページ：YouTube の埋め込みは再生ボタンを押したときに初めて読み込む。
   data-youtube / data-playlist には ID か URL のどちらを入れてもよい。空欄なら「公開準備中」。 */
(function () {
  function videoId(v) {
    v = (v || '').trim();
    if (!v) return '';
    var m = v.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(v) ? v : '';
  }
  function playlistId(v) {
    v = (v || '').trim();
    if (!v) return '';
    var m = v.match(/[?&]list=([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{10,}$/.test(v) ? v : '';
  }

  document.querySelectorAll('.film').forEach(function (film) {
    var id = videoId(film.getAttribute('data-youtube'));
    var btn = film.querySelector('.abspielen');
    var article = film.closest('.lesung');
    if (!id) {
      film.classList.add('wartet');
      if (btn) btn.disabled = true;
      return;
    }
    var link = article && article.querySelector('.yt-link');
    if (link) { link.href = 'https://www.youtube.com/watch?v=' + id; link.hidden = false; }
    function play() {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
      f.title = film.getAttribute('data-titel') || '朗読動画';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      film.replaceChildren(f);
      film.classList.add('laeuft');
    }
    if (btn) btn.addEventListener('click', play);
    var img = film.querySelector('img');
    if (img) img.addEventListener('click', play);
  });

  document.querySelectorAll('[data-playlist]').forEach(function (p) {
    var pid = playlistId(p.getAttribute('data-playlist'));
    var a = p.querySelector('.playlist-link');
    var w = p.querySelector('.playlist-wartet');
    if (pid && a) {
      a.href = 'https://www.youtube.com/playlist?list=' + pid;
      a.hidden = false;
      if (w) w.hidden = true;
    }
  });
})();
