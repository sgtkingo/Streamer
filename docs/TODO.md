- Profil ikona nic nedelá - měla by se objevit nabídka s: nastavení, preference, můj účet, statistiky a logout / změnit účet. Zatím tyto stránky drž jako plaehldery s komentářem. 
-- Nastavení: Umožnuje nastavit preferovaný jazyk, titulky, zvuk (zvukový výstup), přehrávač, a integrace (API, odhlášení, změny údajů)
-- Preference: Uživatelské preference jako seznam kategorií a virtuální profil v podobě promptu který lze přepsat. Tento prompt by měl popisovat co má uživatel rád. 
-- Můj účet: Změna loginu, hesla, profil foto 
-- Statistiky: Kolik filmů, kolik hodin, nejoblíbenější atd
-- Logout/Změnit účet: Zpět na hlavní stránku přihlášení a odhlášení uživatele. Hlavní stránka by měla obsahovat 5 medailonků profilů.  

- Aktuálně každý nový vyhledávací dotaz tvoří další položku v gobální chat relaci - mělo by to fungovat tak, že vyhledávání vždy vyvolá novou relaci. V aktuálně živé relaci by měl být možný chat se StreamerAI, za učelem diskuze nad výsledky, chat by se měl vždy doptat uživatele zda je to to, co si představoval a uživatel mu může odpovědět. Pokud uživatel bude mít námitky, agent upraví zadaní a pokusí se vyhledat něco co lépe odpovídá - v rámci relace. Tento chat dej jako plovoucí bublinu do spodní části obrazovky, která neinvazivně překrývá obsah a uživatel si ho může prohlížet. Po novém hledání by měla stránka vždy rolovat na "A considered shortlist"

- Při kliknutí na "Find something" by se měl vyvolat efekt kdy buttonem projede odlesk ve tvaru šipky, a prohlížeč udělat scrolldown na výsledek. Při najetí myší na button by měl svítit všemi barvami, do měkka a ztracena. 

- U vyhledávácío procesu by měla u každého kroku běžet mini animace ať uživatel vidí že běží. Klidně tam vlož mezi jednotlivé kroky krátké pauzy at se efekty projeví a uživatel má dojem že to "plynule funguje". 

- Př dohledávání na websharu a používání fůze "co našel agent a co databáze" zkus nastavit similarity práh trošku benevoletněji, at to najde více streamů. Toto nastavení se pak mělo objevit i jako uživatelské a jít s měnit. 

- Kliknutí a položku v horním menubaru by mělo vyvolat efekt scrolldown, ne skok 

- Chyby a hlášení by se měli projevit jako plovoucí bubliny s překrytím na horní straně obrazovky, uprostřed. 

- Při najetí myší na dláždici by mělo UI vyvolat efekt "3D vysunutí" a mírné zvětšení dláždice + krátký zvuk "tik"

- Při najetí myší na dláždici by mohlo UI po jedné vteřině začít odpočítávat zmenšujícím se symetrickým centrálním barem spuštění ukázky přímo v dláždici, defaultně mutnuté

- UI bude defaultně měnit hlavní téma dle sezony (jaro, léto, podzim, zima, Vánoce, Silvestr), včetně decetního živého pozadí, třeba padání rozmazaných barevných listů v pozadí. Uživvatel tohle bude moct změnit v nastavení "Theme" (roletka), horní panel, vedle profile medailonek. Další téma může být Cinemaic, což bude odpovídat aktuálnímu black/white. 

- Logo by mohlo být "kabel s zástrčkou ve tvaru S"

- Seriály nemají Play (defaulrně od 1. dílu) nebo Continue (další díl od posledního či rozkukaný akuální), seriály by také nakonci měli automaticky začít odpočítávat přehrání dalšího dílu. 

- Seriály by měli mít po klknuí detail a rozdělení do sérií a episod 

- Seriály by měli mít hloukové vyhledávání na pozadí, které přidá další episody, do té doby by měli svítit žlutě a psát "• searching...". Podobně i filmy které se nepodaří hned najít. 

- Proč vyhledávání "Naruto" nic nenajde, když na TMDB i Websharu je? 

- Pokud uživatel zadá např. "Něco co jsem neviděl" tak by si agent měl zažádat o seznam filmů které už uživatel viděl a vyhnout se jim. Pokud je konktextové okno malé, komprimovat. 

- Má agent SOUL, SKILLS apod? 

V návaznosti na to by se mělo u dláždic vypsat jaký je dostupný jazyk, s tím že: 
- Primární je vždy uživatelský jazyk který nastavil na prostředí, třeba CZ 
- Sekundární se hledá ENG, s titulky v lokálním jazyce 
- Pokud není nalezena ani jedna varianta, objeví se dostupný jazyk, a pokud nemá tiulky tak s vykřičníkem 
- Příklad:
  - Film je v CZ i ENG s titulky, UI : CZ, ENG (sub)
  - Film je jen ENG, ale s titulky, UI: ENG (sub)
  - Film je  v ENG bez titulku, UI: ENG
  - Film je jen v japonštině, ale má sub, UI: JAP (sub)
  - Film je japonsky, bez titulku, UI: JAP (!)