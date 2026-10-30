<script setup>
import ReadingDialog from '@/components/ReadingDialog.vue';

// The Terms and the Privacy Policy, read over the app like About. `page` is 'terms' or 'privacy'; the Terms' link
// to the policy asks for it with open.
const props = defineProps({ page: { type: String, required: true } });
const emit = defineEmits(['close', 'open']);
</script>

<template>
  <ReadingDialog :key="props.page" :label="props.page === 'terms' ? 'Terms' : 'Privacy Policy'" @close="emit('close')">
    <div v-if="props.page === 'terms'">
      <h1>Terms</h1>
      <p class="updated">Last updated: October 29, 2026.</p>

      <p>These terms are an agreement between you and TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203
        ("we", "us"). They cover Phosphor at phosphor.work: the editor, and its SOCIAL tab (the lobby,
        rooms, chat and accounts). By creating an account, or by using SOCIAL as a guest, you accept them and
        our <button class="link inline" @click="emit('open', 'privacy')">Privacy Policy</button>.</p>

      <h2>1. Who can use SOCIAL</h2>
      <p>You must be 13 or older. If you're under the age of majority where you live, a parent or guardian
        must agree to these terms for you. One account per person, and it's yours alone.</p>

      <h2>2. Phosphor is free</h2>
      <p>Phosphor costs nothing. Because it's free, we don't promise it will always be available, and we may
        change or stop SOCIAL, or any part of it, at any time. The editor's source code is open under the MIT
        License, which governs the code; these terms govern the service we run.</p>

      <h2>3. Your account</h2>
      <ul>
        <li>Keep your password, two-factor codes and backup codes safe. You're responsible for what's done
          with your account. If you think someone else has used it, change your password and tell us.</li>
        <li>Your username mustn't impersonate anyone, mislead people about who you are, or be offensive. We
          may change or reclaim a username that is.</li>
        <li>If you sign in with Discord or GitHub, their own terms also apply to your use of them.</li>
      </ul>

      <h2>4. Your art</h2>
      <p>What you make in Phosphor is yours. The editor keeps it in your browser, and we never receive it
        unless you host a room.</p>
      <p>When you host a public room, you let us show a small picture of your art in the lobby while the room
        is live, and you let the people you admit watch you draw. When someone reports your room, you let us
        keep a picture of it to decide on the report. That's all we do with it, and we don't sell it or use it
        to advertise.</p>
      <p>Only share art you have the right to share. Watching a room doesn't give you any right to copy the
        host's art and pass it off as your own.</p>

      <h2>5. How to behave</h2>
      <p>Don't use Phosphor to:</p>
      <ul>
        <li>harass, threaten, bully or demean anyone, or attack people for who they are;</li>
        <li>share sexual content in a public room, or anything sexual involving a minor, ever (we report
          that to the authorities);</li>
        <li>share gore, or content that's illegal where you or we are;</li>
        <li>use someone's IP address, which rooms reveal, to find, threaten or attack them or their
          connection, or share anyone's personal information without their permission;</li>
        <li>spam, scam, or post links to malware;</li>
        <li>impersonate anyone, or infringe their copyright or other rights;</li>
        <li>get around a block, a removal, a mute, a silence or a suspension, or make extra accounts to do so;</li>
        <li>make false or bad-faith reports;</li>
        <li>probe, attack, overload, scrape or automate Phosphor or its server, except through security
          research done in good faith and reported to us privately.</li>
      </ul>

      <h2>6. Blocks and reports</h2>
      <p>Hosts can remove or block people from their rooms, and anyone signed in can report a person or a
        room.</p>
      <p>We may remove content, silence, suspend or close an account, or end a room, if we believe it broke
        these terms or the law. Where we can, we'll tell you why. To ask us to look again, write to <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>

      <h2>7. Browser to browser</h2>
      <p>Rooms connect your browser directly to the host's. Everyone you share a room with can see your IP
        address, and the host's browser passes on the room's chat. Only join rooms, and admit people, you're
        comfortable with. Use a VPN if you want to hide your address.</p>

      <h2>8. Copyright</h2>
      <p>If you believe something on Phosphor infringes your copyright, write to <a href="mailto:hello@phosphor.work">hello@phosphor.work</a> with what
        it is and where, your contact details, and a statement that you own the rights or act for the owner.
        We close the accounts of people who repeatedly infringe.</p>

      <h2>9. Ending</h2>
      <p>You can stop at any time, and delete your account from the Account page. We may suspend or close an
        account that breaks these terms, or end SOCIAL for everyone.</p>

      <h2>10. No warranties</h2>
      <p>To the extent the law allows, Phosphor is provided "as is" and "as available", without warranties of
        any kind, including merchantability, fitness for a particular purpose and non-infringement. We don't
        promise it will be uninterrupted, secure or free of errors, or that what other people do on it is
        safe.</p>

      <h2>11. Limits on liability</h2>
      <p>To the extent the law allows, we're not liable for indirect, incidental, special, consequential or
        punitive damages, or for lost data, art or profits. Our total liability for any claim about Phosphor
        is limited to US$50. Nothing here limits liability that the law doesn't allow to be limited, or your
        rights as a consumer that a contract can't take away.</p>

      <h2>12. Changes to these terms</h2>
      <p>The date at the top shows when these terms last changed. For a change that matters, we'll email
        account holders before it takes effect. Using SOCIAL after that means you accept the change; if you
        don't, delete your account.</p>

      <h2>13. Law</h2>
      <p>These terms are governed by the laws of the State of Colorado, USA, and disputes go to its courts, except
        where the law where you live gives you the right to bring them there.</p>

      <h2>Contact</h2>
      <p>TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203. Questions about these terms: <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>
    </div>
    <div v-else>
      <h1>Privacy Policy</h1>
      <p class="updated">Last updated: October 29, 2026.</p>

      <p>Phosphor is an ANSI art editor that runs in your browser, at phosphor.work. Its SOCIAL tab is
        optional: a lobby, rooms where you can watch someone draw, chat, and accounts. This policy says what
        each part collects, why, who else sees it, and how long it's kept. We apply the GDPR's standards to
        everyone, wherever they live.</p>

      <h2>Who we are</h2>
      <p>Phosphor is run by TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203. Write to us about
        privacy at <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>

      <h2>The editor keeps your art in your browser</h2>
      <p>Images you open, art you draw, your palettes, your fonts and your settings stay in your browser
        (its local storage and IndexedDB). We never receive them, unless you host a room (below). Clearing
        this site's data in your browser removes them.</p>
      <p>We use no analytics, no advertising and no tracking cookies. The app itself is hosted by GitHub
        Pages, which, like any web host, sees your IP address when your browser loads it.</p>

      <h2>The SOCIAL tab</h2>
      <p>Nothing from SOCIAL runs until you open its tab (or follow a link from one of our emails). From
        then on:</p>
      <ul>
        <li><strong>Your browser's key.</strong> Your browser makes a signing key and keeps it. Only its
          public half is sent to us, inside the short-lived pass that lets you into the lobby and rooms. It
          proves your messages come from you.</li>
        <li><strong>Guests</strong> have no account. You get a random nickname for the visit, and others see
          it while you're in the lobby or a room.</li>
        <li><strong>Accounts.</strong> When you create one, we keep your email address, your username, your
          password (as a one-way hash, never the password itself), when you agreed to these policies, whether
          you've confirmed your email, when you last changed your username, and the last day you used SOCIAL
          signed in.</li>
        <li><strong>Discord and GitHub.</strong> If you sign in with them, they share your account ID, name,
          email and profile picture with us, and give us access tokens, which we keep with your account and
          use only to sign you in. Each does this as an independent company under its own privacy
          policy.</li>
        <li><strong>Two-factor.</strong> If you turn it on, we keep its secret and your backup codes,
          encrypted. "Trust this computer" leaves a cookie in your browser for 30 days.</li>
        <li><strong>Sessions.</strong> Each time you sign in, we record the IP address and browser it came
          from, until that session ends (when you sign out, or after 7 days).</li>
        <li><strong>Blocks.</strong> You can block people. Your list is kept until you unblock them or delete
          your account.</li>
        <li><strong>Cookies.</strong> We set only the cookies that keep you signed in and protect sign-in
          (the session, a two-factor step in progress, and a trusted computer). None of them track you.</li>
      </ul>

      <h2>What others see</h2>
      <ul>
        <li><strong>In the lobby,</strong> everyone there sees your username or nickname, whether you're a
          guest, and the signal you choose. A public room's title, its watcher count, and a small picture of
          the host's art are listed for everyone. Private rooms aren't listed.</li>
        <li><strong>In a room, your browser connects directly to the host's browser.</strong> Each of you
          can see the other's IP address, which can show your rough location and your internet provider. If
          you'd rather hide yours, use a VPN. Everyone in a room sees the host's art as it's drawn.</li>
        <li><strong>Chat goes from browser to browser through the host.</strong> It never passes through our
          servers, and we don't store it. Whoever's in the room sees it, and any of them could copy it.</li>
      </ul>

      <h2>Reports</h2>
      <p>You can report a person or a room. A report is kept for 90 days after it's decided. If a
        moderator has had to take action on your account, we may keep information about it with your account
        for longer.</p>

      <h2>Keeping SOCIAL safe</h2>
      <ul>
        <li><strong>Rate limits.</strong> To stop password guessing and spam, we count requests by IP address
          and by the email or username typed in, for about a minute.</li>
        <li><strong>Cloudflare Turnstile</strong> checks that a person is creating an account or asking for a
          password reset.</li>
        <li><strong>Breached passwords.</strong> When you choose a password, we send the first five
          characters of its SHA-1 hash, never the password, to Have I Been Pwned, and refuse a password that
          has appeared in a breach.</li>
      </ul>

      <h2>Email</h2>
      <p>We email you only to confirm your address and to reset your password, through Mailjet. No
        newsletters and no marketing.</p>

      <h2>Why we use it (GDPR Article 6)</h2>
      <ul>
        <li><strong>To provide SOCIAL</strong> (Art. 6(1)(b)): your account, signing in, the lobby and
          rooms.</li>
        <li><strong>Legitimate interests</strong> (Art. 6(1)(f)): keeping SOCIAL secure, stopping abuse, and
          deciding on reports.</li>
        <li><strong>Legal obligations</strong> (Art. 6(1)(c)): when the law requires us to keep or hand over
          something.</li>
      </ul>

      <h2>Who else handles it</h2>
      <p>We don't sell or share personal data, and we don't show ads. These services handle it for us, each
        only to run Phosphor:</p>
      <ul>
        <li><strong>Cloudflare:</strong> the SOCIAL server, its database and storage, rate limits and
          Turnstile.</li>
        <li><strong>GitHub Pages:</strong> hosting the app.</li>
        <li><strong>Mailjet:</strong> sending our emails.</li>
        <li><strong>Have I Been Pwned:</strong> the breached-password check (a five-character hash prefix
          only).</li>
      </ul>
      <p>Some of them process data outside your country. Where data leaves the EU or the UK, we rely on
        their data processing terms and the European Commission's standard contractual clauses.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li><strong>Your account,</strong> until you delete it. Deleting it from the Account page removes it
          straight away, with your sessions, linked Discord and GitHub accounts, two-factor and blocks.</li>
        <li><strong>Sessions:</strong> until they end, at most 7 days.</li>
        <li><strong>Rate-limit counts:</strong> about a minute.</li>
        <li><strong>Reports:</strong> 90 days after they're decided. If a moderator has had to take action on
          your account, some information about it is kept with your account for longer.</li>
        <li><strong>The lobby and rooms</strong> keep nothing after a room ends or you leave.</li>
      </ul>

      <h2>Your rights</h2>
      <p>Wherever you live, you can ask for a copy of your data, to correct it, to delete it, to restrict or
        object to how we use it, or to have it in a portable format. Change your username, or delete your
        account, from the Account page. For anything else, write to <a href="mailto:hello@phosphor.work">hello@phosphor.work</a> from your account's
        email address. We answer within 30 days, free. You can also complain to your data protection
        authority.</p>

      <h2>Children</h2>
      <p>SOCIAL is for people 13 and older. If you believe a child under 13 has an account, write to us and
        we'll delete it.</p>

      <h2>Changes</h2>
      <p>The date at the top shows when this policy last changed. For a change that matters, we'll email
        account holders before it takes effect.</p>

      <h2>Contact</h2>
      <p>TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203. Privacy: <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>
    </div>
  </ReadingDialog>
</template>

<style scoped>
/* About's reading text. */
h1, h2, p, li {
  font-family: 'IBM VGA 8x16', 'JetBrains Mono', monospace;
}

h1, h2 {
  color: var(--text);
  line-height: 1.25;
}

h1 {
  margin: 0 0 8px;
  font-size: 32px;
}

h2 {
  margin: 36px 0 12px;
  font-size: 22px;
}

p, li {
  font-size: 18px;
  color: var(--text-dim);
}

p {
  margin-bottom: 16px;
}

li {
  margin: 6px 0;
}

p.updated {
  color: var(--text-muted);
}

a, button.link.inline {
  color: var(--accent);
  text-decoration: underline;
}

button.link.inline {
  padding: 0;
  font: inherit;
  letter-spacing: normal;
}
</style>
