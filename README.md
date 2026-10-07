# Tidaluna SongRequest

Plugin do [TidaLuna](https://github.com/Inrixia/TidaLuna), ktory laczy sie ze
[streamer.bot](https://docs.streamer.bot/) przez WebSocket Server i pozwala
widzom Twitcha dodawac piosenki z TIDAL-a do kolejki komenda na chacie.

## Funkcje

- domyslna komenda Twitch chat: `!sr <piosenka albo link TIDAL>`;
- obsluga wyszukiwania w TIDAL oraz linkow/ID trackow TIDAL;
- dodawanie utworow do kolejki TidaLuna;
- opcjonalne auto-play, kiedy kolejka TIDAL-a jest pusta;
- limity maksymalnej dlugosci utworu i liczby oczekujacych requestow per user;
- blokowanie duplikatow w kolejce requestow;
- komenda moderatora do usuwania pending requestow po uzytkowniku albo fragmencie utworu;
- komenda `!wrongsong` do usuwania wlasnego najnowszego pending requestu;
- ignorowanie komend z czatow-gosci Twitch shared chat / wspolnych transmisji;
- opcjonalne odpowiedzi na Twitch chat przez `SendMessage` streamer.bot, wysylane domyslnie skonfigurowanym bot account.

## Konfiguracja streamer.bot

1. W streamer.bot wejdz w **Servers/Clients -> WebSocket Server**.
2. Wlacz **Auto Start**.
3. Zostaw domyslnie:
   - Address: `127.0.0.1`
   - Port: `8080`
   - Endpoint: `/`
4. Jesli streamer.bot zwraca przy tescie czatu `Authentication required`, wlacz/skonfiguruj **Authentication** w WebSocket Server, ustaw haslo i wpisz to samo haslo w ustawieniach pluginu w TidaLuna. Po zmianie hasla kliknij **Reconnect to Streamer.bot**.
5. Upewnij sie, ze streamer.bot jest polaczony z Twitchem.

Plugin subskrybuje event `Twitch.ChatMessage` i sam rozpoznaje komende, wiec nie
musisz tworzyc osobnych akcji/komend w streamer.bot.

## Instalacja w TidaLuna

Nie wklejaj do TidaLuna adresu repozytorium GitHub, np.
`https://github.com/ZeroTenFuras/Tidaluna-SongRequest`. TidaLuna oczekuje
adresu bazowego zbudowanego artefaktu pluginu i sama dopisuje do niego `.json`
oraz `.mjs`.

Po opublikowaniu release `latest` uzyj jednego z tych adresow:

- pojedynczy plugin:
  `https://github.com/ZeroTenFuras/Tidaluna-SongRequest/releases/download/latest/zerotenfuras.song-request`
- plugin store:
  `https://github.com/ZeroTenFuras/Tidaluna-SongRequest/releases/download/latest/store.json`

Adres pojedynczego pluginu celowo nie ma rozszerzenia. TidaLuna pobierze z niego
`zerotenfuras.song-request.json` i `zerotenfuras.song-request.mjs`.

## Ustawienia pluginu

Po instalacji otworz **Luna Settings -> Tidaluna Song Request**:

- **Streamer.bot host/port/endpoint** - dane WebSocket Server.
- **Streamer.bot password** - haslo WebSocket, jesli jest wlaczone.
- **Request command** - domyslnie `!sr`; po wpisaniu np. `!srt` aktywna bedzie tylko `!srt`. Jesli chcesz aliasy, wpisz kilka komend rozdzielonych spacja albo przecinkiem, np. `!srt !sr`.
- **Moderator remove command** - domyslnie `!remove`; tylko moderator/broadcaster moze usunac pending request po loginie/nazwie uzytkownika albo fragmencie tytulu/artysty.
- **Wrong song command** - domyslnie `!wrongsong`; kazdy widz moze usunac tylko swoj najnowszy pending request.
- **Ignore shared chat guest messages** - domyslnie wlaczone; ignoruje komendy z czatow-gosci w shared chat / wspolnych transmisjach, zeby requesty przechodzily tylko z Twojego czatu.
- **Max song length** - limit w sekundach; `0` wylacza limit.
- **Max queued requests per user** - limit oczekujacych requestow; `0` wylacza limit.
- **Send chat replies** - wysyla komunikaty powodzenia/bledu na chat przez skonfigurowany bot account w streamer.bot. Przycisk **Send test chat reply** pozwala sprawdzic samo wysylanie przez Streamer.bot bez requestowania utworu i pokazuje konkretny blad auth, jesli brakuje hasla WebSocket.
- **Allow duplicate requests** - pozwala requestowac ten sam utwor ponownie. Gdy opcja jest wylaczona, duplikaty sa sprawdzane tylko w kolejce requestow pluginu, nie w zwyklej playliscie TIDAL-a.
- **Auto-play when idle** - startuje pierwszy request, gdy TIDAL nic nie gra.

## Przyklady uzycia

```text
!sr daft punk one more time
!sr https://tidal.com/track/123456
!sr 123456
!wrongsong
!remove viewer_login
!remove suspicious title fragment
```

## Development

```bash
pnpm install
pnpm run build
```

Podczas developmentu mozna uzyc:

```bash
pnpm run watch
```

TidaLuna powinna pokazac lokalny sklep DEV z `http://127.0.0.1:3000` albo pojedynczy plugin z `http://127.0.0.1:3000/zerotenfuras.song-request`.
