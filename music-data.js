const losoCatalog = [
  { title: "Table For 2", album: "Fuck Ups & Heartbreaks", duration: "03:06", cover: "table-for-2", description: "A lonely table, a relationship that still feels present, and everything left unsaid.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "Fate", album: "Fuck Ups & Heartbreaks", duration: "05:53", cover: "fate", description: "A reflective cut about choices, consequences, and the things we cannot rewind.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "Forever Love Her (Remix)", album: "Fuck Ups & Heartbreaks", duration: "03:55", cover: "forever-love-her", description: "Love that refuses to disappear, even after everything changes.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "Playin", album: "Fuck Ups & Heartbreaks", duration: "04:47", cover: "playin", description: "The moment attraction, doubt, and mixed signals stop being a game.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "If Love Was Enough", album: "Fuck Ups & Heartbreaks", duration: "05:18", cover: "if-love-was-enough", description: "A relationship measured against the painful question of whether love alone can save it.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "Right Love Wrong Time", album: "Fuck Ups & Heartbreaks", duration: "04:22", cover: "right-love-wrong-time", description: "The right connection arriving when life has already made the timing wrong.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "Even Broken, Even Bruised", album: "Fuck Ups & Heartbreaks", duration: "04:15", cover: "even-broken-even-bruised", description: "Keeping your heart moving after it has already taken the hits.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "Paralyzed", album: "Fuck Ups & Heartbreaks", duration: "04:27", cover: "paralyzed", description: "Caught between wanting to move on and being unable to let go.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "Heart On My Shirt", album: "Fuck Ups & Heartbreaks", duration: "04:51", cover: "heart-on-my-shirt", description: "Wearing the truth openly when hiding it would be easier.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "On My Own", album: "Fuck Ups & Heartbreaks", duration: "03:20", cover: "on-my-own", description: "Learning what independence sounds like after the person you expected to have beside you is gone.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "Make Love Not War", album: "Fuck Ups & Heartbreaks", duration: "05:09", cover: "make-love-not-war", description: "Choosing connection over destruction when both are already standing in the room.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" },
  { title: "Fuck Ups & Heartbreaks", album: "Fuck Ups & Heartbreaks", duration: "05:47", cover: "fuck-ups-heartbreaks", description: "The title track and the thesis: mistakes, heartbreak, consequences, and surviving the aftermath.", loudman: "https://loudman.live/artist/3loso3", amazon: "https://music.amazon.com/albums/B0GVB6CHRV" }
];

function renderLosoCatalog() {
  const grid = document.querySelector("#musicCatalog");
  if (!grid) return;

  const leftAt = ["2:47 AM", "3:12 AM", "1:58 AM", "4:03 AM", "2:22 AM", "3:37 AM", "12:49 AM", "2:05 AM", "3:51 AM", "1:33 AM", "4:17 AM", "2:59 AM"];

  grid.innerHTML = losoCatalog.map((track, index) => `
    <article class="catalog-card${index === 0 ? " catalog-card-featured" : ""}">
      <div class="catalog-cover cv-${(index % 6) + 1}" aria-label="Cassette art for ${track.title}">
        ${index === 0 ? `<span class="msg-tag"><i></i>NEW MESSAGE</span>` : ""}
        <div class="cover-label">
          <div class="cover-top">
            <span>Side A</span>
            <span class="cover-time">☎ ${leftAt[index % leftAt.length]}</span>
          </div>
          <span class="cover-title">${track.title}</span>
          <div class="cover-window"><span class="spool"></span><span class="cassette-band"></span><span class="spool"></span></div>
          <div class="cover-bottom">
            <span>Msg ${String(index + 1).padStart(2, "0")} / 12</span>
            <span class="cover-brand">Loso Jones</span>
          </div>
        </div>
      </div>
      <div class="catalog-info">
        <p class="catalog-meta">${track.album} · ${track.duration}</p>
        <h3>${track.title}</h3>
        <p>${track.description}</p>
        <div class="catalog-actions">
          <a href="${track.loudman}" target="_blank" rel="noopener">Loudman ↗</a>
          <a href="${track.amazon}" target="_blank" rel="noopener">Amazon Music ↗</a>
        </div>
      </div>
    </article>
  `).join("");
}

renderLosoCatalog();
