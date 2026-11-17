/* ══════════════════════════════════════════════════════════════
   Lost Cities — version web jouable dans le terminal du portfolio
   Portage JavaScript du projet Java :
   https://github.com/dorianbrg/Lost_Cities_BPO
   Règles, calcul des scores et bots (BotMin, BotDéfausse) repris
   du code Java ; seule l'interface (entrées/sorties) est adaptée.

   Utilisation :  const prog = LostCities.start(io)
     io.print(html)       affiche une ligne (HTML) dans le terminal
     io.setPrompt(html)   change l'invite du terminal
     io.exit()            rend la main au terminal
   puis prog.input(ligne) pour chaque saisie de l'utilisateur.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── Couleurs & cartes (modele.carte.Couleur / TypeCarte / Carte) ──
  const COULEURS = ['JAUNE', 'BLANC', 'BLEU', 'VERT', 'ROUGE'];
  const HEX = { JAUNE: '#ffd34d', BLANC: '#f2f2f2', BLEU: '#5aa9ff', VERT: '#4ee08a', ROUGE: '#ff5470' };
  const VALEURS = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 0 = carte PARI

  class Carte {
    constructor(couleur, valeur) { this.couleur = couleur; this.valeur = valeur; }
    // Ordre naturel : couleur puis valeur (Carte.COMP)
    static compare(a, b) {
      return COULEURS.indexOf(a.couleur) - COULEURS.indexOf(b.couleur) || a.valeur - b.valeur;
    }
  }

  // ── Paquets (PaquetCouleur / Expedition / Defausse) ───────────
  class Expedition {
    constructor(couleur) { this.couleur = couleur; this.cartes = []; }
    get derniere() { return this.cartes[this.cartes.length - 1] || null; }
    peutPoser(c) {
      if (c.couleur !== this.couleur) return false;
      return !this.derniere || Carte.compare(c, this.derniere) >= 0; // valeur croissante
    }
    poser(c) { if (!this.peutPoser(c)) return false; this.cartes.push(c); return true; }
    calculerScore() {
      if (!this.cartes.length) return 0;
      let score = this.cartes.reduce((s, c) => s + c.valeur, 0) - 20; // prix de l'expédition
      const nbPari = this.cartes.filter(c => c.valeur === 0).length;
      score *= (1 + nbPari);
      if (this.cartes.length >= 8) score += 20;                       // bonus 8 cartes
      return score;
    }
  }

  class Defausse {
    constructor(couleur) { this.couleur = couleur; this.cartes = []; }
    get derniere() { return this.cartes[this.cartes.length - 1] || null; }
    poser(c) { if (c.couleur !== this.couleur) return false; this.cartes.push(c); return true; }
    prendreCarte() { return this.cartes.pop() || null; }
  }

  class Joueur {
    constructor(nom, strategie) {
      this.nom = nom;
      this.strategie = strategie;            // 'Humain' | 'BotMin' | 'BotDef'
      this.main = [];
      this.expeditions = {};
      COULEURS.forEach(c => this.expeditions[c] = new Expedition(c));
      this.lastCarteDefausse = null;         // pour ne pas repiocher sa propre défausse
    }
    ajouterMain(c) { this.main.push(c); this.main.sort(Carte.compare); }
    get score() { return COULEURS.reduce((s, c) => s + this.expeditions[c].calculerScore(), 0); }
  }

  // ── Jeu (modele.Jeu) ──────────────────────────────────────────
  class Jeu {
    constructor(j0, j1) {
      this.joueurs = [j0, j1];
      this.courant = 0;
      this.pioche = [];
      COULEURS.forEach(c => VALEURS.forEach(v => {
        const n = v === 0 ? 3 : 1;           // 3 cartes pari par couleur
        for (let i = 0; i < n; i++) this.pioche.push(new Carte(c, v));
      }));
      melanger(this.pioche);
      this.defausses = {};
      COULEURS.forEach(c => this.defausses[c] = new Defausse(c));
      for (let i = 0; i < 8; i++) {
        j0.ajouterMain(this.pioche.shift());
        j1.ajouterMain(this.pioche.shift());
      }
    }
    get joueurCourant() { return this.joueurs[this.courant]; }

    // Coup : { ind, type: 'JOUER' | 'DEFAUSSER' } → true si valide
    jouer(coup) {
      const j = this.joueurCourant;
      const carte = j.main[coup.ind];
      if (!carte) return false;
      if (coup.type === 'JOUER') {
        if (!j.expeditions[carte.couleur].poser(carte)) return false;
        j.main.splice(coup.ind, 1);
        return true;
      }
      j.main.splice(coup.ind, 1);
      j.lastCarteDefausse = carte;
      return this.defausses[carte.couleur].poser(carte);
    }

    // couleur === null → pioche principale
    piocher(couleur) {
      const j = this.joueurCourant;
      if (couleur === null) {
        if (!this.pioche.length) return false;
        j.ajouterMain(this.pioche.shift());
        return true;
      }
      const top = this.defausses[couleur].derniere;
      if (!top) return false;
      if (j.lastCarteDefausse && Carte.compare(top, j.lastCarteDefausse) === 0) return false;
      j.ajouterMain(this.defausses[couleur].prendreCarte());
      return true;
    }

    estFini() { return this.pioche.length === 0; }
    passerJoueurSuivant() { this.courant = 1 - this.courant; }
    get gagnant() {
      const [a, b] = this.joueurs;
      return a.score > b.score ? a : b.score > a.score ? b : null;
    }
  }

  // ── Stratégies des bots (modele.strategie) ────────────────────
  const BOTS = {
    // Joue la plus petite carte jouable, sinon défausse la plus petite. Pioche toujours dans la principale.
    BotMin: {
      choisirCoup(jeu) {
        const j = jeu.joueurCourant;
        let min = null;
        j.main.forEach(c => {
          if (j.expeditions[c.couleur].peutPoser(c) && (!min || min.valeur > c.valeur)) min = c;
        });
        if (min) return { ind: j.main.indexOf(min), type: 'JOUER' };
        const ppCarte = j.main.slice().sort((a, b) => a.valeur - b.valeur)[0]; // tri stable par valeur
        return { ind: j.main.indexOf(ppCarte), type: 'DEFAUSSER' };
      },
      choisirPioche() { return null; }
    },
    // Défausse systématiquement la première carte de sa main et pioche dans la principale.
    BotDef: {
      choisirCoup() { return { ind: 0, type: 'DEFAUSSER' }; },
      choisirPioche() { return null; }
    }
  };

  // ── Statistiques (vue.Statistiques), cumulées sur la session ──
  const stats = {
    nbParties: 0, cartesJouees: 0, cartesDef: 0,
    scoreExp: Object.fromEntries(COULEURS.map(c => [c, 0])),
    parties: { Humain: 0, BotMin: 0, BotDef: 0 },
    victoires: { Humain: 0, BotMin: 0, BotDef: 0 }
  };

  // ── Utilitaires ───────────────────────────────────────────────
  function melanger(t) {
    for (let i = t.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [t[i], t[k]] = [t[k], t[i]];
    }
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
  const dim = s => `<span class="t-dim">${s}</span>`;
  const hl = s => `<span class="t-hl">${s}</span>`;
  const red = s => `<span class="t-red">${s}</span>`;
  const white = s => `<span class="t-white">${s}</span>`;
  const col = (couleur, txt) => `<span style="color:${HEX[couleur]}">${txt}</span>`;
  const lbl = c => (c.valeur === 0 ? 'P' : String(c.valeur));
  const carteTxt = c => col(c.couleur, `${lbl(c)} ${c.couleur}`);
  const nomCouleur = c => c.charAt(0) + c.slice(1).toLowerCase();

  function parseCouleur(s) {
    const n = norm(s);
    if (!n) return undefined;
    if (n === 'p' || n.startsWith('princ')) return null;
    const m = COULEURS.filter(c => norm(c).startsWith(n));
    return m.length === 1 ? m[0] : undefined;
  }
  function parseAction(s) {
    const n = norm(s);
    if (['j', 'jouer', 'joue', 'poser', 'pose'].includes(n)) return 'JOUER';
    if (['d', 'def', 'defausser', 'defausse'].includes(n)) return 'DEFAUSSER';
    return undefined;
  }

  // ══════════════════════════════════════════════════════════════
  //  Contrôleur de partie (controle.ControleJeu + LostCities.main)
  // ══════════════════════════════════════════════════════════════
  function start(io) {
    let etat = 'nom';
    let nomJoueur = 'Visiteur';
    let jeu = null;
    let coupEnCours = null;   // { ind }
    let botTimer = null;

    const PROMPTS = {
      nom: 'nom',
      bot: 'adversaire',
      carte: 'carte',
      action: 'jouer/défausser',
      pioche: 'pioche',
      rejouer: 'rejouer ?'
    };
    function prompt() {
      io.setPrompt(`<span class="t-hl">lost-cities</span><span class="t-dim">[</span><span class="t-key">${PROMPTS[etat]}</span><span class="t-dim">]&gt;</span>`);
    }
    function aller(e) { etat = e; prompt(); }

    function aide() {
      io.print(`${white('Règles (Lost Cities)')}
 · 5 couleurs, cartes 2 à 10 + 3 cartes ${hl('P')} (pari) par couleur. 8 cartes en main.
 · À chaque tour : ${hl('jouer')} une carte sur ton expédition (valeur croissante, paris avant les chiffres)
   ou la ${hl('défausser')}, puis ${hl('piocher')} (pioche principale ${hl('p')} ou dessus d'une défausse).
 · Tu ne peux pas repiocher la carte que tu viens de défausser.
 · Score d'une expédition = somme − 20, multipliée par (1 + nb de paris), +20 si 8 cartes ou plus.
 · La partie s'arrête quand la pioche principale est vide.
${white('Saisie rapide')} : ${hl('3 j p')} = joue la carte 3 puis pioche dans la principale,
                ${hl('0 d rouge')} = défausse la carte 0 puis pioche sur la défausse rouge.
${white('Commandes')} : ${hl('plateau')} réaffiche le jeu · ${hl('regles')} cette aide · ${hl('quit')} quitte la partie`);
    }

    function plateau() {
      const [moi, bot] = jeu.joueurs;
      const W = 20;
      let s = dim(`${pad('', 7)}${pad(moi.nom.slice(0, 14), W)} score   défausse   ${pad(bot.nom, W)} score`) + '\n';
      COULEURS.forEach(c => {
        const e0 = moi.expeditions[c], e1 = bot.expeditions[c];
        const t0 = e0.cartes.map(lbl).join(' '), t1 = e1.cartes.map(lbl).join(' ');
        const top = jeu.defausses[c].derniere;
        const sc = e => { const v = e.calculerScore(); return pad(e.cartes.length ? (v > 0 ? '+' : '') + v : '·', 6); };
        s += col(c, pad(c, 7)) + col(c, pad(t0 || '—', W)) + ' ' + dim(sc(e0)) + '  '
          + (top ? col(c, pad('[' + lbl(top) + ']', 9)) : dim(pad('[ ]', 9))) + '  '
          + col(c, pad(t1 || '—', W)) + ' ' + dim(sc(e1)) + '\n';
      });
      s += dim(`Pioche : ${jeu.pioche.length} carte(s) · Score : ${moi.nom} ${moi.score} — ${bot.nom} ${bot.score}`);
      io.print(s);
    }

    function main() {
      const j = jeu.joueurs[0];
      io.print(`${white('Ta main')} : ` + j.main.map((c, i) => `${dim(i + ':')}${carteTxt(c)}`).join(dim(' | ')));
    }

    function tourHumain() {
      io.print(dim('────────────────────────────────────────'));
      plateau();
      main();
      io.print(dim('Quelle carte ? (indice, ex : ') + hl('2') + dim(' ou ') + hl('2 j p') + dim(')'));
      aller('carte');
    }

    function finTour() {
      jeu.passerJoueurSuivant();
      if (jeu.estFini()) return finPartie();
      if (jeu.courant === 1) {
        io.setPrompt(dim(`${esc(jeu.joueurs[1].nom)} réfléchit...`));
        etat = 'attente';
        botTimer = setTimeout(tourBot, 450);
      } else tourHumain();
    }

    function tourBot() {
      const j = jeu.joueurCourant;
      const strat = BOTS[j.strategie];
      const coup = strat.choisirCoup(jeu);
      const carte = j.main[coup.ind];
      if (!jeu.jouer(coup)) return; // les bots ne font jamais de coup invalide
      coup.type === 'JOUER' ? stats.cartesJouees++ : stats.cartesDef++;
      jeu.piocher(strat.choisirPioche(jeu));
      io.print(`${hl('»')} ${esc(j.nom)} ${coup.type === 'JOUER' ? 'joue' : 'défausse'} ${carteTxt(carte)} et pioche dans la principale.`);
      finTour();
    }

    function validerCoup(ind, type, piocheArg) {
      const carte = jeu.joueurs[0].main[ind];
      if (!jeu.jouer({ ind, type })) {
        io.print(red('Ce coup est invalide, veuillez en refaire un.') + ' ' +
          dim(`(${lbl(carte)} ${carte.couleur} ne peut pas aller sur ton expédition : il faut une valeur ≥ ${lbl(jeu.joueurs[0].expeditions[carte.couleur].derniere)})`));
        main();
        return aller('carte');
      }
      type === 'JOUER' ? stats.cartesJouees++ : stats.cartesDef++;
      io.print(dim(`Tu ${type === 'JOUER' ? 'joues' : 'défausses'} `) + carteTxt(carte) + dim('.'));
      if (piocheArg !== undefined) return validerPioche(piocheArg);
      io.print(dim('Depuis quelle pioche ? (') + hl('p') + dim(' pour la principale, sinon la couleur de la défausse)'));
      aller('pioche');
    }

    function validerPioche(arg) {
      const c = parseCouleur(arg);
      if (c === undefined) {
        io.print(red('Renseignez une pioche valide') + dim(' (p, jaune, blanc, bleu, vert, rouge)'));
        return aller('pioche');
      }
      if (!jeu.piocher(c)) {
        io.print(red('Ce choix de pioche est invalide, veuillez en refaire un.') + ' ' +
          dim(c && !jeu.defausses[c].derniere ? '(défausse vide)' : '(tu ne peux pas reprendre la carte que tu viens de défausser)'));
        return aller('pioche');
      }
      const prise = c === null ? 'la pioche principale' : `la défausse ${nomCouleur(c).toLowerCase()}`;
      io.print(dim(`Tu pioches dans ${prise}.`));
      finTour();
    }

    function finPartie() {
      clearTimeout(botTimer);
      const [moi, bot] = jeu.joueurs;
      io.print(dim('──────────── Fin de partie ────────────'));
      plateau();
      const g = jeu.gagnant;
      io.print(g ? (g === moi ? hl(`Le jeu est terminé. ${esc(moi.nom)} a gagné ! 🏆`) : red(`Le jeu est terminé. ${esc(bot.nom)} a gagné !`))
        : white('Le jeu est terminé. Égalité entre les 2 joueurs !'));
      io.print(`Score de ${esc(moi.nom)} : ${white(moi.score)}\nScore de ${esc(bot.nom)} : ${white(bot.score)}`);

      stats.nbParties++;
      COULEURS.forEach(c => stats.scoreExp[c] += moi.expeditions[c].calculerScore() + bot.expeditions[c].calculerScore());
      stats.parties[moi.strategie]++; stats.parties[bot.strategie]++;
      if (g) stats.victoires[g.strategie]++;
      const taux = s => stats.parties[s] ? (stats.victoires[s] * 100 / stats.parties[s]).toFixed(2) : '0.00';
      io.print(`${dim(`──── Statistiques au bout de ${stats.nbParties} partie(s) ────`)}
Nombre de cartes jouées : ${stats.cartesJouees}
Nombre de cartes défaussées : ${stats.cartesDef}
Score moyen par expédition : ${dim('|')} ${COULEURS.map(c => col(c, (stats.scoreExp[c] / (2 * stats.nbParties)).toFixed(2))).join(dim(' | '))} ${dim('|')}
Taux de victoires : Humain ${taux('Humain')}% · BotMin ${taux('BotMin')}% · BotDéfausse ${taux('BotDef')}%`);
      io.print(dim('Voulez-vous rejouer une partie ? (') + hl('oui') + dim('/') + hl('non') + dim(')'));
      aller('rejouer');
    }

    function nouvellePartie(strat) {
      const nomBot = strat === 'BotMin' ? 'BotMin' : 'BotDéfausse';
      jeu = new Jeu(new Joueur(nomJoueur, 'Humain'), new Joueur(nomBot, strat));
      io.print(hl('[+]') + ` Partie lancée : ${white(esc(nomJoueur))} contre ${white(nomBot)}. Tu commences. ` + dim('(tape ') + hl('regles') + dim(' pour l\'aide)'));
      tourHumain();
    }

    function quitter() {
      clearTimeout(botTimer);
      io.print(dim('Partie quittée. Retour au portfolio.'));
      io.exit();
    }

    function input(raw) {
      const line = raw.trim();
      const n = norm(line);
      if (['quit', 'exit', 'q', 'quitter'].includes(n)) return quitter();
      if (['regles', 'aide', 'help', '?'].includes(n)) { aide(); return prompt(); }
      if (n === 'plateau' && jeu && ['carte', 'action', 'pioche'].includes(etat)) { plateau(); main(); return prompt(); }
      if (etat === 'attente') return;

      switch (etat) {
        case 'nom':
          if (line) nomJoueur = line.slice(0, 14);
          io.print(dim('Contre quel bot ? ') + hl('botmin') + dim(' (joue sa plus petite carte jouable) ou ') + hl('botdef') + dim(' (défausse toujours)'));
          return aller('bot');

        case 'bot':
          if (n === 'botmin' || n === 'min' || n === '1') return nouvellePartie('BotMin');
          if (n === 'botdef' || n === 'def' || n === 'botdefausse' || n === '2') return nouvellePartie('BotDef');
          io.print(red('Veuillez renseigner un bot valide') + dim(' (botmin / botdef)'));
          return prompt();

        case 'carte': {
          const [a, b, c] = line.split(/\s+/);
          const ind = Number(a);
          const max = jeu.joueurs[0].main.length - 1;
          if (a === undefined || !/^\d+$/.test(a) || ind > max) {
            io.print(red('Veuillez renseigner un indice valide') + dim(` (0 à ${max})`));
            return prompt();
          }
          coupEnCours = { ind };
          if (b !== undefined) {
            const t = parseAction(b);
            if (!t) { io.print(red('Action invalide') + dim(' (jouer ou défausser)')); return aller('action'); }
            return validerCoup(ind, t, c);
          }
          io.print(dim('Souhaitez-vous la ') + hl('jouer') + dim(' ou la ') + hl('défausser') + dim(' ? (j/d)'));
          return aller('action');
        }

        case 'action': {
          const [a, c] = line.split(/\s+/);
          const t = parseAction(a || '');
          if (!t) { io.print(red('Veuillez renseigner une action valide') + dim(' (jouer ou défausser)')); return prompt(); }
          return validerCoup(coupEnCours.ind, t, c);
        }

        case 'pioche':
          return validerPioche(line);

        case 'rejouer':
          if (['oui', 'o', 'y', 'yes'].includes(n)) {
            io.print(dim('Contre quel bot ? ') + hl('botmin') + dim(' ou ') + hl('botdef'));
            return aller('bot');
          }
          if (['non', 'n', 'no'].includes(n)) return quitter();
          io.print(dim('Voulez-vous rejouer une partie ? (oui/non)'));
          return prompt();
      }
    }

    // Démarrage
    io.print(`${white('╔══ LOST CITIES ══╗')} ${dim('version web · code original Java :')} <a href="https://github.com/dorianbrg/Lost_Cities_BPO" target="_blank" rel="noopener">github</a>`);
    io.print(dim('Tape ') + hl('regles') + dim(' pour les règles, ') + hl('quit') + dim(' pour quitter à tout moment.'));
    io.print(dim('Entrez votre nom (Entrée pour « Visiteur ») :'));
    prompt();

    return { input };
  }

  global.LostCities = { start, _internals: { Carte, Expedition, Jeu, Joueur, BOTS } };
})(window);
