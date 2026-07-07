/* i18n.js — English + Indonesian strings for the Sabermetrics page.
 *
 * Every user-facing string lives here. Components read the active table via the
 * module-level `L` in app.jsx; parameterized strings are functions. Keys match
 * 1:1 between `en` and `id`. */

const en = {
  langName: "EN",
  header: { back: "← Back", overview: "← Overview" },
  glossary: {
    title: "How to read this",
    sub: "Three ideas power the whole thing.",
    items: [
      ["01", "Impact, not win rate", "Win rate can't tell whether a player or their partner won the match. Impact Score measures just the player, across many different partners and opponents."],
      ["02", "Value added", "How much more they bring than an average player at their level — their edge, in one number."],
      ["03", "The right partner", "Who lifts them most — combining how strong a partner is with the chemistry they actually show together."],
    ],
    gotit: "Got it",
  },
  defs: {
    reveal: { t: "Win rate vs. real impact", d: "Win rate only counts matches you won, so in doubles it blends your skill with your partner's. Impact Score strips that away and measures just you. When impact rank beats win-rate rank, the record has been underselling the player — usually because they've been carrying weaker partners." },
    impact: { t: "Impact Score", d: "How many points a player adds to their team in an average match, after the model removes partner and opponent influence. Their true individual value, independent of who they played with. Measured in points per match." },
    valueAdded: { t: "Value Added", d: "How many more points this player brings than an average player would. Higher means a bigger difference to any team they join." },
    accuracy: { t: "Model Accuracy", d: "How well the model predicts real match results across the whole pool. 65% means it explains most of what actually happens on court — so the ratings hold up." },
    pairScore: { t: "Pair Score", d: "Projected points per match if the two play together — their impact, their partner's impact, and the chemistry between them, combined." },
    strength: { t: "Partner strength", d: "How good that partner is on their own — their individual Impact Score." },
    chemistry: { t: "Chemistry", d: "A bonus or penalty from how two playing styles fit together, beyond raw skill. Some pairs over- or under-perform what their individual scores predict." },
    divergence: { t: "The gap (▲ / ▼)", d: "The difference between a player's win-rate rank and their true impact rank. ▲ orange means impact ranks higher than win rate — they're underrated. ▼ grey means win rate flatters them." },
    calibrated: { t: "Calibrated", d: "Enough matches for a stable, trustworthy rating. Below the threshold, ratings are still settling." },
  },
  whatis: (t) => "What is " + t,
  intro: {
    badge: "New · Advanced analytics",
    h1: "See what", h2: "win rate", h3: "hides",
    lede: "Sabermetrics is the science of measuring what actually wins games — looking past surface stats like win rate to each player's true value. We bring it to padel: since doubles blends your skill with your partner's, we use your match history across many different partners to isolate what you alone contribute.",
    howItWorks: "How it works",
    steps: [
      ["01", "We read the match history", "Every Trekkr match records who played with whom, against whom, and the score."],
      ["02", "We isolate each player", "Because members play with many partners, the model separates each one's contribution — win rate can't."],
      ["03", "We find the right pairings", "Then it ranks partners by how strong they are and how well their styles click."],
    ],
    whatYouGet: "What you get",
    feats: [
      ["target", "Every player's real Impact", "How much each member adds per match — and where they truly rank, not where win rate puts them."],
      ["link", "Best-fit partners", "For any player, a ranked shortlist of who lifts their game most, from strength and chemistry combined."],
      ["scale", "Who's carried, who's carrying", "See at a glance which members are underrated and which are riding stronger partners."],
    ],
    matchesAnalyzed: "real matches analyzed",
    predictPre: "The model predicts about ", predictBold: "two-thirds of match outcomes", predictPost: " — earned, not guessed.",
    how: "How?",
    startExploring: "Start exploring",
    byClubT: "Explore by club", byClubD: "Whole-roster analysis for a club or community",
    byPlayersT: "Explore by players", byPlayersD: "Search any player and see their analysis",
    proNotePre: "Full analysis is a ", proWord: "Pro", proNotePost: " feature · real data from trekkr.online",
  },
  reveal: {
    eyebrow: "The reveal",
    byWin: "By win rate, ranks",
    delta: (n, better) => `${n} spots ${better ? "better" : "lower"} than the record shows`,
    deltaLocked: "real rank differs — unlock to see",
    byImpact: "By real impact, ranks",
    footer: (count, scope) => `of ${count} players in ${scope} · partner & opponent effects removed`,
  },
  scopeAll: "all clubs",
  detail: {
    men: "Men", women: "Women",
    meta: (scope, apps, win) => `${scope} · ${apps} matches · ${win}% win · calibrated`,
    impactScore: "Impact Score", conf: (se) => `±${se} confidence`, lockedFree: "locked on Free", ptsMatch: " pts/match",
    valueAdded: "Value Added", vsAvg: "vs. an average player",
    modelAccuracy: "Model Accuracy", reliable: "how reliable ratings are",
    partnerAnalysis: "Partner analysis", bestByPair: "best partners by pair score", notEnough: "not enough data yet",
    strength: "strength", chemistry: "chemistry",
    bestFitPre: "Best-fit partner found — projected ", bestFitBold: (x) => `+${x} pts/match`, bestFitPost: ". Unlock Pro to see who.",
    liftsMost: "Lifts you most", holdsBack: "Holds you back", clubPlans: "•••••• (club plans)",
    onlyWithPre: "Only recorded playing with ", onlyWithPost: " so far, so a partner analysis can’t be given yet — it needs matches with a few different partners.",
    noPartner: "No partner data yet — this player needs matches with a few different partners before a best-fit can be found.",
  },
  partnerRow: { together: (n) => `${n} together`, strength: (x) => `strength ${x}`, chemistry: (x) => `chemistry ${x}`, unlock: "unlock to see the fit", pairScore: "pair score" },
  empty: { title: "Select a player", body: "Pick anyone from the list to see their true impact, rank, and best-fit partners." },
  roster: {
    club: "Club",
    subtitle: (prefix, count, rows) => `${prefix} · ${count} players · ${rows} matches`,
    searchPlaceholder: "Search a player in this club",
    noneHere: (q) => `No player matches “${q}” here.`,
    rowSub: (win, apps) => `${win}% win · ${apps} matches`,
    strongestDuo: "Strongest duo in the club",
    duoLocked: "One pairing projects highest. Unlock Pro to see who.",
    rankedByImpact: "Ranked by impact",
    gap: "gap", vsWin: "vs win%", impact: "impact",
    freeNotePre: "Free shows names and win rate. ", freeNoteBold: "Unlock Pro", freeNotePost: " to reveal each member's true impact and who's underrated.",
  },
  players: {
    all: "All players",
    sub: (n) => `${n} players across every club · search any name`,
    searchPlaceholder: "Search any player",
    none: (q) => `No player matches “${q}”.`,
    top: "Top players overall",
    rowSub: (venue, win) => `${venue} · ${win}% win`,
  },
  mode: { byClub: "By club", byPlayers: "By players" },
  glossaryBtn: "New here? Read “How to read this” first",
  analysis: { rosterLabel: "roster", allPlayersLabel: "all players", footerPro: "Prototype · real data from trekkr.online", footerFree: "Free shows the insight exists — Pro unlocks it" },
  boot: { loading: "Loading live club data…", emptyT: "No clubs found yet", emptyD: "Once a venue records its first matches on trekkr.online, it’ll appear here.", errT: "Couldn’t load live data", errD: "We couldn’t reach trekkr.online. Check your connection and try again.", retry: "Retry" },
};

const id = {
  langName: "ID",
  header: { back: "← Kembali", overview: "← Ringkasan" },
  glossary: {
    title: "Cara membaca ini",
    sub: "Tiga ide menggerakkan semuanya.",
    items: [
      ["01", "Impact, bukan win rate", "Win rate tak bisa membedakan apakah pemain atau partnernya yang memenangkan match. Impact Score mengukur pemainnya saja, lintas banyak partner dan lawan berbeda."],
      ["02", "Nilai tambah", "Seberapa banyak lebih yang ia bawa dibanding pemain rata-rata selevelnya — keunggulannya, dalam satu angka."],
      ["03", "Partner yang tepat", "Siapa yang paling mengangkat permainannya — memadukan seberapa kuat partner dengan chemistry yang benar-benar mereka tunjukkan bersama."],
    ],
    gotit: "Paham",
  },
  defs: {
    reveal: { t: "Win rate vs. impact asli", d: "Win rate hanya menghitung match yang Anda menangkan, jadi di ganda ia mencampur skill Anda dengan skill partner. Impact Score memisahkannya dan mengukur Anda saja. Saat peringkat impact mengalahkan peringkat win rate, catatan selama ini meremehkan pemain itu — biasanya karena ia menggendong partner yang lebih lemah." },
    impact: { t: "Impact Score", d: "Berapa poin yang ditambahkan pemain ke timnya dalam match rata-rata, setelah model menghilangkan pengaruh partner dan lawan. Nilai individu aslinya, terlepas dari siapa yang bermain bersamanya. Diukur dalam poin per match." },
    valueAdded: { t: "Nilai Tambah", d: "Berapa poin lebih banyak yang dibawa pemain ini dibanding pemain rata-rata. Makin tinggi, makin besar bedanya bagi tim mana pun yang ia masuki." },
    accuracy: { t: "Akurasi Model", d: "Seberapa baik model memprediksi hasil match nyata di seluruh kumpulan pemain. 65% berarti ia menjelaskan sebagian besar yang benar-benar terjadi di lapangan — jadi ratingnya dapat diandalkan." },
    pairScore: { t: "Pair Score", d: "Proyeksi poin per match jika keduanya bermain bersama — impact mereka, impact partner mereka, dan chemistry di antara mereka, digabung." },
    strength: { t: "Kekuatan partner", d: "Seberapa bagus partner itu sendiri — Impact Score individunya." },
    chemistry: { t: "Chemistry", d: "Bonus atau penalti dari seberapa cocok dua gaya bermain, di luar skill mentah. Sebagian pasangan tampil lebih atau kurang dari yang diprediksi skor individu mereka." },
    divergence: { t: "Selisih (▲ / ▼)", d: "Selisih antara peringkat win rate pemain dan peringkat impact aslinya. ▲ oranye berarti impact berperingkat lebih tinggi dari win rate — ia diremehkan. ▼ abu-abu berarti win rate membuatnya terlihat lebih baik." },
    calibrated: { t: "Terkalibrasi", d: "Cukup banyak match untuk rating yang stabil dan tepercaya. Di bawah ambang, rating masih mengendap." },
  },
  whatis: (t) => "Apa itu " + t,
  intro: {
    badge: "Baru · Analitik lanjutan",
    h1: "Yang tak", h2: "ditampilkan", h3: "win rate",
    lede: "Sabermetrics adalah ilmu mengukur apa yang sebenarnya memenangkan pertandingan — melihat melampaui statistik permukaan seperti win rate ke nilai asli tiap pemain. Kami membawanya ke padel: karena ganda mencampur skill Anda dengan skill partner, kami memakai riwayat match Anda lintas banyak partner berbeda untuk mengisolasi apa yang Anda sumbangkan sendiri.",
    howItWorks: "Cara kerjanya",
    steps: [
      ["01", "Kami baca riwayat match", "Setiap match Trekkr mencatat siapa bermain dengan siapa, melawan siapa, dan skornya."],
      ["02", "Kami isolasi tiap pemain", "Karena pemain bermain dengan banyak partner, model memisahkan kontribusi masing-masing — win rate tak bisa."],
      ["03", "Kami temukan pasangan yang tepat", "Lalu ia memeringkat partner berdasarkan seberapa kuat mereka dan seberapa klop gaya mereka."],
    ],
    whatYouGet: "Yang Anda dapat",
    feats: [
      ["target", "Impact asli tiap pemain", "Berapa banyak yang ditambahkan tiap anggota per match — dan di mana peringkat sebenarnya, bukan di mana win rate menempatkannya."],
      ["link", "Partner paling cocok", "Untuk pemain mana pun, daftar pendek berperingkat siapa yang paling mengangkat permainannya, dari kekuatan dan chemistry digabung."],
      ["scale", "Siapa digendong, siapa menggendong", "Lihat sekilas anggota mana yang diremehkan dan mana yang menumpang partner lebih kuat."],
    ],
    matchesAnalyzed: "match nyata dianalisis",
    predictPre: "Model ini memprediksi sekitar ", predictBold: "dua pertiga hasil pertandingan", predictPost: " — hasil kerja, bukan tebakan.",
    how: "Bagaimana?",
    startExploring: "Mulai menjelajah",
    byClubT: "Jelajahi per klub", byClubD: "Analisis seluruh roster untuk klub atau komunitas",
    byPlayersT: "Jelajahi per pemain", byPlayersD: "Cari pemain mana pun dan lihat analisisnya",
    proNotePre: "Analisis penuh adalah fitur ", proWord: "Pro", proNotePost: " · data nyata dari trekkr.online",
  },
  reveal: {
    eyebrow: "Pengungkap",
    byWin: "Menurut win rate, peringkat",
    delta: (n, better) => `${n} peringkat lebih ${better ? "tinggi" : "rendah"} dari yang tampak`,
    deltaLocked: "peringkat asli berbeda — buka untuk lihat",
    byImpact: "Menurut impact asli, peringkat",
    footer: (count, scope) => `dari ${count} pemain di ${scope} · efek partner & lawan dihilangkan`,
  },
  scopeAll: "semua klub",
  detail: {
    men: "Putra", women: "Putri",
    meta: (scope, apps, win) => `${scope} · ${apps} match · ${win}% menang · terkalibrasi`,
    impactScore: "Impact Score", conf: (se) => `±${se} keyakinan`, lockedFree: "terkunci di Free", ptsMatch: " poin/match",
    valueAdded: "Nilai Tambah", vsAvg: "vs. pemain rata-rata",
    modelAccuracy: "Akurasi Model", reliable: "seberapa andal rating",
    partnerAnalysis: "Analisis partner", bestByPair: "partner terbaik menurut pair score", notEnough: "data belum cukup",
    strength: "kekuatan", chemistry: "chemistry",
    bestFitPre: "Partner paling cocok ditemukan — proyeksi ", bestFitBold: (x) => `+${x} poin/match`, bestFitPost: ". Buka Pro untuk lihat siapa.",
    liftsMost: "Paling mengangkat", holdsBack: "Paling menahan", clubPlans: "•••••• (paket klub)",
    onlyWithPre: "Baru tercatat bermain dengan ", onlyWithPost: " sejauh ini, jadi analisis partner belum bisa diberikan — perlu match dengan beberapa partner berbeda.",
    noPartner: "Belum ada data partner — pemain ini perlu match dengan beberapa partner berbeda sebelum partner paling cocok bisa ditemukan.",
  },
  partnerRow: { together: (n) => `${n} bareng`, strength: (x) => `kekuatan ${x}`, chemistry: (x) => `chemistry ${x}`, unlock: "buka untuk lihat kecocokan", pairScore: "pair score" },
  empty: { title: "Pilih pemain", body: "Pilih siapa saja dari daftar untuk melihat impact asli, peringkat, dan partner paling cocoknya." },
  roster: {
    club: "Klub",
    subtitle: (prefix, count, rows) => `${prefix} · ${count} pemain · ${rows} match`,
    searchPlaceholder: "Cari pemain di klub ini",
    noneHere: (q) => `Tidak ada pemain cocok “${q}” di sini.`,
    rowSub: (win, apps) => `${win}% menang · ${apps} match`,
    strongestDuo: "Duo terkuat di klub",
    duoLocked: "Satu pasangan berproyeksi tertinggi. Buka Pro untuk lihat siapa.",
    rankedByImpact: "Diperingkat menurut impact",
    gap: "selisih", vsWin: "vs menang%", impact: "impact",
    freeNotePre: "Free menampilkan nama dan win rate. ", freeNoteBold: "Buka Pro", freeNotePost: " untuk mengungkap impact asli tiap anggota dan siapa yang diremehkan.",
  },
  players: {
    all: "Semua pemain",
    sub: (n) => `${n} pemain dari semua klub · cari nama apa pun`,
    searchPlaceholder: "Cari pemain apa pun",
    none: (q) => `Tidak ada pemain cocok “${q}”.`,
    top: "Pemain teratas keseluruhan",
    rowSub: (venue, win) => `${venue} · ${win}% menang`,
  },
  mode: { byClub: "Per klub", byPlayers: "Per pemain" },
  glossaryBtn: "Baru di sini? Baca “Cara membaca ini” dulu",
  analysis: { rosterLabel: "roster", allPlayersLabel: "semua pemain", footerPro: "Prototipe · data nyata dari trekkr.online", footerFree: "Free menunjukkan insight-nya ada — Pro membukanya" },
  boot: { loading: "Memuat data klub langsung…", emptyT: "Belum ada klub", emptyD: "Begitu sebuah venue mencatat match pertamanya di trekkr.online, ia akan muncul di sini.", errT: "Gagal memuat data langsung", errD: "Kami tak bisa menghubungi trekkr.online. Periksa koneksi Anda dan coba lagi.", retry: "Coba lagi" },
};

export const STR = { en, id };

export function initialLang() {
  try {
    const saved = localStorage.getItem("trekkr_lang");
    if (saved === "en" || saved === "id") return saved;
  } catch (e) {}
  try {
    if ((navigator.language || "").toLowerCase().startsWith("id")) return "id";
  } catch (e) {}
  return "en";
}
