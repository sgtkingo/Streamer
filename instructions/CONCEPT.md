Vytváříme aplikaci typu Netflix - knihovnu filmů a seriálů která se streamuje ze serveru přes API. To co bude aplikaci oddělovat od podobných, bude schopnost tyto knihovny autonomně skládat a používat webscraping + local AI agent na třízení a labelování. 


---------------------------------------------------------------------------------------------------
Aplikace bude mít dvě vstrvy: 

1. UI a knihovní vrstva: tvorba uživatelsky přívětivých UI knihoven a seriálů, skládání user-profilů, návrh co si dnes pustit dle preferencí, období (jaro, léto, podzim, etc). Zde je třeba napojení na filmové databáze, univerzání rozhraní a dfaultní tenant bude: ČSFD (https://www.csfd.cz/), IMDb (https://www.imdb.com/) a Rotten Tomatoes (https://www.rottentomatoes.com/).

2. API backend: Připojení na reálný streamovací server, univerzální rozhraní asynchronizase s první vrstvou. Defaultně podporovaný tenant bude Webshare.cz. 

----------------------------------------------------------------------------------------------------
Synchronizace mezi první a druhou vstvou bude probíhat následovně: 
1. Apka si natáhne celý mirror napojené filmové databáze, a pomocí místního AI agenta je začne párovat s tím co reálně najde streamovacím API serveru. Zde musí dojít k výběru správného streamovacího formátu (např. rozlišení dle obrazovky, bitrate/velikost dle rychlosti připojení apod., jazyk dle preferencí uživatele (db/titulky)). Jeden titul by měl nabídnou více streamovacích možností, možnosti schovej za "tři tečky". 

2. Lokální AI agent + třídící logika začne spárované tituly třídit a labelovat do samostatných sekcí a knihoven. Tyto sekce a knihovny mohou být dynamické. 

3. Synchronizace by měla probíhat vždy v pozadí, případně na vyžádání uživatelem. Uivatel by měl vždy vidět zda je knihovna aktuální. 
----------------------------------------------------------------------------------------------------
Zodpovědnosti a kompetence lokálního agenta:

Krom výše popsaných kompetencí, bude agent asistovat při scrapování internetu a nabízet novinky, co ted letí, a také nabízet tímto způsobem filmy dle profilu a preferencí uživatele - popsaných v USER.md. 
----------------------------------------------------------------------------------------------------
Aplikace by měla být maximálně multiplatformní - web-based, ale agent by měl běžet lokálně. Aplikace by měla být v angličtině, jako primární jazyk, alternativně v Češtině a Němčině. 