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
        ("we," "us"). They cover Phosphor at phosphor.work: the editor and its SOCIAL tab (the lobby,
        rooms, chat, and accounts). By creating an account, or by using SOCIAL as a guest, you accept these terms and
        our <button class="link inline" @click="emit('open', 'privacy')">Privacy Policy</button>.</p>

      <h2>1. Who Can Use SOCIAL</h2>
      <p>You must be 13 or older. If you are under the age of majority where you live, a parent or legal guardian
        must agree to these terms on your behalf. Accounts are limited to one per person, and your account is yours alone.</p>

      <h2>2. Phosphor Is Free</h2>
      <p>Phosphor costs nothing to use. Because it is free, we do not promise that it will always be available, and we may
        change, suspend, or discontinue SOCIAL, or any part of it, at any time. The editor's source code is open source under the MIT
        License, which governs the code; these terms govern the online service we provide.</p>

      <h2>3. Your Account</h2>
      <ul>
        <li>Keep your password, two-factor codes, and backup codes secure. You are responsible for all activity
          on your account. If you believe someone else has accessed it, change your password and let us know immediately.</li>
        <li>Your username must not impersonate anyone, mislead others about your identity, or be offensive. We
          may change or reclaim any username that violates this rule.</li>
        <li>If you sign in with Discord or GitHub, their respective terms also apply to your use of those services.</li>
      </ul>

      <h2>4. Your Art</h2>
      <p>What you create in Phosphor is yours. The editor keeps your work in your browser, and we never receive it
        unless you host a room.</p>
      <p>When you host a public room, you grant us permission to display a preview thumbnail of your art in the lobby while the room
        is live, and you allow the people you admit to watch you draw. When someone reports your room, you allow us to
        retain a snapshot of the canvas to review and resolve the report. That is all we do with it, and we do not sell your art or use it
        for advertising.</p>
      <p>Only share art you have the right to share. Watching a room does not give you any right to copy the
        host's art or claim it as your own.</p>

      <h2>5. Acceptable Use</h2>
      <p>Do not use Phosphor to:</p>
      <ul>
        <li>harass, threaten, bully, or demean anyone, or attack people based on their identity;</li>
        <li>share sexually explicit content in a public room, or any sexual content involving a minor under any circumstances (we report
          child exploitation to law enforcement immediately);</li>
        <li>share gore or content that is illegal under applicable local, state, or federal law;</li>
        <li>use someone's IP address (which rooms reveal) to track, threaten, or attack them or their
          connection, or share anyone's personal information without their consent (doxxing);</li>
        <li>spam, scam, or post links to malware;</li>
        <li>impersonate anyone, or infringe on their copyright or other legal rights;</li>
        <li>circumvent a block, removal, mute, silence, or suspension, or create additional accounts to do so;</li>
        <li>submit false or bad-faith reports;</li>
        <li>probe, attack, overload, scrape, or automate Phosphor or its servers, except through security
          research conducted in good faith and reported to us privately.</li>
      </ul>

      <h2>6. Blocks and Reports</h2>
      <p>Hosts can remove or block people from their rooms, and any signed-in user can report a user or a
        room.</p>
      <p>We may remove content, silence, suspend, or terminate an account, or close a room, if we believe it violated
        these terms or the law. When feasible, we will explain why. To appeal a moderation decision, contact us at <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>

      <h2>7. Browser-to-Browser Connections</h2>
      <p>Rooms connect your browser directly to the host's browser. Everyone you share a room with can see your IP
        address, and the host's browser relays the room's chat. Only join rooms with, and admit people, you are
        comfortable with. Use a VPN if you want to mask your IP address.</p>

      <h2>8. Copyright</h2>
      <p>If you believe content on Phosphor infringes your copyright, email <a href="mailto:hello@phosphor.work">hello@phosphor.work</a> with an
        identification of the copyrighted work and where it appears, your contact information, and a statement confirming that you own the rights or are authorized to act on the copyright owner's behalf.
        We terminate the accounts of repeat infringers.</p>

      <h2>9. Termination</h2>
      <p>You can stop using Phosphor at any time and delete your account from the Account page. We may suspend or terminate any
        account that violates these terms, or discontinue SOCIAL at any time.</p>

      <h2>10. Disclaimer of Warranties</h2>
      <p>To the fullest extent permitted by law, Phosphor is provided "as is" and "as available," without warranties of
        any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not
        guarantee that Phosphor will be uninterrupted, secure, or error-free, or that the conduct of other users will be
        safe.</p>

      <h2>11. Limitation of Liability</h2>
      <p>To the fullest extent permitted by law, we are not liable for any indirect, incidental, special, consequential, or
        punitive damages, or for any loss of data, artwork, or profits. Our total liability for any claim relating to Phosphor
        is limited to $50 USD. Nothing in these terms limits liability that cannot be excluded under applicable law, or any
        statutory consumer rights that cannot be waived by contract.</p>

      <h2>12. Changes to These Terms</h2>
      <p>The date at the top indicates when these terms were last updated. For material changes, we will notify registered
        account holders by email before the changes take effect. Continuing to use SOCIAL after that date constitutes your acceptance of the revised
        terms; if you do not agree, you should delete your account.</p>

      <h2>13. Governing Law</h2>
      <p>These terms are governed by the laws of the State of Colorado, USA, and any legal disputes will be resolved in its courts, except
        where applicable local law grants you the right to bring an action in your jurisdiction.</p>

      <h2>Contact</h2>
      <p>TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203. For questions regarding these terms, contact <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>
    </div>
    <div v-else>
      <h1>Privacy Policy</h1>
      <p class="updated">Last updated: October 29, 2026.</p>

      <p>Phosphor is an ANSI art editor that runs in your browser at phosphor.work. Its SOCIAL tab is
        optional, offering a lobby, rooms where you can watch someone draw, chat, and user accounts. This policy explains what
        information each feature collects, why we collect it, who has access to it, and how long it is retained. We apply GDPR-level privacy
        standards to all users, regardless of where they live.</p>

      <h2>Who We Are</h2>
      <p>Phosphor is operated by TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203. Contact us about
        privacy at <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>

      <h2>The Editor Keeps Your Art in Your Browser</h2>
      <p>Images you open, art you draw, your palettes, fonts, and settings stay entirely in your browser
        (stored locally in local storage and IndexedDB). We never receive them unless you host a room (explained below). Clearing
        this site's data in your browser deletes them.</p>
      <p>We do not use analytics, advertising, or tracking cookies. The app itself is hosted on GitHub
        Pages, which, like any web host, receives your IP address when your browser loads the site.</p>

      <h2>The SOCIAL Tab</h2>
      <p>Nothing from the SOCIAL tab runs until you open that tab (or follow a link from one of our emails). From
        then on:</p>
      <ul>
        <li><strong>Your browser's key:</strong> Your browser generates a signing key and stores it locally. Only its
          public half is sent to us, inside the temporary pass that admits you to the lobby and rooms. This
          verifies that your messages originate from you.</li>
        <li><strong>Guests:</strong> Guest users do not have an account. You receive a random nickname for your visit, and others see
          it while you are in the lobby or in a room.</li>
        <li><strong>Accounts:</strong> When you create an account, we retain your email address, username, password
          (as a cryptographic one-way hash, never the plaintext password itself), the timestamp when you agreed to these policies, whether
          you have verified your email, when you last changed your username, and the date you last accessed SOCIAL
          signed in.</li>
        <li><strong>Discord and GitHub:</strong> If you sign in through Discord or GitHub, they share your account ID, name,
          email address, and profile picture with us, and provide access tokens, which we keep with your account and
          use solely to authenticate your sign-in. Each service operates as an independent company under its own privacy
          policy.</li>
        <li><strong>Two-factor authentication:</strong> If you enable two-factor authentication, we keep your secret and backup codes,
          encrypted. Selecting "Trust this computer" leaves an authentication cookie in your browser for 30 days.</li>
        <li><strong>Sessions:</strong> Each time you sign in, we record the originating IP address and browser user-agent
          until that session ends (when you sign out, or automatically after 7 days).</li>
        <li><strong>Blocks:</strong> You can block other users. Your block list is retained until you unblock them or delete
          your account.</li>
        <li><strong>Cookies:</strong> We set only essential cookies necessary to keep you signed in and protect the authentication flow
          (the session, a two-factor step in progress, and a trusted computer flag). None of them track you across websites.</li>
      </ul>

      <h2>What Other Users See</h2>
      <ul>
        <li><strong>In the lobby:</strong> Everyone present in the lobby sees your username or nickname, whether you are a
          guest, and your chosen status signal. A public room's title, its viewer count, and a preview thumbnail of
          the host's art are listed for everyone. Private rooms are not listed.</li>
        <li><strong>In a room, your browser connects directly to the host's browser:</strong> Each participant
          can see the other's IP address, which can reveal your approximate geographic location and your internet service provider (ISP). If
          you prefer to keep your IP address private, use a VPN. Everyone in a room sees the host's art in real time as it is drawn.</li>
        <li><strong>Chat travels directly between browsers through the host:</strong> It never passes through our
          servers, and we do not store or log it. Anyone in the room can see the chat, and any participant can copy it.</li>
      </ul>

      <h2>Reports</h2>
      <p>You can report a user or a room. A report is retained for 90 days after it is resolved. If a
        moderator took action on your account, we may retain information about the action with your account
        for a longer period.</p>

      <h2>Keeping SOCIAL Safe</h2>
      <ul>
        <li><strong>Rate limits:</strong> To prevent brute-force attacks and spam, we track request counts by IP address
          and by the submitted email address or username for approximately one minute.</li>
        <li><strong>Cloudflare Turnstile</strong> verifies that a real person is creating an account or requesting a
          password reset.</li>
        <li><strong>Compromised passwords:</strong> When you choose a password, we send only the first five
          characters of its SHA-1 hash (never the password itself) to Have I Been Pwned, and we reject any password that
          has appeared in a known data breach.</li>
      </ul>

      <h2>Email</h2>
      <p>We email you only to confirm your email address and to reset your password, sent through Mailjet. We never send
        newsletters or marketing emails.</p>

      <h2>Why We Use Your Data (GDPR Article 6)</h2>
      <ul>
        <li><strong>To provide SOCIAL</strong> (Art. 6(1)(b)): Managing your account, authentication, and providing access to the lobby and
          rooms.</li>
        <li><strong>Legitimate interests</strong> (Art. 6(1)(f)): Keeping SOCIAL secure, preventing abuse, and
          reviewing and resolving reports.</li>
        <li><strong>Legal obligations</strong> (Art. 6(1)(c)): Complying with applicable laws when we are required to retain or disclose
          information.</li>
      </ul>

      <h2>Third-Party Service Providers</h2>
      <p>We do not sell, rent, or share personal data with third parties for marketing, and we do not display advertisements.
        The following service providers process data on our behalf, solely to operate Phosphor:</p>
      <ul>
        <li><strong>Cloudflare:</strong> Operates the SOCIAL server infrastructure, its database, storage, rate limits, and
          Turnstile.</li>
        <li><strong>GitHub Pages:</strong> Hosts the web application.</li>
        <li><strong>Mailjet:</strong> Delivers transactional emails.</li>
        <li><strong>Have I Been Pwned:</strong> Checks for compromised passwords (using only a five-character hash prefix).</li>
      </ul>
      <p>Some of these providers process data outside your country. Where data is transferred outside the EU or the UK, we rely on
        their data processing agreements and the European Commission's standard contractual clauses.</p>

      <h2>Data Retention</h2>
      <ul>
        <li><strong>Your account:</strong> Retained until you delete it. Deleting your account from the Account page removes it
          immediately, along with your sessions, linked Discord and GitHub accounts, two-factor credentials, and block list.</li>
        <li><strong>Sessions:</strong> Retained until they end, up to 7 days.</li>
        <li><strong>Rate-limit counts:</strong> Approximately one minute.</li>
        <li><strong>Reports:</strong> 90 days after they are resolved. If a moderator took action on
          your account, records of that action may be retained with your account for longer.</li>
        <li><strong>The lobby and rooms:</strong> No data is retained after a room ends or after you leave.</li>
      </ul>

      <h2>Your Rights</h2>
      <p>Regardless of where you live, you have the right to request a copy of your data, to correct it, to delete it, to restrict or
        object to how we use it, or to receive it in a portable format. You can update your username or delete your
        account directly from the Account page. For any other requests, email us at <a href="mailto:hello@phosphor.work">hello@phosphor.work</a> from your account's
        registered email address. We respond within 30 days, free of charge. You also have the right to file a complaint with your local data protection
        authority.</p>

      <h2>Children's Privacy</h2>
      <p>SOCIAL is intended for users 13 and older. If you believe a child under 13 has created an account, please contact us at <a href="mailto:hello@phosphor.work">hello@phosphor.work</a> and
        we will promptly delete it.</p>

      <h2>Changes to This Policy</h2>
      <p>The date at the top indicates when this policy was last updated. For material changes, we will email
        registered account holders before the changes take effect.</p>

      <h2>Contact</h2>
      <p>TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203. For privacy questions, email <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>
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
