/** What the banner shows for each state, in Turkish and English. */
import type { Lang } from '../lang';
import type { Event, FailReason, State } from './machine';

export interface BannerAction {
  /** Event dispatched when tapped. */
  event: Extract<Event['type'], 'update' | 'later' | 'openSettings'>;
  label: string;
  primary: boolean;
}

export interface BannerView {
  tone: 'offer' | 'busy' | 'error';
  title: string;
  body: string;
  /** 0..1 while downloading, else null. */
  progress: number | null;
  actions: BannerAction[];
}

const T = {
  en: {
    newVersion: 'New test version available',
    update: 'Update',
    later: 'Later',
    retry: 'Try again',
    openSettings: 'Open settings',
    checking: 'Preparing the update…',
    permTitle: 'One permission first',
    permBody: 'Android will now open a settings screen: turn on “Allow from this source” for this app, then come back with the back button. This is needed only once.',
    settingsTitle: 'Waiting for the settings screen…',
    settingsBody: 'Turn on “Allow from this source”, then come back.',
    downloading: (pct: number) => `Downloading the update… ${pct}%`,
    downloadingBody: (mb: string) => `${mb} MB. Then Android asks “Do you want to update this app?” — tap Update.`,
    installing: 'Confirm on Android’s screen',
    installingBody: 'Android asks “Do you want to update this app?” — tap Update. The app restarts by itself.',
    failTitle: 'Update not installed',
    fail: {
      offline: 'No internet connection. Connect and try again.',
      interrupted: 'The download was interrupted. Try again.',
      server: 'The update could not be downloaded from GitHub right now. Try again later.',
      size: 'The downloaded file has the wrong size (check failed), so it was not installed. Try again.',
      checksum: 'The downloaded file did not pass the SHA-256 check, so it was not installed. Try again.',
      storage: 'There is not enough free space on the phone for the update.',
      permission: 'Without “Allow from this source” Android does not let this app install its update. Try again to open the setting.',
      cancelled: 'You left Android’s install screen, nothing was changed. Try again whenever you like.',
      install: 'Android could not install the update. Try again; if it keeps failing, install the APK from the release page by hand.',
    } satisfies Record<FailReason, string>,
  },
  tr: {
    newVersion: 'Yeni test sürümü var',
    update: 'Güncelle',
    later: 'Sonra',
    retry: 'Tekrar dene',
    openSettings: 'Ayarları aç',
    checking: 'Güncelleme hazırlanıyor…',
    permTitle: 'Önce bir izin gerekiyor',
    permBody: 'Android şimdi bir ayar ekranı açacak: bu uygulama için “Bu kaynaktan izin ver”i aç, sonra geri tuşuyla dön. Bu yalnız bir kez gerekir.',
    settingsTitle: 'Ayar ekranı bekleniyor…',
    settingsBody: '“Bu kaynaktan izin ver”i aç, sonra geri dön.',
    downloading: (pct: number) => `Güncelleme indiriliyor… %${pct}`,
    downloadingBody: (mb: string) => `${mb} MB. Sonra Android “Bu uygulamayı güncellemek istiyor musunuz?” diye sorar — Güncelle’ye dokun.`,
    installing: 'Android ekranında onayla',
    installingBody: 'Android “Bu uygulamayı güncellemek istiyor musunuz?” diye soruyor — Güncelle’ye dokun. Uygulama kendiliğinden yeniden açılır.',
    failTitle: 'Güncelleme kurulmadı',
    fail: {
      offline: 'İnternet bağlantısı yok. Bağlanıp tekrar dene.',
      interrupted: 'İndirme yarıda kesildi. Tekrar dene.',
      server: 'Güncelleme şu an GitHub’dan indirilemedi. Biraz sonra tekrar dene.',
      size: 'İnen dosyanın boyutu yanlış (denetim geçmedi), bu yüzden kurulmadı. Tekrar dene.',
      checksum: 'İnen dosya SHA-256 denetiminden geçmedi, bu yüzden kurulmadı. Tekrar dene.',
      storage: 'Telefonda güncelleme için yeterli boş yer yok.',
      permission: '“Bu kaynaktan izin ver” açılmadan Android bu uygulamanın güncellemeyi kurmasına izin vermez. Ayarı açmak için tekrar dene.',
      cancelled: 'Android’in kurulum ekranından çıkıldı, hiçbir şey değişmedi. İstediğin zaman tekrar dene.',
      install: 'Android güncellemeyi kuramadı. Tekrar dene; sürerse APK’yı sürüm sayfasından elle kur.',
    } satisfies Record<FailReason, string>,
  },
} as const;

export function describeState(s: State, lang: Lang): BannerView | null {
  const t = T[lang];
  const act = (event: BannerAction['event'], label: string, primary: boolean): BannerAction => ({ event, label, primary });
  switch (s.kind) {
    case 'idle':
    case 'hidden':
      return null;
    case 'available':
      return {
        tone: 'offer',
        title: t.newVersion,
        body: s.offer.notes || s.offer.versionName,
        progress: null,
        actions: [act('update', t.update, true), act('later', t.later, false)],
      };
    case 'checkingPermission':
      return { tone: 'busy', title: t.checking, body: s.offer.notes || s.offer.versionName, progress: null, actions: [] };
    case 'needPermission':
      return { tone: 'offer', title: t.permTitle, body: t.permBody, progress: null, actions: [act('openSettings', t.openSettings, true), act('later', t.later, false)] };
    case 'awaitingSettings':
      return { tone: 'busy', title: t.settingsTitle, body: t.settingsBody, progress: null, actions: [] };
    case 'downloading': {
      const total = s.total > 0 ? s.total : s.offer.size;
      const progress = Math.max(0, Math.min(1, s.received / total));
      return {
        tone: 'busy',
        title: t.downloading(Math.floor(progress * 100)),
        body: t.downloadingBody((total / 1024 / 1024).toFixed(1)),
        progress,
        actions: [],
      };
    }
    case 'installing':
      return { tone: 'busy', title: t.installing, body: t.installingBody, progress: null, actions: [] };
    case 'failed':
      return { tone: 'error', title: t.failTitle, body: t.fail[s.reason], progress: null, actions: [act('update', t.retry, true), act('later', t.later, false)] };
  }
}
