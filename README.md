# Hverdag

Min app til overblik over skole, arbejde, træning og venner.
En webapp, der lægges på iPhonens hjemmeskærm. Alle data gemmes kun på telefonen.

## Filer

| Fil | Hvad den gør |
|---|---|
| `index.html` | Selve siden – skelettet |
| `style.css` | Udseende, farver, lyst/mørkt tema |
| `app.js` | Al logikken: data, beregninger, visninger |
| `sw.js` | Gør at appen åbner uden internet |
| `manifest.webmanifest` | Navn og ikon på hjemmeskærmen |
| `icons/` | App-ikoner |

## Sådan regner appen

- **Ledig tid** pr. dag = (dagslut − dagstart) − tid til mad/transport − alt der står i kalenderen.
- **Skolearbejde**: en opgaves resterende timer fordeles jævnt fra i dag til dagen før deadline.
- **Ugebelastning** = skolearbejde ÷ ledig tid. Grøn ≤ 50 %, gul ≤ 80 %, rød derover.
  Hver deadline tjekkes også for sig, så weekendens fritid ikke "redder" en opgave, der skal afleveres fredag.
- Er ugen gul eller rød, foreslår appen hvad der kan flyttes: først fleksibel træning, så faste træninger, så sociale planer.
  Appen flytter aldrig noget selv.

Grænserne kan justeres øverst i `app.js` (`LOAD_OK`, `LOAD_TIGHT`, `SIZES`).

## Faser

1. ✅ MVP: I dag, uge, opgaver, faste ugepunkter, ugebelastning, backup
2. ✅ Import af VIA-skema fra itslearning (Garmin-plan kommer senere)
3. (Delvist) Opgavetyper: aflevering, læs, lav, forberedelse ✅ – planlægger: forslag til skoleblokke, delopgaver, konflikter (fx langtur før deadline)
4. Sociale planer med advarsel + søndagsgennemgang
5. Synk til Mac, notifikationer
