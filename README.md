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
- opcjonalne odpowiedzi na Twitch chat przez `SendMessage` streamer.bot.

## Konfiguracja streamer.bot

1. W streamer.bot wejdz w **Servers/Clients -> WebSocket Server**.
2. Wlacz **Auto Start**.
3. Zostaw domyslnie:
   - Address: `127.0.0.1`
   - Port: `8080`
   - Endpoint: `/`
4. Jesli wlaczasz **Authentication** albo chcesz wysylac odpowiedzi na chat,
   ustaw haslo i wpisz je w ustawieniach pluginu w TidaLuna.
5. Upewnij sie, ze streamer.bot jest polaczony z Twitchem.

Plugin subskrybuje event `Twitch.ChatMessage` i sam rozpoznaje komende, wiec nie
musisz tworzyc osobnych akcji/komend w streamer.bot.

## Ustawienia pluginu

Po instalacji otworz **Luna Settings -> Tidaluna Song Request**:

- **Streamer.bot host/port/endpoint** - dane WebSocket Server.
- **Streamer.bot password** - haslo WebSocket, jesli jest wlaczone.
- **Request command** - domyslnie `!sr`.
- **Max song length** - limit w sekundach; `0` wylacza limit.
- **Max queued requests per user** - limit oczekujacych requestow; `0` wylacza limit.
- **Send chat replies** - wysyla komunikaty powodzenia/bledu na chat.
- **Allow duplicate requests** - pozwala requestowac ten sam utwor ponownie.
- **Auto-play when idle** - startuje pierwszy request, gdy TIDAL nic nie gra.

## Przyklady uzycia

```text
!sr daft punk one more time
!sr https://tidal.com/track/123456
!sr 123456
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

TidaLuna powinna pokazac lokalny sklep DEV z `http://127.0.0.1:3000`.
