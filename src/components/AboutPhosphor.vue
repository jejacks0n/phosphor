<script>
export default {
  name: 'AboutPhosphor',
};
</script>

<template>
  <article class="about-phosphor">
    <div class="content-container">
      <header>
        <div class="logo"></div>
        <p class="tagline">Convert images to ANSI and ASCII art with style.</p>
      </header>

      <hr/>

      <p>
        Phosphor began in 2019 as a small experiment to build tooling for a concept I called "ANSI Nouveau." At the time, I was obsessed with the idea of recreating the mid-90s BBS experience I grew up with, but through a modern, high-fidelity lens. Like many passion projects, it eventually got sidetracked and shelved.
      </p>

      <p>
        Years later, I came across a fantastic <a href="https://github.com/christiansacks/moebius" target="blank">fork of the Moebius ANSI editor</a> that introduced full-color/256 color support. It reminded me of this project, so I dragged it out of storage, dusted off the code -- and leveraging modern tools and techniques, brought it back to life.
      </p>

      <p>
        Today, Phosphor is a modern utility designed to bridge the gap between digital imagery and terminal art. It focuses on converting images to ANSI and ASCII with a heavy emphasis on style and granular customization. Whether you are a retro-computing enthusiast, an ASCII artist, or just looking for a unique way to process images for your terminal pipeline, I hope Phosphor finds a home in your workflow.
      </p>

      <p>
        Importantly, Phosphor isn’t trying to be a full-blown editor. Instead, it’s designed to get you from concept to canvas, where you can iterate on your own vision. It handles the heavy lifting of the initial concepts so you can move into an editor to finalize your vision -- whether that’s "Pure ANSI" for the purists or the full-color, UTF-8 "ANSI Nouveau" style that inspired the project in the first place.
      </p>

      <p>
        This is an early alpha, and I’m open to feedback. Please feel free to open an issue on <a href="https://github.com/jejacks0n/phosphor" target="blank">GitHub</a>, leave a comment, or fork the repo and take it in your own direction.
      </p>

      <p>Credits and special thanks:</p>
      <ul>
        <li><a href="https://ertdfgcvb.xyz" target="_blank">ertdfgcvb</a> (Andreas Gysin) for the inspiration for Phosphor with the (awesome) <a href="https://play.ertdfgcvb.xyz" target="_blank">play.core</a> library</li>
        <li>Blocktronics and MeaTLoTioN for your work on Moebius</li>
        <li>lordscarlet (Doug Moore) for creating <a href="https://16colo.rs" target="_blank">https://16colo.rs</a></li>
        <li>And the many authors, maintainers, and ANSI artists who have inspired me over the years -- too many to name</li>
      </ul>
      <p>Thank you for the inspiration and for creating such a vibrant community around this unique art form.</p>

      <hr/>

      <div>
        <p>&copy; 2026 Phosphor Project</p>
        <p class="accent">Make Code Not War</p>
      </div>
    </div>
  </article>
</template>

<style scoped>
article.about-phosphor {
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  align-items: center;
  background: var(--surface-0);
}

div.content-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 700px;
  margin: auto;
  padding: 40px;
  box-sizing: border-box;
}

header {
  padding-bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

div.logo {
  width: 100%;
  background-image: var(--logo);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  margin-bottom: 20px;
  padding-bottom: 50%;
}

p.tagline {
  font-size: 1.2rem;
  color: var(--text-muted);
  margin: 8px 0 0;
}

p {
  margin-bottom: 16px;
}

p, li {
  font-family: 'IBM VGA 8x16', 'Simple Console', monospace;
  font-size: 18px;
  color: var(--text-dim);
}

a {
  color: var(--accent);
  text-decoration: underline;
}

p.accent {
  color: var(--accent);
}

footer {
  margin-top: 60px;
  padding-top: 20px;
  color: var(--text-faint);
  font-size: 0.9rem;
  text-align: center;
}
</style>
