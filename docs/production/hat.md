# Üretim hattı: işletme kılavuzu

Aşamaların ve kapıların kaynağı `docs/superpowers/specs/2026-11-16-uretim-sistemi-design.md`
(bölüm 4). Bu belge onu günlük komutlara çevirir. Bir aşamanın kapısı geçilmeden sonrakine
geçilmez. Rol görev tanımları: `docs/production/roles/` (İngilizce, yöneticinin alt agent'a
yapıştırdığı şablonlar). Kural: kodu yazan agent kendi işini onaylamaz.

Komutların tümü depo kökünden çalışır, aksi belirtilmedikçe.

| # | Aşama | Rol | Çıktı | Kapı |
|---|---|---|---|---|
| 0 | Sinyal | analist | `docs/research/data/crazygames-<tarih>.jsonl` | veri <= 30 gün |
| 1 | Boşluk doğrulama | analist | mekanik başına mağaza kanıtı | rekabet YOK/ZAYIF, kanıtıyla |
| 2 | Konsept | tasarımcı | konsept + puan kartı, sonra `games/<slug>/GAME.md` | puan >= 70 |
| 3 | Çekirdek döngü | yapımcı | `src/sim/` + birim testleri | testler yeşil, döngü anlaşılır |
| 4 | Dikey kesit | yapımcı | oynanabilir oyun | `npm run gate -- <slug>` yeşil |
| 5 | Bağımsız inceleme | inceleyici + oynanış testçisi | iki rapor | engelleyici bulgu yok |
| 6 | Web yumuşak lansman | insan | portal derlemesi | insan kararı |
| 7 | Mağaza paketi | insan | Android/iOS projesi | insan kararı |
| 8 | Canlı ölçüm | insan + yönetici | tutunma/oturum verisi | devam / durdur |

Mimar (`architect.md`) hattın bir aşaması değildir: ortak çekirdeği (`packages/core`) değiştirmek
gerektiğinde ayrı bir görev olarak çağrılır (aşağıda "Çekirdek değişikliği").

## Aşama 0: Sinyal

- **Kim:** analist (ya da yönetici).
- **Girdi:** yok. Ağ erişimi: `www.crazygames.com`.
- **Önce veri tazeliğine bak:**
```text
python3 -c "import glob,datetime,re;f=sorted(glob.glob('docs/research/data/crazygames-*.jsonl'))[-1];d=datetime.date.fromisoformat(re.search(r'\d{4}-\d\d-\d\d',f).group());print(f,(datetime.date.today()-d).days,'gün')"
```
  30 günden eskiyse yenile.
- **Yenile:** `scrape.py` çıktıyı bulunduğu klasöre yazar, bu yüzden `tools/research` içinde çalıştır
  (`q.py` oradaki `games.jsonl`'i arar). Yaklaşık 1,5 dakika sürer; 201 etiket sayfası ve ~1.600 oyun sayfasını okur.
```text
cd tools/research && python3 scrape.py        # tags.json, lists.json, games.jsonl üretir (git-ignored)
```
- **Anlık görüntü:** `games.jsonl` açıklamaları da içerir ve git'e girmez. Depoya giren sürüm, açıklamasız
  ve mağaza bağlantıları doğru/yanlış olarak saklanan bir kopyadır. Üretmek için (kökten):
```text
python3 - <<'E'
import json,datetime
K=['slug','name','rating','up','down','category','tags','play','ios','steam','orientation','launch','iosF','andF','iap','mp','original','likes','plays']
out=f"docs/research/data/crazygames-{datetime.date.today()}.jsonl"
with open(out,'w') as f:
    for l in open('tools/research/games.jsonl'):
        g=json.loads(l); r={k:g.get(k) for k in K}
        for b in ('play','ios','steam'): r[b]=bool(r[b])
        f.write(json.dumps(r)+'\n')
print(out)
E
```
  Bu betik, mevcut anlık görüntüyle aynı alanları üretir (1.636 satırda oy sayıları dışında fark çıkmadı; elle denendi).
- **Sorgulama** (`q.py`; `tools/research/games.jsonl` varsa onu, yoksa en yeni anlık görüntüyü okur):
```text
python3 tools/research/q.py tags                     # her etiket: oyun sayısı, toplam oy
python3 tools/research/q.py tag incremental 20000    # tüm etiketlere sahip oyunlar, oya göre, en az 20.000 oy
python3 tools/research/q.py name "Seeing Things"     # tam kayıt
```
  Çıktıdaki `P`/`I`/`S` sitenin listelediği mağaza bağlantısıdır; `-` yokluğun kanıtı değildir.
  `| head` ile keserken görünen `BrokenPipeError` zararsızdır.
- **Çıktı:** tarihli anlık görüntü dosyası.
- **Kapı:** en yeni `crazygames-<tarih>.jsonl` dosyasının tarihi bugünden en çok 30 gün önce.
  Araç bunu denetlemez; yukarıdaki komut ya da yönetici bakar.

## Aşama 1: Boşluk doğrulama

- **Kim:** analist (`roles/analyst.md`). Yanlış "boşluk" pahalı olduğu için bu işi ucuz modele verme.
- **Girdi:** aşama 0 verisi. Aday süzme ölçütü (araştırma raporundan): tek kişilik, 2D yapılabilir,
  telefonda bir ya da iki başparmakla oynanır, puan >= 8,9.
- **Komutlar** (ağ: `itunes.apple.com`, `play.google.com`). Mekanik başına 2–4 farklı sorgu, artı
  tarayıcı oyununun kendi adı:
```text
python3 tools/research/store.py ios  "<arama>" [limit]    # ABD App Store, varsayılan 15
python3 tools/research/store.py play "<arama>" [limit]    # ABD Google Play, varsayılan 10
```
  Bilmen gerekenler (kodu okuyarak ve çalıştırarak doğrulandı):
  - `ios` yalnızca türü "Games" olan sonuçları yazar; hiç satır çıkmaması "rakip yok" demek olmayabilir,
    sorguyu değiştirip tekrar dene. Değerlendirme sayısı ve puanı verir.
  - `play` indirme aralığı (`10K+` gibi) ve puan verir, değerlendirme sayısı vermez; açıklama çoğu zaman boştur.
    Eşleşmeler başlığa ve indirme aralığına dayanır.
  - İkisi de yalnızca ABD mağazasıdır ve ilk 8–20 sonuçtur. Başka adla satılan rakip kaçabilir.
- **Sınıflama** (araştırma raporundaki tanım): **YOK** gerçek karşılık bulunamadı; **ZAYIF** karşılıklar var ama
  hepsi iOS'ta < 50 bin değerlendirme ve Play'de < 1 M indirme, ya da puanı <= 4,0; **DOYMUŞ** güçlü rakip var.
- **Çıktı:** `docs/research/<tarih>-<konu>-kanit.md` (ad kuralı bu belgeye aittir, araç dayatmaz): mekanik başına
  kullanılan sorgular, rakip satırları (ad, değerlendirme/indirme, puan), sınıf, güven (düşük/orta/yüksek) ve
  bilinen kör noktalar.
- **Kapı:** sınıf YOK ya da ZAYIF ve kanıtı yazılı. DOYMUŞ ise mekanik elenir (aşağıda "Öldürme ve rafa kaldırma").

## Aşama 2: Konsept

- **Kim:** tasarımcı (`roles/designer.md`). Tasarım belgesinde bu iş yöneticinin "tasarım" işidir;
  yönetici kendisi yapabilir ya da devredebilir.
- **Girdi:** aşama 1 kanıtı, araştırma raporu, `docs/production/concepts/*.md` (biçim örneği),
  `packages/core/README.md` (çekirdeğin neyi kolay, neyi zor yaptığı).
- **Adım 1, konsept:** `docs/production/concepts/<slug>.md` yaz (İngilizce; mevcut üç konsept gibi) ve puan kartını doldur:

  | Ölçüt | Ağırlık |
  |---|---|
  | Tarayıcı talebi (oy, puan, yenilik) | 25 |
  | Mağaza boşluğu (kanıt gücüyle) | 25 |
  | Telefona uygunluk (tek el, 2–5 dk oturum) | 15 |
  | Tek geliştirici/agent ile yapılabilirlik | 15 |
  | Tutundurma kancası (ilerleme, günlük dönüş) | 10 |
  | Kodla çizilen görsellerle iyi görünme | 10 |

  Her ölçütün puanı gerekçesiyle yazılır; toplam 100 üzerindendir. Toplamı bir araç hesaplamaz, elle topla.
- **Kapı kontrolü:** toplam >= 70 değilse klasör açılmaz (aşağıda). >= 70 ise:
- **Adım 2, iskele** (yalnızca bir kişi/agent, `package-lock.json` değişir):
```text
npm run new-game -- <slug> "<Başlık>" [portrait|landscape]
```
  slug biçimi `^[a-z][a-z0-9-]{1,30}$`; `games/<slug>/` yazılır ve `npm install` çalışır. Çıktıdaki son satır sıradaki adımı söyler.
  `games/<slug>/GAME.md` şablonunu doldur: tek sayfa, çekirdek döngü 30 saniyelik, puan kartı dahil.
  Konsept dosyasındaki ayrıntıyı tekrarlama, ona bağlantı ver.
- **Çıktı:** konsept dosyası + dolu `games/<slug>/GAME.md`.
- **Kapı:** puan >= 70.

## Aşama 3: Çekirdek döngü

- **Kim:** yapımcı (`roles/builder.md`).
- **Girdi:** `GAME.md`, konsept, `packages/core/README.md`, referans olarak `games/ornek`.
- **Yöntem:** önce test, sonra kod; yalnızca `games/<slug>/src/sim/` (saf TypeScript, Phaser yok) ve `tests/unit/`.
- **Komutlar:**
```text
npm run test -w games/<slug>           # vitest run
npm run typecheck -w games/<slug>      # tsc
```
- **Çıktı:** `src/sim/*.ts` ve `tests/unit/*.test.ts`.
- **Kapı:** testler yeşil ve tip denetimi temiz. "Döngü 30 saniyede anlaşılır" kısmını araç denetlemez:
  yönetici `GAME.md` içindeki 30 saniyelik döngüyü sim testlerinin adlarıyla karşılaştırır; asıl sınama
  aşama 5'teki oynanış testidir.

## Aşama 4: Dikey kesit

- **Kim:** yapımcı.
- **Girdi:** aşama 3 çıktısı.
- **İş:** sahneler (`src/scenes/`), dokular (`src/textures.ts`), metinler (`src/strings.ts`, `tr` + `en`), kayıt (`src/save.ts`),
  ses ve his çekirdeğin sağladığıyla; menü, oyun, sonuç. Test kancası (`testState()`/`testActions()`) ve
  `tests/e2e/smoke.spec.ts` oyuna uyarlanır.
- **Komutlar:**
```text
npm run gate -- <slug>      # çekirdek + bu oyun; ilk hatada durur
npm run dev -w games/<slug> # elle bakmak için (işin bitince kapat)
```
  Kapı sırası: çekirdek (şablon sapması, README parçaları, tip, lint, birim) sonra oyun: tip, lint, birim, derleme,
  boyut bütçesi (<= 550 KB gzip JS, <= 5 MB toplam), tarayıcı duman testi (telefon boyutu, `?test=1&seed=1`,
  konsol hatası yok).
- **Çıktı:** oynanabilir oyun; ekran görüntüleri `games/<slug>/tests/artifacts/` (git-ignored).
- **Kapı:** `npm run gate -- <slug>` yeşil. Ek olarak yapımcı bu görüntüleri açıp bakar ve gerçek işaretçi girdisiyle
  oyunun oynandığını ayrıca gösterir: duman testi oyunu piksele tıklamadan test kancasıyla sürer, yani dokunma
  yolunun çalıştığını kanıtlamaz. Ayrıntı `roles/builder.md` içinde.

## Aşama 5: Bağımsız inceleme

- **Kim:** inceleyici (`roles/reviewer.md`) ve oynanış testçisi (`roles/playtester.md`). İkisi de oyunu yazan
  agent'tan farklıdır; ikisi birbirinden de bağımsız çalışır (paralel gönderilebilir).
- **Girdi:** `games/<slug>/` (yalnızca okuma; testçi derlenmiş oyunu açar), `GAME.md`, çekirdek README'si.
- **Komutlar:** inceleyici kapıyı yeniden çalıştırıp sonucu doğrular; testçi oyunu derleyip `vite preview` ile
  sunar ve Playwright ile telefon boyutunda gerçek işaretçi girdisiyle oynar (komutlar rol belgelerinde).
```text
npm run build -w games/<slug>
```
- **Çıktı:** iki rapor. İnceleyici: engelleyici / düzeltilmeli / not diye sınıflı bulgular, dosya ve satırla.
  Testçi: ilk 60 saniye değerlendirmesi, ekran görüntüsü yolları, somut bulgular. Yönetici raporları istenirse
  `docs/production/reviews/<slug>-<tarih>.md` olarak saklayabilir (zorunlu değil).
- **Kapı:** iki raporda da engelleyici yok. Engelleyici varsa yapımcı düzeltir; düzeltmeyi inceleyici (yazan değil)
  yeniden gözden geçirir, kapı yeniden çalışır.

## Aşama 6: Web yumuşak lansman

- **Kim:** insan (portal hesabı gerekir). Adımlar `docs/production/yayin-listesi.md` bölüm 1.
- **Kapı:** insan kararı. Bu oturumda uygulanmaz.

## Aşama 7: Mağaza paketi

- **Kim:** insan (mağaza hesapları, imza anahtarı, iOS için Mac). Adımlar `yayin-listesi.md` bölüm 2–5.
- **Kapı:** insan kararı. Bu oturumda uygulanmaz; Android/iOS derlemesi hiç çalıştırılmadı.

## Aşama 8: Canlı ölçüm

- **Kim:** insan toplar, yönetici karar verir.
- **Durum:** veri kaynağı yok. `platform.track()` hiçbir bağdaştırıcıda bir yere göndermiyor (web: kayıt, CrazyGames:
  boş, Capacitor: boş). Ölçüm için portalın kendi panosu ya da yeni bir analitik bağdaştırıcısı (çekirdek değişikliği)
  gerekir.
- **Kapı:** devam / durdur kararı. Tasarım belgesi eşik vermiyor; eşikleri (örn. 1. gün dönüş, oturum süresi)
  yönetici ilk ölçümden önce yazıya dökmeli, yoksa karar sonradan kendi kendine haklı çıkarılır.

## Öldürme ve rafa kaldırma

Bir fikir şu durumlarda hattan çıkar:

1. **Puan < 70** (aşama 2). Klasör açılmaz. Konsept dosyası kalır, backlog'a işlenir.
2. **Güçlü rakip bulundu.** Aşama 1'de DOYMUŞ sınıfı; ya da sonradan (inceleme, lansman öncesi yeniden kontrol, canlı
   ölçüm sırasında) aynı mekanikte güçlü bir mağaza rakibi çıkarsa. Raporun tanımına göre ZAYIF eşiklerinin
   (iOS < 50 bin değerlendirme, Play < 1 M indirme ya da puan <= 4,0) üstünde, puanı da iyi bir rakip "güçlü"dür;
   rapordaki elenme örnekleri 50 M+ indirme, 100 B+ ve üzeri iOS değerlendirmesi gibi.
3. **Aşama 8'de durdur** kararı.

Ne yapılır:

- `docs/production/backlog.md` içine girdi eklenir: mekanik, durum (Yedek / Beklemede / Elendi), neden (sayılarla ve
  kaynak dosya ile), neyin kanıtı onu geri getirir. Girdi, kararı veren kişinin işidir; bir agent kendi işini
  öldürdüyse yönetici girdiyi okur.
- Kod yazılmışsa karar yönetici verir: (a) klasör kalır ve kapı yeşil tutulur ya da (b) `games/<slug>/` silinir
  (git geçmişinde kalır) ve `npm install` ile `package-lock.json` düzeltilir. Dikkat: `npm run gate` (slug'sız)
  `oyun.config.json` olan her klasörü çalıştırır; kırık bir rafa kalkmış oyun herkesin kapısını kırar.
- Puan 70'in hemen altında kalıp bir ölçütü düzeltilebilirse (örn. yapılabilirlik) "Yedek" olarak yazılır, hemen
  yeniden puanlanmaz.

## Çekirdek değişikliği

Bir oyun çekirdekte eksik bir şey istiyorsa (müzik çalar, yeni platform yöntemi, yeni widget) yapımcı bunu
kendisi yapmaz: yöneticiye öneri yazar. Yönetici mimarı (`roles/architect.md`) çağırır. Mimar işi bittiğinde
`packages/core/README.md` güncellenir (içindeki `ts` blokları kapıda tip denetiminden geçer) ve tüm oyunlar için
`npm run gate` çalıştırılır. Şablonu değiştirmek gerekiyorsa `games/ornek` elle düzenlenmez:
`npm run new-game -- ornek "Örnek" --force`.
