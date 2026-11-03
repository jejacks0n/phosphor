<script setup>
defineProps({ page: { type: String, required: true } });
const emit = defineEmits(['open']);
</script>

<template>
  <div v-if="page === 'terms'">
    <h1>Conditions d'utilisation</h1>
    <p class="updated">Dernière mise à jour : 1er novembre 2026.</p>

    <p>Ces conditions constituent un accord entre vous et TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203
      (« nous »). Elles couvrent Phosphor sur phosphor.work : l'éditeur et son onglet SOCIAL (le hall,
      les salles, le chat et les comptes). En créant un compte, ou en utilisant SOCIAL en tant qu'invité, vous acceptez ces conditions et
      notre <button class="link inline" @click="emit('open', 'privacy')">Politique de confidentialité</button>.</p>

    <h2>1. Qui peut utiliser SOCIAL</h2>
    <p>Vous devez avoir 13 ans ou plus. Si vous n'avez pas atteint l'âge de la majorité là où vous résidez, un parent ou tuteur légal
      doit accepter ces conditions en votre nom. Les comptes sont limités à un par personne, et votre compte vous appartient exclusivement.</p>

    <h2>2. Phosphor est gratuit</h2>
    <p>L'utilisation de Phosphor est gratuite. Parce qu'il est gratuit, nous ne promettons pas qu'il sera toujours disponible, et nous pouvons
      modifier, suspendre ou interrompre SOCIAL, ou toute partie de celui-ci, à tout moment. Le code source de l'éditeur est open source sous
      licence MIT, qui régit le code ; ces conditions régissent le service en ligne que nous fournissons.</p>

    <h2>3. Votre compte</h2>
    <ul>
      <li>Gardez votre mot de passe, vos codes à deux facteurs et vos codes de secours en sécurité. Vous êtes responsable de toute activité
        sur votre compte. Si vous pensez que quelqu'un d'autre y a accédé, changez votre mot de passe et prévenez-nous immédiatement.</li>
      <li>Votre nom d'utilisateur ne doit usurper l'identité de personne, induire les autres en erreur sur votre identité, ni être offensant. Nous
        pouvons modifier ou récupérer tout nom d'utilisateur qui enfreint cette règle.</li>
      <li>Si vous vous connectez avec Discord ou GitHub, leurs conditions respectives s'appliquent également à votre utilisation de ces services.</li>
    </ul>

    <h2>4. Vos créations</h2>
    <p>Ce que vous créez dans Phosphor vous appartient. L'éditeur conserve votre travail dans votre navigateur, et nous ne le recevons jamais
      sauf si vous hébergez une salle.</p>
    <p>Lorsque vous hébergez une salle publique, vous nous accordez la permission d'afficher une miniature d'aperçu de votre création dans le hall pendant que la salle
      est en direct, et vous autorisez les personnes que vous admettez à vous regarder dessiner. Lorsque quelqu'un signale votre salle, vous nous autorisez à
      conserver un instantané du canevas pour examiner et résoudre le signalement. C'est tout ce que nous en faisons, et nous ne vendons pas votre art ni ne l'utilisons
      pour de la publicité.</p>
    <p>Lorsque vous invitez quelqu'un à dessiner et qu'il accepte, vous l'autorisez à recevoir une copie de l'intégralité du projet, y compris
      l'image originale, pour dessiner dessus et la conserver dans son navigateur. Si vous quittez la salle, un artiste peut poursuivre en tant que
      nouvel hôte.</p>
    <p>Ne partagez que des créations que vous avez le droit de partager. Regarder une salle ne vous donne aucun droit de copier l'art
      de l'hôte ou de le revendiquer comme vôtre.</p>

    <h2>5. Utilisation acceptable</h2>
    <p>N'utilisez pas Phosphor pour :</p>
    <ul>
      <li>harceler, menacer, intimider ou rabaisser quiconque, ou attaquer des personnes en raison de leur identité ;</li>
      <li>partager du contenu sexuellement explicite dans une salle publique, ou tout contenu sexuel impliquant un mineur en toute circonstance (nous signalons immédiatement
        l'exploitation des enfants aux forces de l'ordre) ;</li>
      <li>partager du contenu sanglant ou illégal selon la législation locale, étatique ou fédérale applicable ;</li>
      <li>utiliser l'adresse IP de quelqu'un (que les salles révèlent) pour le localiser, le menacer ou attaquer sa connexion,
        ou partager les informations personnelles de quiconque sans son consentement (doxxing) ;</li>
      <li>diffuser du spam, des arnaques ou des liens vers des logiciels malveillants ;</li>
      <li>usurper l'identité de quelqu'un ou enfreindre ses droits d'auteur ou autres droits légaux ;</li>
      <li>contourner un blocage, un retrait, une mise en sourdine, une réduction au silence ou une suspension, y compris en créant d'autres comptes pour ce faire ;</li>
      <li>soumettre des signalements faux ou de mauvaise foi ;</li>
      <li>sonder, attaquer, surcharger, aspirer ou automatiser Phosphor ou ses serveurs, sauf dans le cadre d'une recherche en sécurité
        menée de bonne foi et signalée de manière confidentielle.</li>
    </ul>

    <h2>6. Blocages et signalements</h2>
    <p>Les hôtes peuvent retirer ou bloquer des personnes de leurs salles, et toute personne connectée avec un e-mail confirmé peut signaler un utilisateur ou une
      salle.</p>
    <p>Nous pouvons supprimer du contenu, réduire au silence, suspendre ou résilier un compte, ou fermer une salle, si nous estimons qu'il y a eu violation de
      ces conditions ou de la loi. Dans la mesure du possible, nous expliquerons pourquoi. Pour contester une décision de modération, contactez-nous à <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>

    <h2>7. Connexions de navigateur à navigateur</h2>
    <p>Les salles connectent directement votre navigateur à celui de l'hôte. Toute personne avec qui vous partagez une salle peut voir votre adresse
      IP, et le navigateur de l'hôte relaie le chat de la salle. Ne rejoignez des salles et n'admettez des personnes qu'avec lesquelles vous
      êtes à l'aise. Utilisez un VPN si vous souhaitez masquer votre adresse IP.</p>

    <h2>8. Droits d'auteur</h2>
    <p>Si vous pensez qu'un contenu sur Phosphor enfreint vos droits d'auteur, écrivez à <a href="mailto:hello@phosphor.work">hello@phosphor.work</a> en précisant
      l'œuvre protégée par le droit d'auteur et où elle apparaît, vos coordonnées, ainsi qu'une déclaration confirmant que vous possédez les droits ou êtes autorisé à agir au nom du titulaire des droits.
      Nous résilions les comptes des récidivistes.</p>

    <h2>9. Résiliation</h2>
    <p>Vous pouvez cesser d'utiliser Phosphor à tout moment et supprimer votre compte depuis la page Compte. Nous pouvons suspendre ou résilier tout
      compte qui enfreint ces conditions, ou interrompre SOCIAL à tout moment.</p>

    <h2>10. Exclusion de garanties</h2>
    <p>Dans toute la mesure permise par la loi, Phosphor est fourni « en l'état » et « selon disponibilité », sans garantie d'aucune
      sorte, expresse ou implicite, y compris les garanties de qualité marchande, d'adéquation à un usage particulier et d'absence de contrefaçon. Nous ne
      garantissons pas que Phosphor fonctionnera sans interruption, de manière sécurisée ou sans erreur, ni que la conduite des autres utilisateurs sera
      sûre.</p>

    <h2>11. Limitation de responsabilité</h2>
    <p>Dans toute la mesure permise par la loi, nous ne saurions être tenus responsables des dommages indirects, accessoires, spéciaux, consécutifs ou
      punitifs, ni de toute perte de données, de créations artistiques ou de bénéfices. Notre responsabilité totale pour toute réclamation relative à Phosphor
      est limitée à 50 $ USD. Rien dans ces conditions ne limite la responsabilité qui ne peut être exclue en vertu de la loi applicable, ni les droits légaux
      des consommateurs auxquels il ne peut être dérogé par contrat.</p>

    <h2>12. Modifications de ces conditions</h2>
    <p>La date au sommet indique la dernière mise à jour de ces conditions. Pour toute modification substantielle, nous en informerons les titulaires
      de compte enregistrés par e-mail avant l'entrée en vigueur des changements. Continuer à utiliser SOCIAL après cette date constitue votre acceptation des conditions
      révisées ; si vous n'êtes pas d'accord, vous devez supprimer votre compte.</p>

    <h2>13. Droit applicable</h2>
    <p>Ces conditions sont régies par les lois de l'État du Colorado, États-Unis, et tout litige sera résolu devant ses tribunaux, sauf
      lorsque la législation locale applicable vous accorde le droit d'intenter une action dans votre juridiction.</p>

    <h2>Contact</h2>
    <p>TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203. Pour toute question concernant ces conditions, contactez <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>
  </div>
  <div v-else-if="page === 'guidelines'">
    <h1>Règles de la communauté</h1>
    <p class="updated">Dernière mise à jour : 1er novembre 2026.</p>

    <p>SOCIAL est conçu pour dessiner ensemble et se regarder dessiner. En bref : soyez bienveillants. Cette page formule la section 5
      de nos <button class="link inline" @click="emit('open', 'terms')">Conditions d'utilisation</button> en langage simple. Elle n'ajoute aucune nouvelle
      règle, et si les deux venaient à différer, les Conditions prévalent.</p>

    <h2>Comment nous nous comportons ensemble</h2>
    <ul>
      <li><strong>Soyez bienveillant.</strong> Il y a une personne réelle derrière chaque nom.</li>
      <li><strong>Ne harcelez, ne menacez et ne rabaissez personne.</strong> N'attaquez personne pour ce qu'il est.</li>
      <li><strong>Respectez la vie privée.</strong> Les salles révèlent les adresses IP. Ne l'utilisez pas pour localiser, menacer
        ou attaquer autrui ou sa connexion, et ne partagez les données personnelles de personne sans son consentement.</li>
      <li><strong>Gardez les salles publiques convenables.</strong> Pas de contenu sexuellement explicite dans les salles publiques. Pas de gore ni
        rien d'illégal dans aucune salle. Le contenu sexuel impliquant un mineur n'est jamais toléré, et nous signalons immédiatement l'exploitation
        des enfants aux forces de l'ordre.</li>
      <li><strong>Respectez l'art des autres.</strong> Ne partagez que ce que vous avez le droit de partager. Regarder une salle ne vous donne pas
        le droit de copier l'art de l'hôte ni de vous l'approprier.</li>
      <li><strong>Restez vous-même.</strong> N'usurpez l'identité de personne. Pas de spam, d'arnaques ou de liens malveillants.</li>
      <li><strong>Respectez les limites.</strong> Ne contournez pas un blocage, un retrait, une mise en sourdine, une réduction au silence ou une suspension, y compris
        en créant d'autres comptes.</li>
      <li><strong>Signalez de bonne foi.</strong> Les signalements sont destinés aux vrais problèmes, pas pour se venger.</li>
    </ul>

    <h2>Quand quelque chose ne va pas</h2>
    <p>Vous pouvez toujours quitter une salle. Les hôtes peuvent retirer ou bloquer des personnes, et quiconque est connecté avec un e-mail confirmé peut
      signaler une personne ou une salle.</p>
    <p>Les personnes qui enfreignent les Conditions peuvent être réduites au silence ou suspendues. Si vous pensez qu'une erreur a été commise, écrivez à
      <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>

    <p>L'intégralité des règles se trouve dans les <button class="link inline" @click="emit('open', 'terms')">Conditions d'utilisation</button>. La manière dont nous traitons
      vos informations est décrite dans la <button class="link inline" @click="emit('open', 'privacy')">Politique de confidentialité</button>.</p>
  </div>
  <div v-else>
    <h1>Politique de confidentialité</h1>
    <p class="updated">Dernière mise à jour : 1er novembre 2026.</p>

    <p>Phosphor est un éditeur d'art ANSI fonctionnant dans votre navigateur sur phosphor.work. Son onglet SOCIAL est
      facultatif, proposant un hall, des salles où observer quelqu'un dessiner, un chat et des comptes utilisateurs. Cette politique explique quelles
      informations chaque fonctionnalité recueille, pourquoi nous les recueillons, qui y a accès et combien de temps elles sont conservées. Nous appliquons des normes
      de confidentialité conformes au RGPD à tous les utilisateurs, quel que soit leur lieu de résidence.</p>

    <h2>Qui nous sommes</h2>
    <p>Phosphor est exploité par TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203. Contactez-nous à propos de la confidentialité
      à l'adresse <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>

    <h2>L'éditeur conserve vos créations dans votre navigateur</h2>
    <p>Les images que vous ouvrez, les créations que vous dessinez, vos palettes, polices et paramètres restent entièrement dans votre navigateur
      (stockés localement dans le stockage local et IndexedDB). Nous ne les recevons jamais sauf si vous hébergez une salle (expliqué ci-dessous). Effacer
      les données de ce site dans votre navigateur les supprime.</p>
    <p>Nous n'utilisons aucun outil d'analyse d'audience, de publicité ou de cookies de suivi. L'application elle-même est hébergée sur GitHub
      Pages, qui, comme tout hébergeur web, reçoit votre adresse IP lorsque votre navigateur charge le site.</p>

    <h2>L'onglet SOCIAL</h2>
    <p>Rien provenant de l'onglet SOCIAL ne s'exécute tant que vous n'ouvrez pas cet onglet (ou ne suivez pas un lien depuis l'un de nos e-mails). À
      partir de cet instant :</p>
    <ul>
      <li><strong>La clé de votre navigateur :</strong> Votre navigateur génère une clé de signature et la conserve localement. Seule sa
        moitié publique nous est transmise, au sein du passe temporaire qui vous donne accès au hall et aux salles. Cela
        permet de vérifier que vos messages proviennent bien de vous. Afin qu'ils puissent également le vérifier, tous les membres d'une salle reçoivent
        le passe de chaque personne qui discute, rejoint ou quitte la salle. Un passe indique votre identifiant d'utilisateur, votre nom, si vous êtes invité ou si vous avez vérifié votre e-mail, cette clé publique et,
        si vous avez été réduit au silence, jusqu'à quand. Votre navigateur utilise la même clé pour chaque compte et visite invitée sur celui-ci, ainsi quiconque reçoit vos passes peut savoir qu'ils
        proviennent du même navigateur, dans cette salle ou une autre.</li>
      <li><strong>Invités :</strong> Les utilisateurs invités ne possèdent pas de compte. Vous recevez un pseudonyme aléatoire pour votre visite, et les autres le
        voient pendant que vous êtes dans le hall ou dans une salle.</li>
      <li><strong>Comptes :</strong> Lorsque vous créez un compte, nous conservons votre adresse e-mail, votre nom d'utilisateur, votre mot de passe
        (sous forme d'empreinte cryptographique à sens unique, jamais le mot de passe en clair), l'horodatage de votre acceptation de ces politiques, si
        vous avez vérifié votre e-mail, la date de dernière modification de votre nom d'utilisateur, et la date de votre dernier accès à SOCIAL
        en étant connecté.</li>
      <li><strong>Discord et GitHub :</strong> Si vous vous connectez via Discord ou GitHub, ils partagent votre identifiant de compte, nom,
        adresse e-mail et photo de profil avec nous, et fournissent des jetons d'accès que nous conservons avec votre compte et
        utilisons uniquement pour authentifier votre connexion. Chaque service opère en tant qu'entreprise indépendante régie par sa propre politique
        de confidentialité.</li>
      <li><strong>Authentification à deux facteurs :</strong> Si vous activez l'authentification à deux facteurs, nous conservons votre secret et vos codes de secours,
        chiffrés. Choisir « Faire confiance à cet ordinateur » place un cookie d'authentification dans votre navigateur pendant 30 jours.</li>
      <li><strong>Sessions :</strong> Chaque fois que vous vous connectez, nous enregistrons l'adresse IP d'origine et le user-agent du navigateur
        jusqu'à la fin de cette session (lorsque vous vous déconnectez, ou automatiquement après 7 jours).</li>
      <li><strong>Blocages :</strong> Vous pouvez bloquer d'autres utilisateurs. Votre liste de blocage est conservée jusqu'à ce que vous les débloquiez ou supprimiez
        votre compte.</li>
      <li><strong>Cookies :</strong> Nous ne déposons que les cookies essentiels indispensables pour vous maintenir connecté et protéger le flux d'authentification
        (la session, une étape à deux facteurs en cours, et l'indicateur d'ordinateur de confiance). Aucun d'entre eux ne vous suit d'un site à l'autre.</li>
    </ul>

    <h2>Ce que les autres utilisateurs voient</h2>
    <ul>
      <li><strong>Dans le hall :</strong> Toutes les personnes présentes dans le hall voient votre nom d'utilisateur ou pseudonyme, si vous êtes un
        invité, et le signal de statut choisi. Le titre d'une salle publique, son nombre de spectateurs et une miniature d'aperçu de
        l'art de l'hôte sont répertoriés pour tout le monde. Les salles privées ne sont pas répertoriées.</li>
      <li><strong>Dans une salle, votre navigateur se connecte directement à celui de l'hôte :</strong> Chaque participant
        peut voir l'adresse IP de l'autre, ce qui peut révéler votre localisation géographique approximative et votre fournisseur d'accès à Internet (FAI). Si
        vous préférez garder votre adresse IP privée, utilisez un VPN. Tous les membres d'une salle voient l'art de l'hôte en temps réel à mesure qu'il est dessiné.</li>
      <li><strong>Les artistes obtiennent l'intégralité du projet :</strong> Lorsqu'un hôte invite quelqu'un à dessiner et que cette personne accepte, le navigateur
        de cette dernière reçoit l'ensemble du projet, y compris l'image originale, directement depuis le navigateur de l'hôte.
        Elle conserve sa copie dans son navigateur, et si l'hôte s'en va, un artiste peut devenir le prochain hôte de la salle.</li>
      <li><strong>Le chat transite directement entre les navigateurs via l'hôte :</strong> Il ne passe jamais par nos
        serveurs, et nous ne le stockons ni ne le journalisons. Quiconque se trouve dans la salle peut voir le chat, et tout participant peut le copier.</li>
    </ul>

    <h2>Signalements</h2>
    <p>Vous pouvez signaler un utilisateur ou une salle. Un signalement est conservé pendant 90 jours après sa résolution. Si un
      modérateur a pris une mesure concernant votre compte, nous pouvons conserver des informations relatives à cette mesure avec votre compte
      pendant une période plus longue.</p>

    <h2>Sécurité de SOCIAL</h2>
    <ul>
      <li><strong>Limites de fréquence (rate limits) :</strong> Afin de prévenir les attaques par force brute et le spam, nous comptabilisons les requêtes par adresse IP
        et par adresse e-mail ou nom d'utilisateur soumis pendant environ une minute.</li>
      <li><strong>Cloudflare Turnstile</strong> vérifie qu'une personne réelle crée un compte, demande une
        réinitialisation de mot de passe ou un nouvel e-mail de confirmation, ou se connecte à un compte ayant fait l'objet de trop nombreuses tentatives.</li>
      <li><strong>Mots de passe compromis :</strong> Lorsque vous choisissez un mot de passe, nous envoyons uniquement les cinq premiers
        caractères de son empreinte SHA-1 (jamais le mot de passe lui-même) à Have I Been Pwned, et nous rejetons tout mot de passe
        apparu dans une fuite de données connue.</li>
    </ul>

    <h2>E-mails</h2>
    <p>Nous ne vous envoyons d'e-mails que pour confirmer votre adresse e-mail et pour réinitialiser votre mot de passe, expédiés via Mailjet. Nous n'envoyons
      jamais de lettres d'information ni d'e-mails promotionnels.</p>

    <h2>Pourquoi nous utilisons vos données (RGPD Article 6)</h2>
    <ul>
      <li><strong>Pour fournir SOCIAL</strong> (Art. 6(1)(b)) : Gestion de votre compte, authentification et fourniture de l'accès au hall et
        aux salles.</li>
      <li><strong>Intérêts légitimes</strong> (Art. 6(1)(f)) : Maintenir SOCIAL sécurisé, prévenir les abus, et
        examiner et résoudre les signalements.</li>
      <li><strong>Obligations légales</strong> (Art. 6(1)(c)) : Se conformer aux lois applicables lorsque nous sommes tenus de conserver ou de divulguer
        des informations.</li>
    </ul>

    <h2>Sous-traitants et prestataires de services tiers</h2>
    <p>Nous ne vendons, ne louons ni ne partageons de données personnelles avec des tiers à des fins marketing, et nous n'affichons aucune publicité.
      Les prestataires de services suivants traitent des données pour notre compte, uniquement pour faire fonctionner Phosphor :</p>
    <ul>
      <li><strong>Cloudflare :</strong> Exploite l'infrastructure de serveurs de SOCIAL, sa base de données, son stockage, ses limites de débit et
        Turnstile.</li>
      <li><strong>GitHub Pages :</strong> Héberge l'application web.</li>
      <li><strong>Mailjet :</strong> Assure l'acheminement des e-mails transactionnels.</li>
      <li><strong>Have I Been Pwned :</strong> Vérifie les mots de passe compromis (en utilisant uniquement un préfixe de hachage à cinq caractères).</li>
    </ul>
    <p>Certains de ces prestataires traitent des données en dehors de votre pays. Lorsque des données sont transférées hors de l'UE ou du Royaume-Uni, nous nous appuyons sur
      leurs accords de traitement des données et les clauses contractuelles types de la Commission européenne.</p>

    <h2>Conservation des données</h2>
    <ul>
      <li><strong>Votre compte :</strong> Conservé jusqu'à ce que vous le supprimiez. Supprimer votre compte depuis la page Compte le retire
        immédiatement, ainsi que vos sessions, comptes Discord et GitHub associés, identifiants à deux facteurs et liste de blocage.</li>
      <li><strong>Sessions :</strong> Conservées jusqu'à leur clôture, jusqu'à 7 jours.</li>
      <li><strong>Comptabilisation des limites de débit :</strong> Environ une minute.</li>
      <li><strong>Signalements :</strong> 90 jours après leur résolution. Si un modérateur a pris une mesure
        concernant votre compte, l'historique de cette mesure peut être conservé avec votre compte plus longtemps.</li>
      <li><strong>Le hall et les salles :</strong> Aucune donnée n'est conservée après la fin d'une salle ou après votre départ.</li>
    </ul>

    <h2>Vos droits</h2>
    <p>Où que vous résidiez, vous avez le droit de demander une copie de vos données, de les corriger, de les supprimer, de restreindre ou de
      vous opposer à leur traitement, ou de les recevoir dans un format portable. Vous pouvez modifier votre nom d'utilisateur ou supprimer votre
      compte directement depuis la page Compte. Pour toute autre demande, écrivez-nous à <a href="mailto:hello@phosphor.work">hello@phosphor.work</a> depuis
      l'adresse e-mail enregistrée sur votre compte. Nous répondons sous 30 jours, sans frais. Vous avez également le droit d'introduire une réclamation auprès de votre autorité locale de protection
      des données.</p>

    <h2>Vie privée des enfants</h2>
    <p>SOCIAL est destiné aux utilisateurs de 13 ans et plus. Si vous pensez qu'un enfant de moins de 13 ans a créé un compte, veuillez nous contacter à l'adresse <a href="mailto:hello@phosphor.work">hello@phosphor.work</a> et
      nous le supprimerons dans les plus brefs délais.</p>

    <h2>Modifications de cette politique</h2>
    <p>La date au sommet indique la dernière mise à jour de cette politique. Pour toute modification substantielle, nous enverrons un e-mail aux
      titulaires de compte enregistrés avant l'entrée en vigueur des changements.</p>

    <h2>Contact</h2>
    <p>TFC &amp; CO LLC, 1500 N Grant St, Denver, CO 80203. Pour toute question relative à la confidentialité, écrivez à <a href="mailto:hello@phosphor.work">hello@phosphor.work</a>.</p>
  </div>
</template>
