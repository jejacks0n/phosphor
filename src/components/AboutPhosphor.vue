<script>
import { version } from '../../package.json';

export default {
  name: 'AboutPhosphor',
  emits: ['close'],
  data() {
    return {
      version,
    };
  },
};
</script>

<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <article class="about-phosphor">
      <button class="close" @click="$emit('close')" title="Close">×</button>
      <div class="content-container">
        <header>
          <div class="logo"></div>
          <p class="tagline">Convert images to ANSI and ASCII ... with style?</p>
          <p class="version accent">v{{ version }}</p>
        </header>

        <hr/>

        <p>
          Phosphor began in 2019 as a small experiment to build tooling for a concept I called "ANSI Nouveau." At the time, I was obsessed with the idea of recreating the mid-90s BBS experience I grew up with, but through a modern, high-fidelity lens. Like many passion projects, it eventually got sidetracked and shelved.
        </p>

        <p>
          Years later, I came across a fantastic <a href="https://github.com/christiansacks/moebius" target="blank">fork of the Moebius ANSI editor</a> that introduced full-color/256 color support. It reminded me of this project, so I dragged it out of storage, dusted off the code -- and leveraging modern tools and techniques, brought it back to life.
        </p>

        <p>
          Today, Phosphor is a modern utility designed to bridge the gap between digital imagery and terminal art. It focuses on converting images to ANSI and ASCII with a heavy emphasis on style and granular customization. Whether you're a retro-computing enthusiast, an ASCII artist, or just looking for a unique way to process images for your terminal pipeline, I hope you find Phosphor a useful addition to your workflow.
        </p>

        <p>
          Importantly, Phosphor isn’t trying (yet?) to be a full-blown editor. Instead, it’s designed to get you from concept to canvas, where you can iterate on your own vision. It handles the heavy lifting of the initial concepts so you can explore quickly and move into a full editor to finalize your vision -- whether that’s "Pure ANSI" for the purists or the full-color, UTF-8 "ANSI Nouveau" style that inspired the project in the first place.
        </p>

        <p>
          This is an early alpha project, expect bugs, lack of support for mobile and tablet, etc. I’m open to feedback and bug reports, so feel free to open an issue on <a href="https://github.com/jejacks0n/phosphor" target="blank">GitHub</a>, leave a comment, or fork the repo and take it in your own direction.
        </p>

        <p>Credits and special thanks:</p>
        <ul>
          <li><a href="https://ertdfgcvb.xyz" target="_blank">ertdfgcvb</a> (Andreas Gysin) for the inspiration for Phosphor with the (awesome) <a href="https://play.ertdfgcvb.xyz" target="_blank">play.core</a> library</li>
          <li>Blocktronics and MeaTLoTioN for your work on Moebius</li>
          <li>lordscarlet (Doug Moore) for creating <a href="https://16colo.rs" target="_blank">https://16colo.rs</a></li>
          <li>And the many authors, maintainers, and ANSI artists who have inspired me over the years -- too many to name</li>
        </ul>
        <p>Thank you for the inspiration and for helping to create such a vibrant community around this unique art form.</p>

        <hr/>

        <div class="footer">
          <p>&copy; 2026 Phosphor Project</p>
          <p class="accent">Make Code Not War</p>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
div.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

article.about-phosphor {
  position: relative;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  line-height: 1.6;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
}

div.content-container {
  height: 100%;
  overflow: auto;
  padding: 40px;
}

header {
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

p.version {
  margin-top: 0;
  margin-bottom: 0;
}

p.accent {
  color: var(--accent);
}

hr {
  margin: 40px 0;
}
div.footer {
  color: var(--text-faint);
  font-size: 0.9rem;
  text-align: center;
}
</style>
